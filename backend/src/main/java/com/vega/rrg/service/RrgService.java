package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.ReplayDatasetResult;
import com.vega.rrg.model.RrgPoint;
import com.vega.rrg.model.RrgTimeframeConfig;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RrgService {

    @Autowired
    private CandleService candleService;

    private static final Map<String, RrgTimeframeConfig> CONFIGS = Map.of(
        "1min", new RrgTimeframeConfig(10, 25, 60_000L, 60, true, 5),
        "5min", new RrgTimeframeConfig(10, 25, 300_000L, 48, true, 3),
        "15min", new RrgTimeframeConfig(12, 30, 900_000L, 32, true, 3),
        "30min", new RrgTimeframeConfig(14, 30, 1800_000L, 24, true, 2),
        "1h", new RrgTimeframeConfig(14, 40, 3600_000L, 20, true, 2),
        "1d", new RrgTimeframeConfig(14, 30, 86400_000L, 10, false, 1),
        "1w", new RrgTimeframeConfig(10, 30, 7 * 86400_000L, 10, false, 1),
        "1mo", new RrgTimeframeConfig(6, 18, 10 * 86400_000L, 10, false, 1)
    );

    @Autowired
    private RrgWindowCalculator windowCalculator;

    @Autowired
    private SectorComputationPlanner planner;
    
    @Autowired
    private RrgSnapshotCache cache;

    private final java.util.concurrent.ExecutorService selectiveComputeExecutor = 
        java.util.concurrent.Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors() / 2)
        );

    public static RrgTimeframeConfig getConfig(ParsedTimeframe tf) {
        int emaSmoothing = (tf.getUnit() == com.vega.rrg.model.TimeUnit.MINUTE || tf.getUnit() == com.vega.rrg.model.TimeUnit.HOUR) ? 3 : 1;
        int smaPeriod = 14;
        if (tf.getUnit() == com.vega.rrg.model.TimeUnit.WEEK) smaPeriod = 10;
        else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.MONTH) smaPeriod = 6;
        else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.YEAR) smaPeriod = 5;

        int minPeriods = smaPeriod * 2 + emaSmoothing;
        long alignmentToleranceMs = 60_000L * tf.getBaseCandleMultiplier();
        int defaultTrailLength = 10;
        if (tf.getUnit() == com.vega.rrg.model.TimeUnit.MINUTE) {
            if (tf.getMultiplier() == 1) defaultTrailLength = 60;
            else if (tf.getMultiplier() == 5) defaultTrailLength = 48;
            else if (tf.getMultiplier() == 15) defaultTrailLength = 32;
            else if (tf.getMultiplier() == 30) defaultTrailLength = 24;
        } else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.HOUR) {
            defaultTrailLength = 20;
        }

        return new RrgTimeframeConfig(smaPeriod, minPeriods, alignmentToleranceMs, defaultTrailLength, tf.isIntraday(), emaSmoothing);
    }

    public List<RrgPoint> calculateRrg(List<String> allSectors, String benchmark, ParsedTimeframe parsedTf, int trailLength, boolean normalized, boolean minimalWindowResampling) {
        return calculateRrg(allSectors, benchmark, parsedTf, trailLength, normalized, minimalWindowResampling, null, null, null, false, false);
    }

    public List<RrgPoint> calculateRrg(List<String> allSectors, String benchmark, ParsedTimeframe parsedTf, int trailLength, boolean normalized, boolean minimalWindowResampling,
                                       List<String> watchlist, String selectedSector, String hoveredSector, boolean watchlistOnlyResampling, boolean replayMode) {
        long startTotal = System.currentTimeMillis();
        
        SectorComputationPlanner.SectorComputationPlan plan = planner.plan(
                allSectors, watchlist, selectedSector, hoveredSector, watchlistOnlyResampling, replayMode, cache,
                benchmark, parsedTf, trailLength, normalized
        );

        int requiredRawCandles = -1;
        if (minimalWindowResampling && !plan.fullCompute.isEmpty()) {
            long startCalc = System.currentTimeMillis();
            requiredRawCandles = windowCalculator.calculateRequiredRawCandles(parsedTf, trailLength, getConfig(parsedTf));
            long calcMs = System.currentTimeMillis() - startCalc;
        }
        
        final int finalRequiredRawCandles = requiredRawCandles;

        long startAggr = System.currentTimeMillis();
        Optional<ProtoCandleFile> benchmarkFile = finalRequiredRawCandles > 0 && !plan.fullCompute.isEmpty()
            ? candleService.loadRecentCandles(benchmark, parsedTf, finalRequiredRawCandles)
            : candleService.loadCandles(benchmark, parsedTf);
            
        List<Long> benchmarkTimestamps = new ArrayList<>();
        Map<Long, Double> benchmarkCloses = new TreeMap<>();
        List<ProtoCandle> benchmarkCandles = new ArrayList<>();

        if (benchmarkFile.isPresent()) {
            benchmarkCandles = benchmarkFile.get().getCandlesList();
            benchmarkTimestamps = benchmarkCandles.stream()
                    .map(ProtoCandle::getEpochMillis)
                    .collect(Collectors.toList());
            benchmarkCloses = benchmarkCandles.stream()
                    .collect(Collectors.toMap(ProtoCandle::getEpochMillis, ProtoCandle::getClose, (a, b) -> a, TreeMap::new));
        }

        List<RrgPoint> results = new ArrayList<>();
        long now = System.currentTimeMillis();

        // 1. Process cachedOnly sectors
        for (String sector : plan.cachedOnly) {
            Optional<RrgPoint> cachedOpt = cache.get(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector);
            if (cachedOpt.isPresent()) {
                RrgPoint point = cachedOpt.get();
                point.setStale(true);
                results.add(point);
            }
        }

        // 2. Process fullCompute sectors concurrently using custom executor
        if (!plan.fullCompute.isEmpty() && benchmarkFile.isPresent()) {
            final List<Long> bTs = benchmarkTimestamps;
            final Map<Long, Double> bCloses = benchmarkCloses;
            
            List<java.util.concurrent.CompletableFuture<Optional<RrgPoint>>> futures = plan.fullCompute.stream()
                .map(sector -> java.util.concurrent.CompletableFuture.supplyAsync(
                    () -> {
                        Optional<RrgPoint> opt = calculateForSector(sector, bTs, bCloses, parsedTf, trailLength, normalized, finalRequiredRawCandles);
                        opt.ifPresent(p -> {
                            p.setStale(false);
                            p.setComputedAt(now);
                            cache.put(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector, p);
                        });
                        return opt;
                    }, 
                    selectiveComputeExecutor))
                .collect(Collectors.toList());

            for (java.util.concurrent.CompletableFuture<Optional<RrgPoint>> f : futures) {
                try {
                    f.join().ifPresent(results::add);
                } catch (Exception e) {
                    log.error("Error computing RRG point", e);
                }
            }
        }
                
        long aggrMs = System.currentTimeMillis() - startAggr;
        long rrgMs = System.currentTimeMillis() - startTotal;
        
        log.info("RRG Compute Metrics: total={} ms, aggr={} ms, fullCompute={}, cachedReuse={}, skipped={}, rawCandlesLoaded={}", 
            rrgMs, aggrMs, plan.fullCompute.size(), plan.cachedOnly.size(), plan.skipped.size(),
            (finalRequiredRawCandles > 0 ? finalRequiredRawCandles * (plan.fullCompute.size() + 1) : "all"));
        
        return results;
    }

    private Optional<RrgPoint> calculateForSector(String sector, List<Long> benchmarkTimestamps, Map<Long, Double> benchmarkCloses, ParsedTimeframe parsedTf, int trailLength, boolean normalized, int requiredRawCandles) {
        Optional<ProtoCandleFile> sectorFile = requiredRawCandles > 0
            ? candleService.loadRecentCandles(sector, parsedTf, requiredRawCandles)
            : candleService.loadCandles(sector, parsedTf);
            
        if (sectorFile.isEmpty()) return Optional.empty();

        List<ProtoCandle> sectorCandles = sectorFile.get().getCandlesList();
        RrgTimeframeConfig config = getConfig(parsedTf);
        
        // Align sector closes to benchmark timestamps
        Map<Long, Double> alignedSectorCloses = TimeSeriesAligner.alignSectorCloses(sectorCandles, benchmarkTimestamps, config.alignmentToleranceMs());
        
        List<Long> timestamps = new ArrayList<>();
        List<Double> rawRsSeries = new ArrayList<>();

        for (Long bTs : benchmarkTimestamps) {
            Double sClose = alignedSectorCloses.get(bTs);
            if (sClose != null && benchmarkCloses.containsKey(bTs)) {
                timestamps.add(bTs);
                rawRsSeries.add(sClose / benchmarkCloses.get(bTs));
            }
        }

        int minPeriods = config.minPeriods();
        int smaPeriod = config.smaPeriod();
        
        if (rawRsSeries.size() < minPeriods) return Optional.empty(); // Need enough data for MAs

        double axisCenter = normalized ? 100.0 : 1.0;
        List<Double> xSeries;
        List<Double> ySeries;

        if (normalized) {
            xSeries = calculateSmaNormalized(rawRsSeries, smaPeriod, 100.0);
            ySeries = calculateSmaNormalized(xSeries, smaPeriod, 100.0);
        } else {
            xSeries = new ArrayList<>(rawRsSeries.size());
            double firstRs = rawRsSeries.get(0);
            for (Double rs : rawRsSeries) {
                xSeries.add(rs / firstRs);
            }
            List<Double> ema = calculateEmaSeries(xSeries, smaPeriod, 1.0);
            ySeries = new ArrayList<>(xSeries.size());
            for (int i = 0; i < xSeries.size(); i++) {
                if (i < smaPeriod - 1) { // period - 1
                    ySeries.add(1.0);
                } else {
                    ySeries.add(xSeries.get(i) / ema.get(i));
                }
            }
        }

        if (config.emaSmoothing() > 1) {
            xSeries = calculateEmaSeries(xSeries, config.emaSmoothing(), axisCenter);
            ySeries = calculateEmaSeries(ySeries, config.emaSmoothing(), axisCenter);
        }

        int lastIdx = xSeries.size() - 1;
        List<RrgPoint.TrailPoint> trail = new ArrayList<>();
        for (int i = Math.max(0, lastIdx - trailLength + 1); i <= lastIdx; i++) {
            trail.add(RrgPoint.TrailPoint.builder()
                    .epochMillis(timestamps.get(i))
                    .x(xSeries.get(i))
                    .y(ySeries.get(i))
                    .build());
        }

        double x = xSeries.get(lastIdx);
        double y = ySeries.get(lastIdx);

        return Optional.of(RrgPoint.builder()
                .symbol(sector)
                .x(x)
                .y(y)
                .quadrant(getQuadrant(x, y, axisCenter))
                .trail(trail)
                .build());
    }

    // ──────────────────────────────────────────────────────────────────────
    // Replay Dataset Builder
    // Reuses the same RS computation engine (calculateSmaNormalized,
    // calculateEmaSeries, TimeSeriesAligner) but returns full series
    // arrays for all sectors in a single pass.
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Builds a complete replay dataset containing RS-Ratio and RS-Momentum
     * series for every sector, aligned to the benchmark timestamp array.
     * The client constructs per-frame snapshots and trails by slicing
     * these arrays — no per-frame objects are created server-side.
     */
    public ReplayDatasetResult buildReplayDataset(
            List<String> sectors, String benchmark, ParsedTimeframe parsedTf,
            boolean normalized, long fromMs, long toMs) {

        long startTime = System.currentTimeMillis();
        RrgTimeframeConfig config = getConfig(parsedTf);

        // 1. Load ALL benchmark candles (no date filter yet)
        Optional<ProtoCandleFile> benchmarkFile = candleService.loadCandles(benchmark, parsedTf);
        if (benchmarkFile.isEmpty()) {
            return emptyDatasetResult(benchmark, parsedTf.getCanonical(), normalized);
        }

        List<ProtoCandle> allBenchmarkCandles = benchmarkFile.get().getCandlesList();

        long safeFromMs = fromMs;
        long safeToMs = toMs;
        if (!allBenchmarkCandles.isEmpty()) {
            long firstCandleMs = allBenchmarkCandles.get(0).getEpochMillis();
            long lastCandleMs = allBenchmarkCandles.get(allBenchmarkCandles.size() - 1).getEpochMillis();
            
            if (safeToMs > lastCandleMs) {
                long shiftDelta = safeToMs - lastCandleMs;
                safeToMs = lastCandleMs;
                safeFromMs = Math.max(firstCandleMs, safeFromMs - shiftDelta);
                log.info("Replay requested window shifted by {}ms to match available history ending at {}",
                         shiftDelta, lastCandleMs);
            }
        }

        final long finalFromMs = safeFromMs;
        final long finalToMs = safeToMs;

        // 2. Calculate warm-up buffer: the SMA/EMA indicators need history
        //    BEFORE fromMs to produce valid values AT fromMs.
        //    Warm-up = (smaPeriod × 2 + emaSmoothing) candle periods.
        //    We apply ×2 for RS-Ratio SMA + RS-Momentum SMA (cascade).
        int warmupCandles = config.smaPeriod() * 2 + config.emaSmoothing() + 10; // +10 safety margin
        long warmupBufferMs = (long) warmupCandles * config.alignmentToleranceMs();
        final long computeFromMs = finalFromMs - warmupBufferMs;

        // 3. Filter benchmark candles to [computeFromMs, toMs] — includes warm-up
        List<ProtoCandle> computeCandles = allBenchmarkCandles.stream()
                .filter(c -> c.getEpochMillis() >= computeFromMs && c.getEpochMillis() <= finalToMs)
                .collect(Collectors.toList());

        if (computeCandles.isEmpty()) {
            log.warn("Replay dataset: no benchmark candles in [{}, {}] (warmup from {})",
                    finalFromMs, finalToMs, computeFromMs);
            return emptyDatasetResult(benchmark, parsedTf.getCanonical(), normalized);
        }

        List<Long> computeTimestamps = computeCandles.stream()
                .map(ProtoCandle::getEpochMillis)
                .collect(Collectors.toList());
        Map<Long, Double> computeCloses = computeCandles.stream()
                .collect(Collectors.toMap(ProtoCandle::getEpochMillis, ProtoCandle::getClose,
                        (a, b) -> a, TreeMap::new));

        log.info("Replay dataset: total candles={}, warmup candles needed={}, compute range=[{}, {}], output range=[{}, {}]",
                computeCandles.size(), warmupCandles, computeFromMs, finalToMs, finalFromMs, finalToMs);

        // 4. Compute RS series for each sector concurrently — using the FULL compute range
        List<java.util.concurrent.CompletableFuture<Optional<ReplayDatasetResult.SectorSeriesResult>>> futures =
                sectors.stream()
                        .filter(s -> !s.equalsIgnoreCase(benchmark))
                        .map(sector -> java.util.concurrent.CompletableFuture.supplyAsync(
                                () -> computeSeriesForSector(sector, computeTimestamps, computeCloses,
                                        parsedTf, config, normalized),
                                selectiveComputeExecutor))
                        .collect(Collectors.toList());

        List<ReplayDatasetResult.SectorSeriesResult> computedSeries = new ArrayList<>();
        for (var future : futures) {
            try {
                future.join().ifPresent(computedSeries::add);
            } catch (Exception e) {
                log.error("Error computing replay series for sector", e);
            }
        }

        // 5. TRIM: find the index range within computeTimestamps that falls in [finalFromMs, finalToMs]
        int outputStartIdx = -1;
        int outputEndIdx = -1;
        for (int i = 0; i < computeTimestamps.size(); i++) {
            long ts = computeTimestamps.get(i);
            if (ts >= finalFromMs && outputStartIdx < 0) outputStartIdx = i;
            if (ts <= finalToMs) outputEndIdx = i;
        }

        if (outputStartIdx < 0 || outputEndIdx < 0 || outputEndIdx < outputStartIdx) {
            log.warn("Replay dataset: no frames in output range [{}, {}]", finalFromMs, finalToMs);
            return emptyDatasetResult(benchmark, parsedTf.getCanonical(), normalized);
        }

        int outputLength = outputEndIdx - outputStartIdx + 1;

        // 6. Slice timestamps and benchmark closes to the output range
        long[] timestamps = new long[outputLength];
        double[] refCloses = new double[outputLength];
        for (int i = 0; i < outputLength; i++) {
            int srcIdx = outputStartIdx + i;
            timestamps[i] = computeTimestamps.get(srcIdx);
            refCloses[i] = computeCloses.getOrDefault(computeTimestamps.get(srcIdx), 0.0);
        }

        // 7. Slice each sector's RS arrays to the output range
        List<ReplayDatasetResult.SectorSeriesResult> sectorSeriesList = new ArrayList<>();
        for (var series : computedSeries) {
            double[] trimmedRatio = new double[outputLength];
            double[] trimmedMomentum = new double[outputLength];
            System.arraycopy(series.rsRatio(), outputStartIdx, trimmedRatio, 0, outputLength);
            System.arraycopy(series.rsMomentum(), outputStartIdx, trimmedMomentum, 0, outputLength);
            sectorSeriesList.add(new ReplayDatasetResult.SectorSeriesResult(
                    series.symbol(), trimmedRatio, trimmedMomentum));
        }

        // 8. Build metadata
        String dataHash = computeDatasetHash(benchmark, parsedTf.getCanonical(), normalized,
                sectors, finalFromMs, finalToMs, timestamps.length);
        long latestCandleMs = timestamps[timestamps.length - 1];

        ReplayDatasetResult.ReplayDatasetMetadata metadata = new ReplayDatasetResult.ReplayDatasetMetadata(
                System.currentTimeMillis() / 1000,
                dataHash,
                System.currentTimeMillis(),
                new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")
                        .format(new java.util.Date(latestCandleMs))
        );

        ReplayDatasetResult.ReplayDatasetCapabilities capabilities = new ReplayDatasetResult.ReplayDatasetCapabilities(
                true,
                true,
                parsedTf.isIntraday(),
                timestamps.length,
                timestamps.length > 0 ? timestamps[0] : 0,
                timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0
        );

        List<ReplayDatasetResult.ReferenceSeries> refSeriesList = List.of(
                new ReplayDatasetResult.ReferenceSeries(benchmark, refCloses)
        );

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("Replay dataset built: {} sectors, {} frames (trimmed from {}), {}ms",
                sectorSeriesList.size(), timestamps.length, computeCandles.size(), elapsed);

        return new ReplayDatasetResult(
                metadata, capabilities, benchmark, parsedTf.getCanonical(), normalized,
                timestamps.length, timestamps, refSeriesList, sectorSeriesList
        );
    }

    /**
     * Computes the full RS-Ratio and RS-Momentum series for a single sector.
     * This reuses the exact same computation routines as calculateForSector()
     * (calculateSmaNormalized, calculateEmaSeries, TimeSeriesAligner) but
     * returns the entire xSeries/ySeries instead of just the last point + trail.
     */
    private Optional<ReplayDatasetResult.SectorSeriesResult> computeSeriesForSector(
            String sector, List<Long> benchmarkTimestamps, Map<Long, Double> benchmarkCloses,
            ParsedTimeframe parsedTf, RrgTimeframeConfig config, boolean normalized) {

        Optional<ProtoCandleFile> sectorFile = candleService.loadCandles(sector, parsedTf);
        if (sectorFile.isEmpty()) return Optional.empty();

        List<ProtoCandle> sectorCandles = sectorFile.get().getCandlesList();
        Map<Long, Double> alignedSectorCloses = TimeSeriesAligner.alignSectorCloses(
                sectorCandles, benchmarkTimestamps, config.alignmentToleranceMs());

        // Build raw RS series aligned to benchmark timestamps
        List<Long> alignedTimestamps = new ArrayList<>();
        List<Double> rawRsSeries = new ArrayList<>();
        for (Long bTs : benchmarkTimestamps) {
            Double sClose = alignedSectorCloses.get(bTs);
            if (sClose != null && benchmarkCloses.containsKey(bTs)) {
                alignedTimestamps.add(bTs);
                rawRsSeries.add(sClose / benchmarkCloses.get(bTs));
            }
        }

        if (rawRsSeries.size() < config.minPeriods()) return Optional.empty();

        // RS-Ratio (xSeries) and RS-Momentum (ySeries) — same logic as calculateForSector
        double axisCenter = normalized ? 100.0 : 1.0;
        List<Double> xSeries;
        List<Double> ySeries;

        if (normalized) {
            xSeries = calculateSmaNormalized(rawRsSeries, config.smaPeriod(), 100.0);
            ySeries = calculateSmaNormalized(xSeries, config.smaPeriod(), 100.0);
        } else {
            xSeries = new ArrayList<>(rawRsSeries.size());
            double firstRs = rawRsSeries.get(0);
            for (Double rs : rawRsSeries) {
                xSeries.add(rs / firstRs);
            }
            List<Double> ema = calculateEmaSeries(xSeries, config.smaPeriod(), 1.0);
            ySeries = new ArrayList<>(xSeries.size());
            for (int i = 0; i < xSeries.size(); i++) {
                if (i < config.smaPeriod() - 1) {
                    ySeries.add(1.0);
                } else {
                    ySeries.add(xSeries.get(i) / ema.get(i));
                }
            }
        }

        if (config.emaSmoothing() > 1) {
            xSeries = calculateEmaSeries(xSeries, config.emaSmoothing(), axisCenter);
            ySeries = calculateEmaSeries(ySeries, config.emaSmoothing(), axisCenter);
        }

        // Return full series aligned to benchmark timestamp array.
        // The sector series may have fewer points than the full benchmark if alignment
        // gaps exist, so we re-project onto the full benchmark index space.
        double[] rsRatio = new double[benchmarkTimestamps.size()];
        double[] rsMomentum = new double[benchmarkTimestamps.size()];
        java.util.Arrays.fill(rsRatio, Double.NaN);
        java.util.Arrays.fill(rsMomentum, Double.NaN);

        // Build a mapping from aligned timestamps to the computed series indices
        Map<Long, Integer> alignedIndexMap = new HashMap<>();
        for (int i = 0; i < alignedTimestamps.size(); i++) {
            alignedIndexMap.put(alignedTimestamps.get(i), i);
        }

        for (int bi = 0; bi < benchmarkTimestamps.size(); bi++) {
            Integer seriesIdx = alignedIndexMap.get(benchmarkTimestamps.get(bi));
            if (seriesIdx != null && seriesIdx < xSeries.size()) {
                rsRatio[bi] = xSeries.get(seriesIdx);
                rsMomentum[bi] = ySeries.get(seriesIdx);
            }
        }

        return Optional.of(new ReplayDatasetResult.SectorSeriesResult(sector, rsRatio, rsMomentum));
    }

    private String computeDatasetHash(String benchmark, String timeframe, boolean normalized,
                                       List<String> sectors, long fromMs, long toMs, int frameCount) {
        String input = String.format("%s|%s|%b|%s|%d|%d|%d",
                benchmark, timeframe, normalized,
                sectors.stream().sorted().collect(Collectors.joining(",")),
                fromMs, toMs, frameCount);
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.substring(0, 16); // short hash is sufficient for cache keys
        } catch (Exception e) {
            return String.valueOf(input.hashCode());
        }
    }

    private ReplayDatasetResult emptyDatasetResult(String benchmark, String timeframe, boolean normalized) {
        return new ReplayDatasetResult(
                new ReplayDatasetResult.ReplayDatasetMetadata(0, "", System.currentTimeMillis(), ""),
                new ReplayDatasetResult.ReplayDatasetCapabilities(false, false, false, 0, 0, 0),
                benchmark, timeframe, normalized, 0, new long[0], List.of(), List.of()
        );
    }

    private List<Double> calculateSmaNormalized(List<Double> series, int period, double center) {
        List<Double> normalized = new ArrayList<>();
        for (int i = 0; i < series.size(); i++) {
            if (i < period - 1) {
                normalized.add(center);
                continue;
            }
            double sum = 0;
            for (int j = i - period + 1; j <= i; j++) {
                sum += series.get(j);
            }
            double ma = sum / period;
            normalized.add((series.get(i) / ma) * center);
        }
        return normalized;
    }

    private List<Double> calculateEmaSeries(List<Double> series, int period, double center) {
        List<Double> ema = new ArrayList<>();
        double multiplier = 2.0 / (period + 1);
        double sum = 0;
        for (int i = 0; i < series.size(); i++) {
            if (i < period - 1) {
                sum += series.get(i);
                ema.add(center);
                continue;
            }
            if (i == period - 1) {
                sum += series.get(i);
                double sma = sum / period;
                ema.add(sma);
            } else {
                double prevEma = ema.get(i - 1);
                ema.add((series.get(i) - prevEma) * multiplier + prevEma);
            }
        }
        return ema;
    }

    private String getQuadrant(double x, double y, double axisCenter) {
        if (x >= axisCenter && y >= axisCenter) return "LEADING";
        if (x >= axisCenter && y < axisCenter) return "WEAKENING";
        if (x < axisCenter && y < axisCenter) return "LAGGING";
        return "IMPROVING";
    }
}
