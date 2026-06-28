package com.vega.rrg.live;

import com.vega.rrg.proto.ProtoCandle;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory rolling candle database for the live pipeline.
 * Structure: timeframe → sector → bounded candle deque.
 *
 * Thread safety: reads are concurrent, writes should come from single writer thread.
 * Uses ConcurrentHashMap for structural safety; deque operations are synchronized.
 *
 * Hard cap: max 500 candles per sector per timeframe (circular buffer).
 */
@Slf4j
@Component
public class LiveCandleStore {

    private static final int MAX_CANDLES_PER_SECTOR = 500;
    private static final int MAX_TIMEFRAMES = 8;

    // timeframe → sector → candles
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, ArrayDeque<ProtoCandle>>> store =
            new ConcurrentHashMap<>();

    /**
     * Store a finalized candle for a sector at a given timeframe.
     * Oldest candle is dropped if capacity exceeded.
     */
    public void addCandle(String timeframe, String sector, ProtoCandle candle) {
        ConcurrentHashMap<String, ArrayDeque<ProtoCandle>> sectorMap =
                store.computeIfAbsent(timeframe, k -> new ConcurrentHashMap<>());

        ArrayDeque<ProtoCandle> deque = sectorMap.computeIfAbsent(sector, k -> new ArrayDeque<>(MAX_CANDLES_PER_SECTOR));

        synchronized (deque) {
            if (deque.size() >= MAX_CANDLES_PER_SECTOR) {
                deque.pollFirst(); // drop oldest
            }
            deque.addLast(candle);
        }
    }

    /**
     * Get the most recent N candles for a sector at a given timeframe.
     * Returns a defensive copy.
     */
    public List<ProtoCandle> getCandles(String timeframe, String sector, int count) {
        ConcurrentHashMap<String, ArrayDeque<ProtoCandle>> sectorMap = store.get(timeframe);
        if (sectorMap == null) return List.of();

        ArrayDeque<ProtoCandle> deque = sectorMap.get(sector);
        if (deque == null) return List.of();

        synchronized (deque) {
            int size = deque.size();
            int start = Math.max(0, size - count);

            List<ProtoCandle> result = new ArrayList<>(Math.min(count, size));
            int idx = 0;
            for (ProtoCandle c : deque) {
                if (idx >= start) {
                    result.add(c);
                }
                idx++;
            }
            return result;
        }
    }

    /**
     * Get all candles for a sector at a given timeframe.
     */
    public List<ProtoCandle> getAllCandles(String timeframe, String sector) {
        return getCandles(timeframe, sector, MAX_CANDLES_PER_SECTOR);
    }

    /**
     * Get the last (most recent) candle for a sector at a given timeframe.
     */
    public Optional<ProtoCandle> getLastCandle(String timeframe, String sector) {
        ConcurrentHashMap<String, ArrayDeque<ProtoCandle>> sectorMap = store.get(timeframe);
        if (sectorMap == null) return Optional.empty();

        ArrayDeque<ProtoCandle> deque = sectorMap.get(sector);
        if (deque == null || deque.isEmpty()) return Optional.empty();

        synchronized (deque) {
            return Optional.of(deque.peekLast());
        }
    }

    /**
     * Get the count of candles for a sector at a given timeframe.
     */
    public int getCandleCount(String timeframe, String sector) {
        ConcurrentHashMap<String, ArrayDeque<ProtoCandle>> sectorMap = store.get(timeframe);
        if (sectorMap == null) return 0;

        ArrayDeque<ProtoCandle> deque = sectorMap.get(sector);
        return deque == null ? 0 : deque.size();
    }

    /**
     * Get all sectors that have candle data for a given timeframe.
     */
    public Set<String> getSectors(String timeframe) {
        ConcurrentHashMap<String, ArrayDeque<ProtoCandle>> sectorMap = store.get(timeframe);
        if (sectorMap == null) return Set.of();
        return sectorMap.keySet();
    }

    /**
     * Clear all data (used on live mode stop).
     */
    public void clear() {
        store.clear();
        log.info("LiveCandleStore: Cleared all data");
    }
}
