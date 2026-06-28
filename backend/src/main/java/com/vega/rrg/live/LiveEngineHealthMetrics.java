package com.vega.rrg.live;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

/**
 * Centralized health metrics for the live RRG engine.
 * All fields are atomic for lock-free concurrent access.
 * Exposed via HEARTBEAT WebSocket messages and optionally via REST.
 */
@Component
public class LiveEngineHealthMetrics {

    private final AtomicLong tickLatencyNs = new AtomicLong(0);
    private final AtomicLong aggregationLatencyNs = new AtomicLong(0);
    private final AtomicLong rrgComputeLatencyNs = new AtomicLong(0);
    private final AtomicLong broadcastLatencyNs = new AtomicLong(0);
    private final AtomicLong droppedFrames = new AtomicLong(0);
    private final AtomicLong totalTicks = new AtomicLong(0);
    private final AtomicLong totalBroadcasts = new AtomicLong(0);
    private final AtomicInteger activeSessionCount = new AtomicInteger(0);
    private final AtomicInteger queueDepth = new AtomicInteger(0);
    private final AtomicLong lastComputationDurationNs = new AtomicLong(0);
    private final AtomicLong consecutiveSlowCycles = new AtomicLong(0);

    // --- Setters (called from computation/broadcast threads) ---

    public void recordTickLatency(long nanos) { tickLatencyNs.set(nanos); }
    public void recordAggregationLatency(long nanos) { aggregationLatencyNs.set(nanos); }
    public void recordRrgComputeLatency(long nanos) { rrgComputeLatencyNs.set(nanos); }
    public void recordBroadcastLatency(long nanos) { broadcastLatencyNs.set(nanos); }
    public void recordComputationDuration(long nanos) { lastComputationDurationNs.set(nanos); }
    public void incrementDroppedFrames() { droppedFrames.incrementAndGet(); }
    public void incrementTotalTicks() { totalTicks.incrementAndGet(); }
    public void incrementTotalBroadcasts() { totalBroadcasts.incrementAndGet(); }
    public void setActiveSessionCount(int count) { activeSessionCount.set(count); }
    public void setQueueDepth(int depth) { queueDepth.set(depth); }
    public void incrementConsecutiveSlowCycles() { consecutiveSlowCycles.incrementAndGet(); }
    public void resetConsecutiveSlowCycles() { consecutiveSlowCycles.set(0); }

    // --- Getters (called from broadcast/health endpoint threads) ---

    public long getTickLatencyNs() { return tickLatencyNs.get(); }
    public long getAggregationLatencyNs() { return aggregationLatencyNs.get(); }
    public long getRrgComputeLatencyNs() { return rrgComputeLatencyNs.get(); }
    public long getBroadcastLatencyNs() { return broadcastLatencyNs.get(); }
    public long getDroppedFrames() { return droppedFrames.get(); }
    public long getTotalTicks() { return totalTicks.get(); }
    public long getTotalBroadcasts() { return totalBroadcasts.get(); }
    public int getActiveSessionCount() { return activeSessionCount.get(); }
    public int getQueueDepth() { return queueDepth.get(); }
    public long getLastComputationDurationNs() { return lastComputationDurationNs.get(); }
    public long getConsecutiveSlowCycles() { return consecutiveSlowCycles.get(); }

    /**
     * Snapshot of current metrics for inclusion in HEARTBEAT messages.
     */
    public String toJsonFragment() {
        return String.format(
            "{\"tickLatencyUs\":%d,\"aggrLatencyUs\":%d,\"rrgLatencyUs\":%d,\"broadcastLatencyUs\":%d,"
            + "\"droppedFrames\":%d,\"totalTicks\":%d,\"sessions\":%d,\"queueDepth\":%d,\"computeUs\":%d}",
            tickLatencyNs.get() / 1000, aggregationLatencyNs.get() / 1000,
            rrgComputeLatencyNs.get() / 1000, broadcastLatencyNs.get() / 1000,
            droppedFrames.get(), totalTicks.get(), activeSessionCount.get(),
            queueDepth.get(), lastComputationDurationNs.get() / 1000
        );
    }
}
