package com.vega.rrg.live;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.*;

/**
 * Throttled WebSocket broadcaster with per-session backpressure (correction #11).
 *
 * Responsibilities:
 * - Enqueue delta patches to per-session ring buffers
 * - Drain and send queued messages on a separate broadcast thread
 * - Never block the computation thread
 * - Enforce max 4 FPS broadcast rate (250ms throttle)
 * - Send periodic heartbeats
 */
@Slf4j
@Component
public class LiveBroadcastScheduler {

    private static final long BROADCAST_INTERVAL_MS = 250; // 4 FPS max
    private static final long HEARTBEAT_INTERVAL_MS = 5_000; // Every 5 seconds

    private final LiveSessionManager sessionManager;
    private final LiveRrgStateCache stateCache;
    private final DeltaPatchGenerator patchGenerator;
    private final RrgLiveWebSocketHandler wsHandler;
    private final LiveEngineHealthMetrics healthMetrics;

    private ScheduledExecutorService broadcastScheduler;
    private volatile boolean running = false;
    private long lastHeartbeatMs = 0;

    public LiveBroadcastScheduler(LiveSessionManager sessionManager,
                                   LiveRrgStateCache stateCache,
                                   DeltaPatchGenerator patchGenerator,
                                   RrgLiveWebSocketHandler wsHandler,
                                   LiveEngineHealthMetrics healthMetrics) {
        this.sessionManager = sessionManager;
        this.stateCache = stateCache;
        this.patchGenerator = patchGenerator;
        this.wsHandler = wsHandler;
        this.healthMetrics = healthMetrics;
    }

    /**
     * Start the broadcast scheduler.
     */
    public void start() {
        if (running) return;
        running = true;

        broadcastScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "live-broadcast");
            t.setDaemon(true);
            return t;
        });

        broadcastScheduler.scheduleAtFixedRate(this::broadcastCycle,
                BROADCAST_INTERVAL_MS, BROADCAST_INTERVAL_MS, TimeUnit.MILLISECONDS);

        log.info("LiveBroadcastScheduler: Started (interval={}ms)", BROADCAST_INTERVAL_MS);
    }

    /**
     * Stop the broadcast scheduler.
     */
    public void stop() {
        running = false;
        if (broadcastScheduler != null) {
            broadcastScheduler.shutdown();
            try {
                broadcastScheduler.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                broadcastScheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        log.info("LiveBroadcastScheduler: Stopped");
    }

    /**
     * Enqueue a message to a specific session's backpressure queue.
     * Called from the computation thread — never blocks.
     */
    public void enqueueForSession(LiveSession session, String message) {
        boolean dropped = session.enqueue(message);
        if (dropped) {
            healthMetrics.incrementDroppedFrames();
        }
    }

    /**
     * Enqueue a message to all sessions subscribed to a given timeframe.
     */
    public void enqueueForTimeframe(String timeframe, String message) {
        for (LiveSession session : sessionManager.getAllSessions()) {
            if (session.getSubscribedTimeframes().contains(timeframe) && session.isOpen()) {
                enqueueForSession(session, message);
            }
        }
    }

    /**
     * Enqueue a message to all active sessions.
     */
    public void enqueueForAll(String message) {
        for (LiveSession session : sessionManager.getAllSessions()) {
            if (session.isOpen()) {
                enqueueForSession(session, message);
            }
        }
    }

    /**
     * Generate and enqueue delta patches for all active timeframes.
     * Called from the computation orchestrator after RRG updates.
     */
    public void generateAndEnqueuePatches(Set<String> updatedTimeframes) {
        long startNs = System.nanoTime();

        for (String timeframe : updatedTimeframes) {
            Set<String> visibleSectors = sessionManager.getAggregateVisibleSectors(timeframe);
            if (visibleSectors.isEmpty()) continue;

            String patch = patchGenerator.generatePatch(timeframe, visibleSectors);
            if (patch != null) {
                enqueueForTimeframe(timeframe, patch);
            }
        }

        healthMetrics.recordBroadcastLatency(System.nanoTime() - startNs);
    }

    /**
     * Single broadcast cycle: drain all session queues and send.
     * Runs on the broadcast thread.
     */
    private void broadcastCycle() {
        if (!running) return;

        try {
            int totalSent = 0;

            for (LiveSession session : sessionManager.getAllSessions()) {
                if (!session.isOpen()) continue;

                List<String> messages = session.drainQueue();
                for (String message : messages) {
                    wsHandler.sendToSession(session, message);
                    totalSent++;
                }
            }

            if (totalSent > 0) {
                healthMetrics.incrementTotalBroadcasts();
            }

            // Periodic heartbeat
            long now = System.currentTimeMillis();
            if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
                lastHeartbeatMs = now;
                healthMetrics.setQueueDepth(sessionManager.getTotalQueueDepth());
                String heartbeat = patchGenerator.generateHeartbeat(healthMetrics);
                for (LiveSession session : sessionManager.getAllSessions()) {
                    if (session.isOpen()) {
                        wsHandler.sendToSession(session, heartbeat);
                    }
                }
            }
        } catch (Exception e) {
            log.error("LiveBroadcastScheduler: Error in broadcast cycle", e);
        }
    }
}
