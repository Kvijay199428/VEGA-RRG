package com.vega.rrg.live;

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

/**
 * O(1) per-sector incremental RRG engine.
 *
 * Instead of recomputing the full historical series (O(n) per tick,
 * as in RrgService.calculateForSector()), this engine carries forward
 * EMA/SMA state and appends only the newest candle.
 *
 * Key properties:
 * - O(1) per sector per tick (after bootstrap)
 * - Bootstrap: one-time full computation to seed EMA state from .pb files
 * - Provisional updates: recalculate with in-progress candle close
 * - Velocity/acceleration tracking for frontend interpolation
 * - Visibility-filtered: only computes for visible sectors
 *
 * All operations run on the single writer thread (correction #12).
 */
@Slf4j
@Component
public class IncrementalRrgEngine {

    private final LiveRrgStateCache stateCache;
    private final CandleService candleService;
    private final MarketClockService marketClock;
    private final TimeframeParser timeframeParser;

    public IncrementalRrgEngine(LiveRrgStateCache stateCache,
                                 CandleService candleService,
                                 MarketClockService marketClock,
                                 TimeframeParser timeframeParser) {
        this.stateCache = stateCache;
        this.candleService = candleService;
        this.marketClock = marketClock;
        this.timeframeParser = timeframeParser;
    }

    /**
     * Bootstrap a sector for a given timeframe by running a full historical
     * computation to extract final EMA/SMA state.
     *
     * Called once when live mode starts (correction #7 — snapshot-live merge).
     * After bootstrap, subsequent updates are O(1).
     */
    public boolean bootstrap(String sector, String benchmark, String timeframeStr, boolean normalized) {
        ParsedTimeframe parsedTf;
        try {
            parsedTf = timeframeParser.parse(timeframeStr);
        } catch (Exception e) {
            log.warn("IncrementalRrgEngine: Cannot parse timeframe: {}", timeframeStr);
            return false;
        }

        RrgTimeframeConfig config = RrgService.getConfig(parsedTf);
        int smaPeriod = config.smaPeriod();
        int emaSmoothing = config.emaSmoothing();
        double axisCenter = normalized ? 100.0 : 1.0;

        // Load historical candles
        Optional<ProtoCandleFile> benchmarkFileOpt = candleService.loadCandles(benchmark, parsedTf);
        Optional<ProtoCandleFile> sectorFileOpt = candleService.loadCandles(sector, parsedTf);

        if (benchmarkFileOpt.isEmpty() || sectorFileOpt.isEmpty()) {
            log.debug("IncrementalRrgEngine: No candle data for bootstrap. sector={}, tf={}", sector, timeframeStr);
            return false;
        }

        List<ProtoCandle> benchmarkCandles = benchmarkFileOpt.get().getCandlesList();
        List<ProtoCandle> sectorCandles = sectorFileOpt.get().getCandlesList();

        // Build benchmark closes map
        List<Long> benchmarkTimestamps = new ArrayList<>();
        Map<Long, Double> benchmarkCloses = new TreeMap<>();
        for (ProtoCandle c : benchmarkCandles) {
            benchmarkTimestamps.add(c.getEpochMillis());
            benchmarkCloses.put(c.getEpochMillis(), c.getClose());
        }

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
            log.debug("IncrementalRrgEngine: Insufficient data for bootstrap. sector={}, tf={}, have={}, need={}",
                    sector, timeframeStr, rawRsSeries.size(), config.minPeriods());
            return false;
        }

        // Compute full RS-Ratio (x) and RS-Momentum (y) series — mirrors RrgService exactly
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

        // Apply EMA smoothing if configured
        List<Double> smoothedX = xSeries;
        List<Double> smoothedY = ySeries;
        if (emaSmoothing > 1) {
            smoothedX = calculateEmaSeries(xSeries, emaSmoothing, axisCenter);
            smoothedY = calculateEmaSeries(ySeries, emaSmoothing, axisCenter);
        }

        // Create LiveRrgState and seed with final historical state
        LiveRrgState state = new LiveRrgState(smaPeriod, normalized);

        // Seed the SMA circular buffer with the last smaPeriod raw RS values
        int seriesLen = rawRsSeries.size();
        for (int i = Math.max(0, seriesLen - smaPeriod); i < seriesLen; i++) {
            state.updateSmaAndGet(rawRsSeries.get(i));
        }

        // Seed EMA state from the last values of the smoothed series
        int lastIdx = smoothedX.size() - 1;
        state.setLatestX(smoothedX.get(lastIdx));
        state.setLatestY(smoothedY.get(lastIdx));

        // Store EMA carry-forward values
        if (emaSmoothing > 1) {
            state.setPreviousEmaX(xSeries.get(lastIdx));
            state.setPreviousEmaY(ySeries.get(lastIdx));
            state.setPreviousSmoothEmaX(smoothedX.get(lastIdx));
            state.setPreviousSmoothEmaY(smoothedY.get(lastIdx));
        } else {
            state.setPreviousEmaX(smoothedX.get(lastIdx));
            state.setPreviousEmaY(smoothedY.get(lastIdx));
            state.setPreviousSmoothEmaX(smoothedX.get(lastIdx));
            state.setPreviousSmoothEmaY(smoothedY.get(lastIdx));
        }

        if (!rawRsSeries.isEmpty()) {
            state.setPreviousRawRs(rawRsSeries.get(rawRsSeries.size() - 1));
        }

        state.setCandleCount(rawRsSeries.size());
        state.setQuadrant(LiveRrgState.computeQuadrant(
                smoothedX.get(lastIdx), smoothedY.get(lastIdx), axisCenter));
        state.setUpdatedAt(marketClock.now());

        // DO NOT seed canonicalTrail here — it holds LIVE points only.
        // Historical trail is computed separately and stored in HistoricalTrailCache.
        // canonicalTrail starts empty and grows as live candles arrive.

        stateCache.put(timeframeStr, sector, state);
        log.debug("IncrementalRrgEngine: Bootstrapped EMA state for sector={}, tf={}, candleCount={}",
                sector, timeframeStr, state.getCandleCount());
        return true;
    }

    /**
     * O(1) incremental update for a sector with a new finalized candle.
     *
     * @param sector Sector symbol
     * @param timeframe Canonical timeframe string
     * @param sectorClose New candle close price
     * @param benchmarkClose Corresponding benchmark close price
     * @param timestamp Candle epoch millis
     * @param emaSmoothing EMA smoothing factor from config
     */
    public void updateFinal(String sector, String timeframe, double sectorClose, double benchmarkClose,
                            long timestamp, int emaSmoothing) {
        LiveRrgState state = stateCache.get(timeframe, sector);
        if (state == null) {
            log.debug("IncrementalRrgEngine: No state for sector={}, tf={} — skipping", sector, timeframe);
            return;
        }

        double rawRs = sectorClose / benchmarkClose;
        computeAndUpdate(state, rawRs, timestamp, emaSmoothing, false);
    }

    /**
     * O(1) provisional update for a sector with an in-progress candle.
     * Replaces the last trail point instead of appending.
     */
    public void updateProvisional(String sector, String timeframe, double sectorClose, double benchmarkClose,
                                   long timestamp, int emaSmoothing) {
        LiveRrgState state = stateCache.get(timeframe, sector);
        if (state == null) return;

        // Save current state for rollback after provisional compute
        double savedX = state.getLatestX();
        double savedY = state.getLatestY();
        double savedEmaX = state.getPreviousEmaX();
        double savedEmaY = state.getPreviousEmaY();
        double savedSmoothEmaX = state.getPreviousSmoothEmaX();
        double savedSmoothEmaY = state.getPreviousSmoothEmaY();
        double savedVx = state.getVelocityX();
        double savedVy = state.getVelocityY();

        double rawRs = sectorClose / benchmarkClose;
        computeAndUpdate(state, rawRs, timestamp, emaSmoothing, true);

        // Restore EMA state so next final update uses correct carry-forward
        state.setPreviousEmaX(savedEmaX);
        state.setPreviousEmaY(savedEmaY);
        state.setPreviousSmoothEmaX(savedSmoothEmaX);
        state.setPreviousSmoothEmaY(savedSmoothEmaY);
    }

    /**
     * Core incremental computation — shared between final and provisional updates.
     */
    private void computeAndUpdate(LiveRrgState state, double rawRs, long timestamp,
                                   int emaSmoothing, boolean provisional) {
        double axisCenter = state.getAxisCenter();
        boolean normalized = state.isNormalized();
        int smaPeriod = state.getSmaWindow().length;

        // Step 1: Update SMA and compute RS-Ratio (x)
        double x;
        if (normalized) {
            // SMA-normalized: x = (rawRs / SMA(rawRs)) * 100
            double sma = state.updateSmaAndGet(rawRs);
            x = (sma > 0) ? (rawRs / sma) * axisCenter : axisCenter;
        } else {
            // Raw mode: x = rawRs / firstRs (but in incremental mode, use relative to previous)
            x = rawRs; // simplified for live — relative strength directly
            double sma = state.updateSmaAndGet(x);
            x = (sma > 0) ? x / sma : 1.0;
        }

        // Step 2: Compute RS-Momentum (y) — EMA of x-series
        double y;
        double prevEmaX = state.getPreviousEmaX();
        if (state.getCandleCount() < smaPeriod) {
            y = axisCenter;
            state.setPreviousEmaX(x); // seed
        } else {
            double multiplier = 2.0 / (smaPeriod + 1);
            double newEmaX = (x - prevEmaX) * multiplier + prevEmaX;
            y = (newEmaX > 0) ? (x / newEmaX) * axisCenter : axisCenter;
            if (!provisional) {
                state.setPreviousEmaX(newEmaX);
            }
        }

        // Step 3: Apply EMA smoothing if configured
        if (emaSmoothing > 1) {
            double smoothMultiplier = 2.0 / (emaSmoothing + 1);

            double prevSmoothX = state.getPreviousSmoothEmaX();
            double smoothedX = (x - prevSmoothX) * smoothMultiplier + prevSmoothX;

            double prevSmoothY = state.getPreviousSmoothEmaY();
            double smoothedY = (y - prevSmoothY) * smoothMultiplier + prevSmoothY;

            if (!provisional) {
                state.setPreviousSmoothEmaX(smoothedX);
                state.setPreviousSmoothEmaY(smoothedY);
            }

            x = smoothedX;
            y = smoothedY;
        }

        // Step 4: Compute velocity and acceleration (correction #10)
        double prevX = state.getLatestX();
        double prevY = state.getLatestY();
        double vx = x - prevX;
        double vy = y - prevY;
        double ax = vx - state.getVelocityX();
        double ay = vy - state.getVelocityY();

        // Step 5: Update state
        state.setLatestX(x);
        state.setLatestY(y);
        state.setVelocityX(vx);
        state.setVelocityY(vy);
        state.setAccelerationX(ax);
        state.setAccelerationY(ay);
        state.setQuadrant(LiveRrgState.computeQuadrant(x, y, axisCenter));
        state.setUpdatedAt(timestamp);
        state.setProvisional(provisional);

        // Step 6: Update trail
        LiveRrgState.LiveTrailPoint trailPoint = new LiveRrgState.LiveTrailPoint(timestamp, x, y, provisional);
        if (provisional) {
            state.replaceLastTrailPoint(trailPoint);
        } else {
            state.appendTrailPoint(trailPoint);
            state.setCandleCount(state.getCandleCount() + 1);
        }
    }

    // --- Batch-style helpers (used only during bootstrap) ---

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
