package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
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
