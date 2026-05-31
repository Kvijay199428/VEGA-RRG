package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class SnapshotRefreshScheduler {

    @Autowired
    private RrgSnapshotCache cache;

    @Lazy
    @Autowired
    private RrgService rrgService;

    @Autowired
    private TimeframeParser timeframeParser;

    @Autowired
    private SectorComputationPlanner planner;

    private static final int MAX_REFRESH_PER_CYCLE = 10;

    @Scheduled(fixedDelay = 60000)
    public void refreshStaleSnapshots() {
        Map<String, RrgPoint> cacheMap = cache.getAsMap();
        if (cacheMap.isEmpty()) return;

        long now = System.currentTimeMillis();
        
        // Find stale items that are close to or exceeding TTL
        List<Map.Entry<String, RrgPoint>> candidates = new ArrayList<>();
        
        for (Map.Entry<String, RrgPoint> entry : cacheMap.entrySet()) {
            String key = entry.getKey();
            RrgPoint point = entry.getValue();
            
            try {
                String[] parts = key.split("\\|");
                if (parts.length < 6) continue;
                String canonicalTf = parts[2];
                ParsedTimeframe parsedTf = timeframeParser.parse(canonicalTf);
                long ttlMs = planner.getTtlMs(parsedTf.getTimeframeScaleClass());
                
                // If age > TTL / 2, consider it a candidate for background refresh
                long age = now - point.getComputedAt();
                if (age > (ttlMs / 2)) {
                    candidates.add(entry);
                }
            } catch (Exception e) {
                log.warn("Failed to parse cache key for background refresh: {}", key);
            }
        }
        
        if (candidates.isEmpty()) return;
        
        // Sort by oldest first
        candidates.sort(Comparator.comparingLong(e -> e.getValue().getComputedAt()));
        
        int count = Math.min(MAX_REFRESH_PER_CYCLE, candidates.size());
        List<Map.Entry<String, RrgPoint>> toRefresh = candidates.subList(0, count);
        
        log.info("Background refresh triggered for {} stale sectors", count);
        
        for (Map.Entry<String, RrgPoint> entry : toRefresh) {
            String key = entry.getKey();
            try {
                String[] parts = key.split("\\|");
                String benchmark = parts[1];
                String canonicalTf = parts[2];
                int trailLength = Integer.parseInt(parts[3]);
                boolean normalized = Boolean.parseBoolean(parts[4]);
                String sector = parts[5];
                
                ParsedTimeframe parsedTf = timeframeParser.parse(canonicalTf);
                
                // Compute using the exact same parameters (minimalWindowResampling = true as optimization)
                List<RrgPoint> results = rrgService.calculateRrg(
                        Collections.singletonList(sector),
                        benchmark,
                        parsedTf,
                        trailLength,
                        normalized,
                        true
                );
                
                if (!results.isEmpty()) {
                    RrgPoint fresh = results.get(0);
                    fresh.setComputedAt(System.currentTimeMillis());
                    fresh.setStale(false);
                    cache.put(benchmark, canonicalTf, trailLength, normalized, sector, fresh);
                }
                
            } catch (Exception e) {
                log.error("Failed to refresh stale snapshot for key: {}", key, e);
            }
        }
    }
}
