package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Component
public class SectorComputationPlanner {

    public static class SectorComputationPlan {
        public List<String> fullCompute = new ArrayList<>();
        public List<String> cachedOnly = new ArrayList<>();
        public List<String> skipped = new ArrayList<>();
    }

    public SectorComputationPlan plan(
            List<String> allSectors,
            List<String> watchlist,
            String selectedSector,
            String hoveredSector,
            boolean watchlistOnlyResampling,
            boolean replayMode,
            RrgSnapshotCache cache,
            String benchmark,
            ParsedTimeframe parsedTf,
            int trailLength,
            boolean normalized) {

        SectorComputationPlan plan = new SectorComputationPlan();
        long now = System.currentTimeMillis();
        long ttlMs = getTtlMs(parsedTf.getTimeframeScaleClass());

        Set<String> watchlistSet = watchlist != null ? new HashSet<>(watchlist) : new HashSet<>();
        
        List<String> priority1 = new ArrayList<>(); // selected
        List<String> priority2 = new ArrayList<>(); // hovered
        List<String> priority3 = new ArrayList<>(); // watchlist
        List<String> priority4 = new ArrayList<>(); // others (cache miss or ttl expired)

        for (String sector : allSectors) {
            boolean isWatchlist = watchlistSet.contains(sector);
            boolean isSelected = sector.equals(selectedSector);
            boolean isHovered = sector.equals(hoveredSector);

            if (replayMode || !watchlistOnlyResampling || isSelected || isHovered || isWatchlist) {
                assignPriority(sector, isSelected, isHovered, isWatchlist, priority1, priority2, priority3, priority4);
            } else {
                Optional<RrgPoint> cachedOpt = cache.get(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector);
                if (cachedOpt.isEmpty()) {
                    assignPriority(sector, false, false, false, priority1, priority2, priority3, priority4);
                } else {
                    RrgPoint cached = cachedOpt.get();
                    if (now - cached.getComputedAt() > ttlMs) {
                        assignPriority(sector, false, false, false, priority1, priority2, priority3, priority4);
                    } else {
                        plan.cachedOnly.add(sector);
                    }
                }
            }
        }

        plan.fullCompute.addAll(priority1);
        plan.fullCompute.addAll(priority2);
        plan.fullCompute.addAll(priority3);
        plan.fullCompute.addAll(priority4);

        return plan;
    }

    private void assignPriority(String sector, boolean isSelected, boolean isHovered, boolean isWatchlist,
                                List<String> p1, List<String> p2, List<String> p3, List<String> p4) {
        if (isSelected) p1.add(sector);
        else if (isHovered) p2.add(sector);
        else if (isWatchlist) p3.add(sector);
        else p4.add(sector);
    }

    public long getTtlMs(String scaleClass) {
        if (scaleClass == null) return 60_000L;
        switch (scaleClass) {
            case "ultra_intraday": return 30_000L;
            case "intraday": return 120_000L;
            case "swing": return 900_000L;
            case "position": return 3600_000L;
            case "macro": return 86400_000L;
            default: return 60_000L;
        }
    }
}
