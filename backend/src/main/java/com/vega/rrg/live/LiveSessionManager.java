package com.vega.rrg.live;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Manages all active WebSocket sessions for the live RRG engine.
 * Enforces hard memory limits and provides aggregate visibility queries.
 */
@Slf4j
@Component
public class LiveSessionManager {

    // Hard limits (correction #16)
    private static final int MAX_SESSIONS = 10;
    private static final int MAX_SECTORS_PER_SESSION = 200;
    private static final long HEARTBEAT_TIMEOUT_MS = 30_000;

    private final ConcurrentHashMap<String, LiveSession> sessions = new ConcurrentHashMap<>();
    private final LiveEngineHealthMetrics healthMetrics;

    public LiveSessionManager(LiveEngineHealthMetrics healthMetrics) {
        this.healthMetrics = healthMetrics;
    }

    /**
     * Register a new WebSocket session.
     * Returns null if max sessions exceeded.
     */
    public LiveSession register(WebSocketSession wsSession) {
        if (sessions.size() >= MAX_SESSIONS) {
            log.warn("LiveSessionManager: Max sessions ({}) reached. Rejecting session {}",
                    MAX_SESSIONS, wsSession.getId());
            return null;
        }

        LiveSession session = new LiveSession(wsSession.getId(), wsSession);
        sessions.put(wsSession.getId(), session);
        healthMetrics.setActiveSessionCount(sessions.size());
        log.info("LiveSessionManager: Session registered. id={}, total={}", wsSession.getId(), sessions.size());
        return session;
    }

    /**
     * Unregister a session on disconnect.
     */
    public void unregister(String sessionId) {
        LiveSession removed = sessions.remove(sessionId);
        if (removed != null) {
            healthMetrics.setActiveSessionCount(sessions.size());
            log.info("LiveSessionManager: Session unregistered. id={}, total={}", sessionId, sessions.size());
        }
    }

    /**
     * Get a session by ID.
     */
    public LiveSession getSession(String sessionId) {
        return sessions.get(sessionId);
    }

    /**
     * Returns all active sessions.
     */
    public Collection<LiveSession> getAllSessions() {
        return sessions.values();
    }

    /**
     * Returns the aggregate set of visible sectors across all sessions for a given timeframe.
     * This determines which sectors the incremental engine needs to compute.
     */
    public Set<String> getAggregateVisibleSectors(String timeframe) {
        Set<String> aggregate = new HashSet<>();
        for (LiveSession session : sessions.values()) {
            if (session.getSubscribedTimeframes().contains(timeframe)) {
                Set<String> visible = session.getVisibleSectors();
                if (visible != null && !visible.isEmpty()) {
                    aggregate.addAll(visible);
                }
            }
        }
        return aggregate;
    }

    /**
     * Returns the set of all timeframes any session is subscribed to.
     */
    public Set<String> getActiveTimeframes() {
        Set<String> timeframes = new HashSet<>();
        for (LiveSession session : sessions.values()) {
            timeframes.addAll(session.getSubscribedTimeframes());
        }
        return timeframes;
    }

    /**
     * Returns whether any sessions are active.
     */
    public boolean hasActiveSessions() {
        return !sessions.isEmpty();
    }

    /**
     * Returns the maximum sectors per session limit.
     */
    public int getMaxSectorsPerSession() {
        return MAX_SECTORS_PER_SESSION;
    }

    /**
     * Periodic heartbeat cleanup — remove expired sessions.
     * Runs every 10 seconds.
     */
    @Scheduled(fixedRate = 10_000)
    public void cleanupExpiredSessions() {
        List<String> expired = sessions.entrySet().stream()
                .filter(e -> e.getValue().isExpired(HEARTBEAT_TIMEOUT_MS) || !e.getValue().isOpen())
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        for (String sessionId : expired) {
            unregister(sessionId);
            log.info("LiveSessionManager: Expired session cleaned up. id={}", sessionId);
        }
    }

    /**
     * Total queue depth across all sessions.
     */
    public int getTotalQueueDepth() {
        return sessions.values().stream().mapToInt(LiveSession::getQueueSize).sum();
    }
}
