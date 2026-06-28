package com.vega.rrg.live;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live RRG state cache — NO trail length dimension (correction #6).
 *
 * Structure: timeframe → sector → LiveRrgState
 *
 * Trail length is VIEW STATE: the canonical trail in LiveRrgState holds
 * the full trail (max 120 points), and consumers slice to desired length.
 *
 * Hard caps (correction #16):
 * - Max 8 timeframes
 * - Max 500 sectors per timeframe
 *
 * Thread safety: ConcurrentHashMap for structural operations.
 * Writes come from single writer thread; reads from broadcast thread.
 */
@Slf4j
@Component
public class LiveRrgStateCache {

    private static final int MAX_TIMEFRAMES = 8;
    private static final int MAX_SECTORS_PER_TIMEFRAME = 500;

    // timeframe → sector → state
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, LiveRrgState>> cache =
            new ConcurrentHashMap<>();

    /**
     * Get or create the state for a sector at a given timeframe.
     * Called from the single writer thread.
     */
    public LiveRrgState getOrCreate(String timeframe, String sector, int smaPeriod, boolean normalized) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap =
                cache.computeIfAbsent(timeframe, k -> {
                    if (cache.size() >= MAX_TIMEFRAMES) {
                        log.warn("LiveRrgStateCache: Max timeframes ({}) reached", MAX_TIMEFRAMES);
                    }
                    return new ConcurrentHashMap<>();
                });

        return sectorMap.computeIfAbsent(sector, k -> {
            if (sectorMap.size() >= MAX_SECTORS_PER_TIMEFRAME) {
                log.warn("LiveRrgStateCache: Max sectors ({}) reached for timeframe {}",
                        MAX_SECTORS_PER_TIMEFRAME, timeframe);
            }
            return new LiveRrgState(smaPeriod, normalized);
        });
    }

    /**
     * Get the state for a sector at a given timeframe, if it exists.
     */
    public LiveRrgState get(String timeframe, String sector) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap = cache.get(timeframe);
        if (sectorMap == null) return null;
        return sectorMap.get(sector);
    }

    /**
     * Put a state directly (used during bootstrap).
     */
    public void put(String timeframe, String sector, LiveRrgState state) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap =
                cache.computeIfAbsent(timeframe, k -> new ConcurrentHashMap<>());
        sectorMap.put(sector, state);
    }

    /**
     * Get all states for a given timeframe.
     * Returns a snapshot view (safe for concurrent iteration).
     */
    public Map<String, LiveRrgState> getAllStates(String timeframe) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap = cache.get(timeframe);
        if (sectorMap == null) return Map.of();
        return Collections.unmodifiableMap(sectorMap);
    }

    /**
     * Get all sectors that have state for a given timeframe.
     */
    public Set<String> getSectors(String timeframe) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap = cache.get(timeframe);
        if (sectorMap == null) return Set.of();
        return sectorMap.keySet();
    }

    /**
     * Get all active timeframes in the cache.
     */
    public Set<String> getActiveTimeframes() {
        return cache.keySet();
    }

    /**
     * Check if a sector has state for a given timeframe.
     */
    public boolean hasState(String timeframe, String sector) {
        ConcurrentHashMap<String, LiveRrgState> sectorMap = cache.get(timeframe);
        return sectorMap != null && sectorMap.containsKey(sector);
    }

    /**
     * Clear all cached state (used on live mode stop).
     */
    public void clear() {
        cache.clear();
        log.info("LiveRrgStateCache: Cleared all state");
    }

    /**
     * Returns total number of cached states across all timeframes.
     */
    public int getTotalStateCount() {
        return cache.values().stream().mapToInt(ConcurrentHashMap::size).sum();
    }
}
