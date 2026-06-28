package com.vega.rrg.live;

import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.service.TradingSessionProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live aggregation engine: derives higher timeframes (5m, 15m, 30m, 1h) from 1m candles.
 *
 * ALL timeframes derive from 1m — never independently simulated.
 * Uses session-anchored bucketing identical to TimeframeAggregationService.
 *
 * Runs on the single writer thread (correction #12).
 */
@Slf4j
@Component
public class LiveAggregationEngine {

    private final LiveCandleStore candleStore;
    private final MarketClockService marketClock;
    private final TradingSessionProvider sessionProvider;

    // Higher timeframe definitions: canonical name → number of 1m candles per bucket
    private static final Map<String, Integer> HIGHER_TIMEFRAMES = new LinkedHashMap<>();
    static {
        HIGHER_TIMEFRAMES.put("5min", 5);
        HIGHER_TIMEFRAMES.put("15min", 15);
        HIGHER_TIMEFRAMES.put("30min", 30);
        HIGHER_TIMEFRAMES.put("1h", 60);
    }

    // In-progress higher-timeframe buckets: timeframe → sector → AggregationBucket
    private final Map<String, Map<String, AggregationBucket>> inProgressBuckets = new ConcurrentHashMap<>();

    public LiveAggregationEngine(LiveCandleStore candleStore,
                                  MarketClockService marketClock,
                                  TradingSessionProvider sessionProvider) {
        this.candleStore = candleStore;
        this.marketClock = marketClock;
        this.sessionProvider = sessionProvider;

        // Initialize bucket maps
        for (String tf : HIGHER_TIMEFRAMES.keySet()) {
            inProgressBuckets.put(tf, new ConcurrentHashMap<>());
        }
    }

    /**
     * Called when a 1m candle completes for a sector.
     * Merges into all higher-timeframe buckets.
     *
     * @param sector The sector symbol
     * @param oneMinCandle The completed 1m candle
     * @return List of timeframes that had candles finalized (e.g., ["5min"] when 5th 1m candle completes)
     */
    public List<String> onOneMinuteCandleComplete(String sector, ProtoCandle oneMinCandle) {
        List<String> completedTimeframes = new ArrayList<>();
        completedTimeframes.add("1min"); // 1min always completes

        long candleTimestamp = oneMinCandle.getEpochMillis();

        for (Map.Entry<String, Integer> entry : HIGHER_TIMEFRAMES.entrySet()) {
            String timeframe = entry.getKey();
            int bucketSizeMinutes = entry.getValue();

            Map<String, AggregationBucket> sectorBuckets = inProgressBuckets.get(timeframe);
            AggregationBucket bucket = sectorBuckets.get(sector);

            long bucketBoundary = computeBucketBoundary(candleTimestamp, bucketSizeMinutes);

            if (bucket == null || bucket.bucketBoundary != bucketBoundary) {
                // New bucket started — finalize old one if exists
                if (bucket != null && !bucket.candles.isEmpty()) {
                    ProtoCandle aggregated = aggregateCandles(bucket.candles, bucket.bucketBoundary);
                    candleStore.addCandle(timeframe, sector, aggregated);
                    completedTimeframes.add(timeframe);
                }

                // Start new bucket
                bucket = new AggregationBucket(bucketBoundary);
                sectorBuckets.put(sector, bucket);
            }

            bucket.candles.add(oneMinCandle);

            // Check if bucket is complete (all N candles received)
            if (bucket.candles.size() >= bucketSizeMinutes) {
                ProtoCandle aggregated = aggregateCandles(bucket.candles, bucket.bucketBoundary);
                candleStore.addCandle(timeframe, sector, aggregated);
                completedTimeframes.add(timeframe);

                // Clear bucket for next period
                sectorBuckets.remove(sector);
            }
        }

        return completedTimeframes;
    }

    /**
     * Get the current provisional (in-progress) higher-timeframe candle for a sector.
     * Used for provisional RRG updates.
     */
    public ProtoCandle getProvisionalHigherCandle(String timeframe, String sector) {
        Map<String, AggregationBucket> sectorBuckets = inProgressBuckets.get(timeframe);
        if (sectorBuckets == null) return null;

        AggregationBucket bucket = sectorBuckets.get(sector);
        if (bucket == null || bucket.candles.isEmpty()) return null;

        return aggregateCandles(bucket.candles, bucket.bucketBoundary);
    }

    /**
     * Compute the bucket boundary (floor) for a given timestamp and bucket size.
     * Anchored to market session open time.
     */
    private long computeBucketBoundary(long epochMs, int bucketSizeMinutes) {
        long sessionOpenMs = marketClock.getSessionOpenMs();
        if (epochMs < sessionOpenMs) return sessionOpenMs;

        long elapsedMs = epochMs - sessionOpenMs;
        long bucketMs = bucketSizeMinutes * 60_000L;
        long bucketIndex = elapsedMs / bucketMs;
        return sessionOpenMs + (bucketIndex * bucketMs);
    }

    /**
     * Aggregate a list of candles into a single OHLCV candle.
     * Uses the last candle's timestamp as the aggregated timestamp.
     */
    private ProtoCandle aggregateCandles(List<ProtoCandle> candles, long bucketBoundary) {
        if (candles.isEmpty()) return null;

        ProtoCandle first = candles.get(0);
        ProtoCandle last = candles.get(candles.size() - 1);

        double open = first.getOpen();
        double close = last.getClose();
        double high = Double.MIN_VALUE;
        double low = Double.MAX_VALUE;
        double volume = 0;

        for (ProtoCandle c : candles) {
            high = Math.max(high, c.getHigh());
            low = Math.min(low, c.getLow());
            volume += c.getVolume();
        }

        return ProtoCandle.newBuilder()
                .setEpochMillis(last.getEpochMillis())
                .setOpen(open)
                .setHigh(high)
                .setLow(low)
                .setClose(close)
                .setVolume(volume)
                .build();
    }

    /**
     * Clear all in-progress buckets (used on live mode stop).
     */
    public void clear() {
        for (Map<String, AggregationBucket> sectorBuckets : inProgressBuckets.values()) {
            sectorBuckets.clear();
        }
        log.info("LiveAggregationEngine: Cleared all in-progress buckets");
    }

    /**
     * Returns the set of higher timeframes this engine manages.
     */
    public Set<String> getHigherTimeframes() {
        return HIGHER_TIMEFRAMES.keySet();
    }

    /**
     * In-progress aggregation bucket for a single sector at a single higher timeframe.
     */
    private static class AggregationBucket {
        final long bucketBoundary;
        final List<ProtoCandle> candles = new ArrayList<>();

        AggregationBucket(long bucketBoundary) {
            this.bucketBoundary = bucketBoundary;
        }
    }
}
