package com.vega.rrg.live;

import lombok.Data;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-WebSocket-client session state.
 * Tracks subscriptions, visibility, and maintains a backpressure ring buffer.
 */
@Data
public class LiveSession {

    private final String sessionId;
    private final WebSocketSession webSocketSession;
    private final long createdAt;

    // Subscriptions
    private volatile Set<String> subscribedTimeframes = Set.of();
    private volatile String benchmark = "NSE_INDEX_Nifty 50";

    // Visibility-based computation (correction #9)
    private volatile Set<String> visibleSectors = Set.of();

    // Heartbeat
    private final AtomicLong lastHeartbeat = new AtomicLong(System.currentTimeMillis());

    // Backpressure ring buffer (correction #11)
    private static final int MAX_QUEUE_SIZE = 50;
    private final ArrayDeque<String> outboundQueue = new ArrayDeque<>(MAX_QUEUE_SIZE);

    // Delta tracking
    private final AtomicLong lastAckedSequence = new AtomicLong(0);

    public LiveSession(String sessionId, WebSocketSession webSocketSession) {
        this.sessionId = sessionId;
        this.webSocketSession = webSocketSession;
        this.createdAt = System.currentTimeMillis();
    }

    /**
     * Enqueue a message to the outbound ring buffer.
     * Uses drop-oldest strategy — never blocks.
     * Returns true if a message was dropped.
     */
    public synchronized boolean enqueue(String message) {
        boolean dropped = false;
        if (outboundQueue.size() >= MAX_QUEUE_SIZE) {
            outboundQueue.pollFirst(); // drop oldest
            dropped = true;
        }
        outboundQueue.addLast(message);
        return dropped;
    }

    /**
     * Drain all queued messages for sending.
     * Returns an empty list if nothing queued.
     */
    public synchronized List<String> drainQueue() {
        if (outboundQueue.isEmpty()) return List.of();
        List<String> messages = new ArrayList<>(outboundQueue);
        outboundQueue.clear();
        return messages;
    }

    public int getQueueSize() {
        return outboundQueue.size();
    }

    public void updateHeartbeat() {
        lastHeartbeat.set(System.currentTimeMillis());
    }

    public boolean isExpired(long timeoutMs) {
        return System.currentTimeMillis() - lastHeartbeat.get() > timeoutMs;
    }

    public boolean isOpen() {
        return webSocketSession != null && webSocketSession.isOpen();
    }

    public void updateSubscription(Set<String> timeframes, String benchmark, Set<String> visibleSectors) {
        this.subscribedTimeframes = Set.copyOf(timeframes);
        this.benchmark = benchmark;
        this.visibleSectors = Set.copyOf(visibleSectors);
        updateHeartbeat();
    }

    public void updateVisibility(Set<String> visibleSectors) {
        this.visibleSectors = Set.copyOf(visibleSectors);
        updateHeartbeat();
    }
}
