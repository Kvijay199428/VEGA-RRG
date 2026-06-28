package com.vega.rrg.live;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Cache for precomputed historical trail arrays.
 *
 * Key includes benchmark (correction #2) because RS values differ per benchmark:
 *   sector|timeframe|normalized|benchmark → List<LiveTrailPoint>
 *
 * Stores raw List<LiveTrailPoint> only (correction #4) — same array serves
 * any trail length by slicing from the tail.
 *
 * Populated lazily (correction #1) — on first HybridTrailComposer.compose() cache miss.
 * No TTL — explicitly cleared on LiveComputationOrchestrator.stop().
 */
@Slf4j
@Component
public class HistoricalTrailCache {

    // 500 sectors × 8 timeframes × 2 normalized modes = 8000 max entries
    private final Cache<String, List<LiveRrgState.LiveTrailPoint>> cache =
            Caffeine.newBuilder()
                    .maximumSize(10_000)
                    .build();

    /**
     * Build the cache key including benchmark for correctness.
     */
    private String buildKey(String sector, String timeframe, boolean normalized, String benchmark) {
        return sector + "|" + timeframe + "|" + normalized + "|" + benchmark;
    }

    /**
     * Get cached historical trail for a sector.
     */
    public Optional<List<LiveRrgState.LiveTrailPoint>> get(String sector, String timeframe,
                                                            boolean normalized, String benchmark) {
        List<LiveRrgState.LiveTrailPoint> cached = cache.getIfPresent(
                buildKey(sector, timeframe, normalized, benchmark));
        return Optional.ofNullable(cached);
    }

    /**
     * Store a historical trail. The list should contain ALL computable historical
     * trail points — consumers slice to desired length.
     */
    public void put(String sector, String timeframe, boolean normalized, String benchmark,
                    List<LiveRrgState.LiveTrailPoint> trail) {
        cache.put(buildKey(sector, timeframe, normalized, benchmark), trail);
        log.debug("HistoricalTrailCache: Cached {} points for {}/{}/{}/{}",
                trail.size(), sector, timeframe, normalized, benchmark);
    }

    /**
     * Invalidate all entries for a specific benchmark (e.g., on benchmark change).
     */
    public void invalidateForBenchmark(String benchmark) {
        // Caffeine doesn't support partial key invalidation natively,
        // so we iterate and remove matching entries
        cache.asMap().entrySet().removeIf(entry -> entry.getKey().endsWith("|" + benchmark));
        log.info("HistoricalTrailCache: Invalidated all entries for benchmark={}", benchmark);
    }

    /**
     * Clear all cached data (used on live mode stop).
     */
    public void clear() {
        cache.invalidateAll();
        log.info("HistoricalTrailCache: Cleared all entries");
    }

    public long size() {
        return cache.estimatedSize();
    }
}
