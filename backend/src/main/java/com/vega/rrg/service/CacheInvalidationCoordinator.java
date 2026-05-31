package com.vega.rrg.service;

import com.vega.rrg.events.RrgConfigurationEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CacheInvalidationCoordinator {

    // Inject planners and caches when implemented in Phase 2
    // private final RrgSnapshotCache cache;
    // private final SectorComputationPlanner planner;
    // private final InflightComputationRegistry registry;

    @Async
    @EventListener
    public void handleSnapshotChanged(RrgConfigurationEvents.SnapshotChangedEvent event) {
        log.info("Received SnapshotChangedEvent. Generation: {}. Changed Domains: {}", event.generationId(), event.changedDomains());
        
        // Coalesced invalidation logic will go here during Phase 2
        if (event.changedDomains().contains("timeframes")) {
            log.info("Timeframes changed. Invalidating aggregation cache, snapshot cache, inflight registry.");
            // cache.clearAll();
            // registry.clearAll();
        }

        if (event.changedDomains().contains("cachePolicy")) {
            log.info("Cache policy changed. Invalidating TTL planner and scheduler timing.");
        }

        if (event.changedDomains().contains("settings")) {
            // Check if windowing changed
            // Invalidating aggregation/snapshot caches.
            log.info("Settings changed. Invalidating aggregation/snapshot caches if windowing changed.");
        }
    }
}
