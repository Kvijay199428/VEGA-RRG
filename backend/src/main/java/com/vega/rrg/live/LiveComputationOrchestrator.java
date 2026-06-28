package com.vega.rrg.live;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgTimeframeConfig;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.service.RrgService;
import com.vega.rrg.service.TimeframeParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

/**
 * Main lifecycle orchestrator for the live RRG engine.
 *
 * Ties together the entire pipeline on a SINGLE WRITER THREAD (correction #12):
 *
 *   DemoMarketDataService.start()
 *       ↓ MarketTick
 *   LiveCandleBuilder.onTick()
 *       ↓ provisional / candle complete
 *   LiveAggregationEngine.onCandleComplete()
 *       ↓ timeframe fanout
 *   IncrementalRrgEngine.update() for visible sectors
 *       ↓
 *   DeltaPatchGenerator → LiveBroadcastScheduler.enqueue()
 *
 * Includes circuit breaker (correction #18):
 * - If computation > 2s for 3 consecutive cycles → trip → FALLBACK to REST
 * - Auto-reset after 30s of healthy operation
 */
@Slf4j
@Service
public class LiveComputationOrchestrator {

    private static final long CIRCUIT_BREAKER_THRESHOLD_NS = 2_000_000_000L; // 2 seconds
    private static final int CIRCUIT_BREAKER_CONSECUTIVE_FAILURES = 3;
    private static final long CIRCUIT_BREAKER_RESET_MS = 30_000; // 30 seconds

    private final DemoMarketDataService demoDataService;
    private final LiveCandleBuilder candleBuilder;
    private final LiveCandleStore candleStore;
    private final LiveAggregationEngine aggregationEngine;
    private final IncrementalRrgEngine rrgEngine;
    private final LiveRrgStateCache stateCache;
    private final LiveBroadcastScheduler broadcastScheduler;
    private final DeltaPatchGenerator patchGenerator;
    private final LiveSessionManager sessionManager;
    private final LiveEngineHealthMetrics healthMetrics;
    private final MarketClockService marketClock;
    private final TimeframeParser timeframeParser;
    private final HistoricalTrailCache historicalTrailCache;

    // Single writer thread for all computation
    private ExecutorService writerThread;
    private volatile boolean running = false;
    private volatile boolean circuitBreakerTripped = false;
    private long circuitBreakerTrippedAt = 0;

    // Track which sectors have been bootstrapped: timeframe → Set<sector>
    private final Map<String, Set<String>> bootstrappedSectors = new ConcurrentHashMap<>();

    // Default benchmark
    private volatile String activeBenchmark = "NSE_INDEX_Nifty 50";

    // Normalized mode (from config)
    private volatile boolean normalized = true;

    public LiveComputationOrchestrator(
            DemoMarketDataService demoDataService,
            LiveCandleBuilder candleBuilder,
            LiveCandleStore candleStore,
            LiveAggregationEngine aggregationEngine,
            IncrementalRrgEngine rrgEngine,
            LiveRrgStateCache stateCache,
            LiveBroadcastScheduler broadcastScheduler,
            DeltaPatchGenerator patchGenerator,
            LiveSessionManager sessionManager,
            LiveEngineHealthMetrics healthMetrics,
            MarketClockService marketClock,
            TimeframeParser timeframeParser,
            HistoricalTrailCache historicalTrailCache) {
        this.demoDataService = demoDataService;
        this.candleBuilder = candleBuilder;
        this.candleStore = candleStore;
        this.aggregationEngine = aggregationEngine;
        this.rrgEngine = rrgEngine;
        this.stateCache = stateCache;
        this.broadcastScheduler = broadcastScheduler;
        this.patchGenerator = patchGenerator;
        this.sessionManager = sessionManager;
        this.healthMetrics = healthMetrics;
        this.marketClock = marketClock;
        this.timeframeParser = timeframeParser;
        this.historicalTrailCache = historicalTrailCache;
    }

    /**
     * Start the live engine in DEMO mode.
     */
    public synchronized void startDemo(String benchmark, boolean normalized) {
        if (running) {
            log.warn("LiveComputationOrchestrator: Already running");
            return;
        }

        this.activeBenchmark = benchmark;
        this.normalized = normalized;
        this.running = true;
        this.circuitBreakerTripped = false;

        // Initialize single writer thread
        writerThread = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "live-computation-writer");
            t.setDaemon(true);
            return t;
        });

        // Activate demo market clock
        marketClock.setDemoMode(1.0);

        // Start broadcast scheduler
        broadcastScheduler.start();

        // Start demo tick generator — ticks delivered on writer thread
        demoDataService.start(tick -> {
            writerThread.submit(() -> onTick(tick));
        });

        log.info("LiveComputationOrchestrator: DEMO mode started. benchmark={}, normalized={}",
                benchmark, normalized);
    }

    /**
     * Stop the live engine.
     */
    public synchronized void stop() {
        if (!running) return;
        running = false;

        demoDataService.stop();
        broadcastScheduler.stop();

        if (writerThread != null) {
            writerThread.shutdown();
            try {
                writerThread.awaitTermination(3, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                writerThread.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        // Cleanup
        candleBuilder.clear();
        candleStore.clear();
        aggregationEngine.clear();
        stateCache.clear();
        patchGenerator.reset();
        historicalTrailCache.clear();
        bootstrappedSectors.clear();
        marketClock.reset();

        log.info("LiveComputationOrchestrator: Stopped");
    }

    /**
     * Process a single tick — runs on single writer thread.
     * This is the core pipeline entry point.
     */
    private void onTick(MarketTick tick) {
        if (!running) return;

        // Circuit breaker check
        if (circuitBreakerTripped) {
            if (System.currentTimeMillis() - circuitBreakerTrippedAt > CIRCUIT_BREAKER_RESET_MS) {
                log.info("LiveComputationOrchestrator: Circuit breaker reset");
                circuitBreakerTripped = false;
                healthMetrics.resetConsecutiveSlowCycles();
            } else {
                return; // Still tripped
            }
        }

        long startNs = System.nanoTime();
        healthMetrics.incrementTotalTicks();

        try {
            // Step 1: Build candle from tick
            long tickStart = System.nanoTime();
            LiveCandleBuilder.CandleEvent event = candleBuilder.onTick(tick);
            healthMetrics.recordTickLatency(System.nanoTime() - tickStart);

            Set<String> updatedTimeframes = new HashSet<>();

            if (event.type() == LiveCandleBuilder.CandleEvent.Type.CANDLE_COMPLETE) {
                // Step 2: Finalized 1m candle — aggregate to higher timeframes
                long aggrStart = System.nanoTime();
                List<String> completedTfs = aggregationEngine.onOneMinuteCandleComplete(
                        event.sector(), event.finalizedCandle());
                healthMetrics.recordAggregationLatency(System.nanoTime() - aggrStart);

                // Step 3: Update RRG for each completed timeframe
                long rrgStart = System.nanoTime();
                for (String tf : completedTfs) {
                    ensureBootstrapped(event.sector(), tf);
                    ensureBootstrapped(activeBenchmark, tf);

                    // Get benchmark close for this timeframe
                    double benchmarkClose = getBenchmarkClose(tf);
                    double sectorClose = event.finalizedCandle().getClose();

                    if (benchmarkClose > 0) {
                        int emaSmoothing = getEmaSmoothing(tf);
                        Set<String> visibleSectors = sessionManager.getAggregateVisibleSectors(tf);
                        if (visibleSectors.contains(event.sector()) || visibleSectors.isEmpty()) {
                            rrgEngine.updateFinal(event.sector(), tf,
                                    sectorClose, benchmarkClose,
                                    event.finalizedCandle().getEpochMillis(), emaSmoothing);
                        }
                    }
                    updatedTimeframes.add(tf);
                }
                healthMetrics.recordRrgComputeLatency(System.nanoTime() - rrgStart);

            } else {
                // Provisional update — only for 1min timeframe
                ensureBootstrapped(event.sector(), "1min");
                double benchmarkClose = getBenchmarkClose("1min");
                if (benchmarkClose > 0) {
                    int emaSmoothing = getEmaSmoothing("1min");
                    Set<String> visibleSectors = sessionManager.getAggregateVisibleSectors("1min");
                    if (visibleSectors.contains(event.sector()) || visibleSectors.isEmpty()) {
                        rrgEngine.updateProvisional(event.sector(), "1min",
                                event.provisionalCandle().getClose(), benchmarkClose,
                                event.provisionalCandle().getEpochMillis(), emaSmoothing);
                        updatedTimeframes.add("1min");
                    }
                }
            }

            // Step 4: Generate and enqueue delta patches
            if (!updatedTimeframes.isEmpty() && sessionManager.hasActiveSessions()) {
                broadcastScheduler.generateAndEnqueuePatches(updatedTimeframes);
            }

            // Track computation duration for circuit breaker
            long durationNs = System.nanoTime() - startNs;
            healthMetrics.recordComputationDuration(durationNs);

            if (durationNs > CIRCUIT_BREAKER_THRESHOLD_NS) {
                healthMetrics.incrementConsecutiveSlowCycles();
                if (healthMetrics.getConsecutiveSlowCycles() >= CIRCUIT_BREAKER_CONSECUTIVE_FAILURES) {
                    tripCircuitBreaker("Computation exceeded 2s for "
                            + CIRCUIT_BREAKER_CONSECUTIVE_FAILURES + " consecutive cycles");
                }
            } else {
                healthMetrics.resetConsecutiveSlowCycles();
            }

        } catch (Exception e) {
            log.error("LiveComputationOrchestrator: Error processing tick for {}", tick.symbol(), e);
        }
    }

    /**
     * Ensure a sector is bootstrapped for a given timeframe.
     * Bootstrap seeds the LiveRrgState from historical .pb files.
     */
    private void ensureBootstrapped(String sector, String timeframe) {
        Set<String> bootstrapped = bootstrappedSectors.computeIfAbsent(timeframe, k -> ConcurrentHashMap.newKeySet());
        if (bootstrapped.contains(sector)) return;

        boolean success = rrgEngine.bootstrap(sector, activeBenchmark, timeframe, normalized);
        if (success) {
            bootstrapped.add(sector);
        }
    }

    /**
     * Get the current benchmark close price for a timeframe.
     * Uses the latest candle from the live candle store, or the provisional candle.
     */
    private double getBenchmarkClose(String timeframe) {
        // First try live candle store
        var lastCandle = candleStore.getLastCandle(timeframe, activeBenchmark);
        if (lastCandle.isPresent()) {
            return lastCandle.get().getClose();
        }

        // Fallback to provisional
        ProtoCandle provisional = candleBuilder.getProvisionalCandle(activeBenchmark);
        if (provisional != null) {
            return provisional.getClose();
        }

        return 0;
    }

    /**
     * Get the EMA smoothing factor for a timeframe.
     */
    private int getEmaSmoothing(String timeframeStr) {
        try {
            ParsedTimeframe parsedTf = timeframeParser.parse(timeframeStr);
            RrgTimeframeConfig config = RrgService.getConfig(parsedTf);
            return config.emaSmoothing();
        } catch (Exception e) {
            return 1;
        }
    }

    /**
     * Trip the circuit breaker — notify all clients to fallback to REST.
     */
    private void tripCircuitBreaker(String reason) {
        circuitBreakerTripped = true;
        circuitBreakerTrippedAt = System.currentTimeMillis();
        log.error("LiveComputationOrchestrator: CIRCUIT BREAKER TRIPPED — {}", reason);

        String fallbackMsg = patchGenerator.generateFallback(reason);
        broadcastScheduler.enqueueForAll(fallbackMsg);
    }

    // --- Public accessors ---

    public boolean isRunning() { return running; }
    public boolean isCircuitBreakerTripped() { return circuitBreakerTripped; }
    public String getActiveBenchmark() { return activeBenchmark; }
}
