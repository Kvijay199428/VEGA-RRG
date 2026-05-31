package com.vega.rrg.service;

import com.vega.rrg.proto.ProtoCandle;
import java.util.*;

public class TimeSeriesAligner {

    /**
     * Aligns sector candles to benchmark timestamps to prevent dropping candles due to holiday mismatches.
     * Returns a map of benchmark timestamp -> sector close price.
     */
    public static Map<Long, Double> alignSectorCloses(List<ProtoCandle> sectorCandles, List<Long> benchmarkTimestamps, long maxDiffMs) {
        Map<Long, Double> alignedCloses = new LinkedHashMap<>();
        if (sectorCandles.isEmpty() || benchmarkTimestamps.isEmpty()) return alignedCloses;

        int sectorIdx = 0;
        int maxIdx = sectorCandles.size() - 1;
        long MAX_DIFF_MS = maxDiffMs;

        for (Long bTs : benchmarkTimestamps) {
            while (sectorIdx < maxIdx) {
                long currentTs = sectorCandles.get(sectorIdx).getEpochMillis();
                long nextTs = sectorCandles.get(sectorIdx + 1).getEpochMillis();
                
                if (nextTs <= bTs) {
                    sectorIdx++;
                } else {
                    long currentDiff = Math.abs(currentTs - bTs);
                    long nextDiff = Math.abs(nextTs - bTs);
                    if (nextDiff < currentDiff) {
                        sectorIdx++;
                    } else {
                        break;
                    }
                }
            }
            
            ProtoCandle matched = sectorCandles.get(sectorIdx);
            if (Math.abs(matched.getEpochMillis() - bTs) <= MAX_DIFF_MS) {
                alignedCloses.put(bTs, matched.getClose());
            }
        }
        
        return alignedCloses;
    }
}
