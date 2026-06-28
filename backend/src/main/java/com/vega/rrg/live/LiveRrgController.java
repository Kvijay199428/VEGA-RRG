package com.vega.rrg.live;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for live RRG engine lifecycle management.
 * Connects the frontend LIVE toggle to the LiveComputationOrchestrator.
 */
@Slf4j
@RestController
@RequestMapping("/api/live")
@CrossOrigin(origins = "*")
public class LiveRrgController {

    private final LiveComputationOrchestrator orchestrator;
    private final LiveEngineHealthMetrics healthMetrics;
    private final MarketClockService marketClock;
    private final HistoricalTrailCache historicalTrailCache;

    public LiveRrgController(LiveComputationOrchestrator orchestrator,
                              LiveEngineHealthMetrics healthMetrics,
                              MarketClockService marketClock,
                              HistoricalTrailCache historicalTrailCache) {
        this.orchestrator = orchestrator;
        this.healthMetrics = healthMetrics;
        this.marketClock = marketClock;
        this.historicalTrailCache = historicalTrailCache;
    }

    /**
     * Start the live engine in DEMO mode.
     * Request body: { "benchmark": "NSE_INDEX_Nifty 50", "normalized": true }
     */
    @PostMapping("/start-demo")
    public ResponseEntity<?> startDemo(@RequestBody(required = false) Map<String, Object> request) {
        if (orchestrator.isRunning()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Live engine is already running",
                    "status", "RUNNING"));
        }

        String benchmark = "NSE_INDEX_Nifty 50";
        boolean normalized = true;

        if (request != null) {
            if (request.containsKey("benchmark")) {
                String newBenchmark = (String) request.get("benchmark");
                // Invalidate historical cache if benchmark changes
                historicalTrailCache.invalidateForBenchmark(benchmark);
                benchmark = newBenchmark;
            }
            if (request.containsKey("normalized")) {
                normalized = Boolean.parseBoolean(request.get("normalized").toString());
            }
        }

        orchestrator.startDemo(benchmark, normalized);

        log.info("LiveRrgController: DEMO mode started. benchmark={}, normalized={}", benchmark, normalized);

        return ResponseEntity.ok(Map.of(
                "status", "STARTED",
                "benchmark", benchmark,
                "normalized", normalized,
                "mode", "DEMO"));
    }

    /**
     * Stop the live engine.
     */
    @PostMapping("/stop")
    public ResponseEntity<?> stop() {
        if (!orchestrator.isRunning()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Live engine is not running",
                    "status", "STOPPED"));
        }

        orchestrator.stop();
        log.info("LiveRrgController: Live engine stopped");

        return ResponseEntity.ok(Map.of("status", "STOPPED"));
    }

    /**
     * Get the current status of the live engine.
     */
    @GetMapping("/status")
    public ResponseEntity<?> status() {
        return ResponseEntity.ok(Map.of(
                "running", orchestrator.isRunning(),
                "circuitBreakerTripped", orchestrator.isCircuitBreakerTripped(),
                "activeBenchmark", orchestrator.getActiveBenchmark(),
                "marketOpen", marketClock.isMarketOpen(),
                "clockMode", marketClock.getMode().name(),
                "historicalCacheSize", historicalTrailCache.size(),
                "totalTicks", healthMetrics.getTotalTicks()));
    }
}
