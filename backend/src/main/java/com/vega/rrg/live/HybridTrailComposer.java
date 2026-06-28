package com.vega.rrg.live;

import com.vega.rrg.live.LiveRrgState.LiveTrailPoint;
import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgTimeframeConfig;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import com.vega.rrg.service.CandleService;
import com.vega.rrg.service.RrgService;
import com.vega.rrg.service.TimeSeriesAligner;
import com.vega.rrg.service.TimeframeParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * SINGLE SOURCE OF TRUTH for all trail reads.
 *
 * Composes a hybrid trail from:
 *   1. HistoricalTrailCache (immutable historical head)
 *   2. LiveRrgState.canonicalTrail (mutable live tail, session-only)
 *   3. Provisional overlay (current in-progress candle, NOT counted in trail length)
 *
 * All consumers — SNAPSHOT, PATCH, frontend, exports — go through this.
 * Nothing reads LiveRrgState.canonicalTrail directly.
 *
 * Session-open boundary is TIME-BASED via MarketClockService.getSessionOpenMs(),
 * not derived from trail sizes.
 */
@Slf4j
@Component
public class HybridTrailComposer {

    private final LiveRrgStateCache stateCache;
    private final HistoricalTrailCache historicalTrailCache;
    private final MarketClockService marketClock;
    private final CandleService candleService;
    private final TimeframeParser timeframeParser;

    public HybridTrailComposer(LiveRrgStateCache stateCache,
                                HistoricalTrailCache historicalTrailCache,
                                MarketClockService marketClock,
                                CandleService candleService,
                                TimeframeParser timeframeParser) {
        this.stateCache = stateCache;
        this.historicalTrailCache = historicalTrailCache;
        this.marketClock = marketClock;
        this.candleService = candleService;
        this.timeframeParser = timeframeParser;
    }

    /**
     * Compose a hybrid trail for a sector.
     *
     * @param requestedTrailLength STABLE points only (provisional excluded)
     * @return HybridTrail with up to requestedTrailLength stable points
     *         + 0 or 1 provisional overlay point
     */
    public HybridTrail compose(String sector, String benchmark,
                                String timeframe, int requestedTrailLength,
                                boolean normalized) {

        LiveRrgState state = stateCache.get(timeframe, sector);

        // Extract live trail points (non-provisional) and provisional point
        List<LiveTrailPoint> liveStablePoints = new ArrayList<>();
        LiveTrailPoint provisionalPoint = null;

        if (state != null) {
            for (LiveTrailPoint tp : state.getCanonicalTrail()) {
                if (tp.provisional()) {
                    provisionalPoint = tp;
                } else {
                    liveStablePoints.add(tp);
                }
            }
        }

        int liveCount = liveStablePoints.size();

        // How many historical points do we need?
        int historicalNeeded = Math.max(0, requestedTrailLength - liveCount);

        // Get historical trail (lazy populate if cache miss — correction #1)
        List<LiveTrailPoint> historicalPoints = List.of();
        int historicalCount = 0;

        if (historicalNeeded > 0) {
            historicalPoints = getOrComputeHistoricalTrail(
                    sector, benchmark, timeframe, normalized);

            // Slice from tail to get the most recent historicalNeeded points
            if (historicalPoints.size() > historicalNeeded) {
                historicalPoints = historicalPoints.subList(
                        historicalPoints.size() - historicalNeeded, historicalPoints.size());
            }
            historicalCount = historicalPoints.size();
        }

        // Compose: historical head + live tail
        List<LiveTrailPoint> stableTrail = new ArrayList<>(historicalCount + liveCount);
        stableTrail.addAll(historicalPoints);
        stableTrail.addAll(liveStablePoints);

        // Final slice to requested length from the tail
        if (stableTrail.size() > requestedTrailLength) {
            stableTrail = stableTrail.subList(
                    stableTrail.size() - requestedTrailLength, stableTrail.size());
            // Recount after slicing
            historicalCount = 0;
            for (LiveTrailPoint tp : stableTrail) {
                if (tp.epochMillis() < marketClock.getSessionOpenMs()) {
                    historicalCount++;
                }
            }
        }

        int finalLiveCount = stableTrail.size() - historicalCount;
        int provisionalCount = provisionalPoint != null ? 1 : 0;
        int availableLength = stableTrail.size();

        return new HybridTrail(
                stableTrail,
                provisionalPoint,
                historicalCount,
                finalLiveCount,
                provisionalCount,
                requestedTrailLength,
                availableLength
        );
    }

    /**
     * Lazy-load historical trail from cache, computing on miss.
     * Cache key includes benchmark (correction #2).
     */
    private List<LiveTrailPoint> getOrComputeHistoricalTrail(
            String sector, String benchmark, String timeframe, boolean normalized) {

        Optional<List<LiveTrailPoint>> cached = historicalTrailCache.get(
                sector, timeframe, normalized, benchmark);

        if (cached.isPresent()) {
            return cached.get();
        }

        // Cache miss — compute from .pb files (this is the expensive path)
        List<LiveTrailPoint> computed = computeHistoricalTrail(
                sector, benchmark, timeframe, normalized);

        if (!computed.isEmpty()) {
            historicalTrailCache.put(sector, timeframe, normalized, benchmark, computed);
        }

        return computed;
    }

    /**
     * Full historical trail computation from .pb candle files.
     * Mirrors RrgService.calculateForSector() math exactly
     * to guarantee continuity (correction #7 — continuity guarantee).
     */
    private List<LiveTrailPoint> computeHistoricalTrail(
            String sector, String benchmark, String timeframe, boolean normalized) {

        ParsedTimeframe parsedTf;
        try {
            parsedTf = timeframeParser.parse(timeframe);
        } catch (Exception e) {
            log.warn("HybridTrailComposer: Cannot parse timeframe: {}", timeframe);
            return List.of();
        }

        RrgTimeframeConfig config = RrgService.getConfig(parsedTf);
        int smaPeriod = config.smaPeriod();
        double axisCenter = normalized ? 100.0 : 1.0;

        // Load historical candles
        Optional<ProtoCandleFile> benchmarkFileOpt = candleService.loadCandles(benchmark, parsedTf);
        Optional<ProtoCandleFile> sectorFileOpt = candleService.loadCandles(sector, parsedTf);

        if (benchmarkFileOpt.isEmpty() || sectorFileOpt.isEmpty()) {
            return List.of();
        }

        List<ProtoCandle> benchmarkCandles = benchmarkFileOpt.get().getCandlesList();
        List<ProtoCandle> sectorCandles = sectorFileOpt.get().getCandlesList();

        // Build benchmark data
        List<Long> benchmarkTimestamps = benchmarkCandles.stream()
                .map(ProtoCandle::getEpochMillis).collect(Collectors.toList());
        Map<Long, Double> benchmarkCloses = benchmarkCandles.stream()
                .collect(Collectors.toMap(ProtoCandle::getEpochMillis, ProtoCandle::getClose,
                        (a, b) -> a, TreeMap::new));

        // Align sector closes
        Map<Long, Double> alignedSectorCloses = TimeSeriesAligner.alignSectorCloses(
                sectorCandles, benchmarkTimestamps, config.alignmentToleranceMs());

        // Build raw RS series
        List<Long> timestamps = new ArrayList<>();
        List<Double> rawRsSeries = new ArrayList<>();

        for (Long bTs : benchmarkTimestamps) {
            Double sClose = alignedSectorCloses.get(bTs);
            if (sClose != null && benchmarkCloses.containsKey(bTs)) {
                timestamps.add(bTs);
                rawRsSeries.add(sClose / benchmarkCloses.get(bTs));
            }
        }

        if (rawRsSeries.size() < config.minPeriods()) {
            return List.of();
        }

        // Compute RS-Ratio (x) and RS-Momentum (y) — IDENTICAL to RrgService
        List<Double> xSeries;
        List<Double> ySeries;

        if (normalized) {
            xSeries = calculateSmaNormalized(rawRsSeries, smaPeriod, 100.0);
            ySeries = calculateSmaNormalized(xSeries, smaPeriod, 100.0);
        } else {
            double firstRs = rawRsSeries.get(0);
            xSeries = new ArrayList<>(rawRsSeries.size());
            for (Double rs : rawRsSeries) {
                xSeries.add(rs / firstRs);
            }
            List<Double> ema = calculateEmaSeries(xSeries, smaPeriod, 1.0);
            ySeries = new ArrayList<>(xSeries.size());
            for (int i = 0; i < xSeries.size(); i++) {
                if (i < smaPeriod - 1) {
                    ySeries.add(1.0);
                } else {
                    ySeries.add(xSeries.get(i) / ema.get(i));
                }
            }
        }

        // Apply EMA smoothing
        if (config.emaSmoothing() > 1) {
            xSeries = calculateEmaSeries(xSeries, config.emaSmoothing(), axisCenter);
            ySeries = calculateEmaSeries(ySeries, config.emaSmoothing(), axisCenter);
        }

        // Build trail point list — ALL valid computed points (not just last N)
        List<LiveTrailPoint> trail = new ArrayList<>();
        int startIdx = config.minPeriods() - 1; // first valid computed index

        for (int i = startIdx; i < xSeries.size(); i++) {
            trail.add(new LiveTrailPoint(
                    timestamps.get(i),
                    xSeries.get(i),
                    ySeries.get(i),
                    false  // historical points are never provisional
            ));
        }

        log.debug("HybridTrailComposer: Computed {} historical trail points for {}/{}",
                trail.size(), sector, timeframe);
        return trail;
    }

    // --- Math helpers (identical to RrgService for continuity guarantee) ---

    private List<Double> calculateSmaNormalized(List<Double> series, int period, double center) {
        List<Double> result = new ArrayList<>();
        for (int i = 0; i < series.size(); i++) {
            if (i < period - 1) {
                result.add(center);
                continue;
            }
            double sum = 0;
            for (int j = i - period + 1; j <= i; j++) {
                sum += series.get(j);
            }
            double ma = sum / period;
            result.add((series.get(i) / ma) * center);
        }
        return result;
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
                ema.add(sum / period);
            } else {
                double prevEma = ema.get(i - 1);
                ema.add((series.get(i) - prevEma) * multiplier + prevEma);
            }
        }
        return ema;
    }
}
