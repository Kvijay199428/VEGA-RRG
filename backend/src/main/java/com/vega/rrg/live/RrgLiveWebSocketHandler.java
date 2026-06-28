package com.vega.rrg.live;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

/**
 * WebSocket handler for live RRG streaming.
 *
 * Client → Server protocol:
 *   SUBSCRIBE: { type: "SUBSCRIBE", timeframes: [...], benchmark: "...", visibleSectors: [...] }
 *   VISIBILITY_UPDATE: { type: "VISIBILITY_UPDATE", visibleSectors: [...] }
 *   PING: { type: "PING" }
 *
 * Server → Client protocol:
 *   SNAPSHOT: full sector data on connect/reconnect
 *   PATCH: delta updates with seq numbers
 *   HEARTBEAT: health metrics
 *   FALLBACK: circuit breaker triggered, client should switch to REST
 */
@Slf4j
@Component
public class RrgLiveWebSocketHandler extends TextWebSocketHandler {

    private final LiveSessionManager sessionManager;
    private final DeltaPatchGenerator patchGenerator;
    private final ObjectMapper objectMapper;

    public RrgLiveWebSocketHandler(LiveSessionManager sessionManager,
                                    DeltaPatchGenerator patchGenerator) {
        this.sessionManager = sessionManager;
        this.patchGenerator = patchGenerator;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        LiveSession liveSession = sessionManager.register(session);
        if (liveSession == null) {
            // Max sessions exceeded — reject
            try {
                session.sendMessage(new TextMessage(
                    "{\"type\":\"ERROR\",\"message\":\"Max live sessions exceeded. Try again later.\"}"));
                session.close(CloseStatus.POLICY_VIOLATION);
            } catch (IOException e) {
                log.error("Failed to reject session {}", session.getId(), e);
            }
            return;
        }
        log.info("WebSocket connected: id={}, remote={}", session.getId(), session.getRemoteAddress());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        LiveSession liveSession = sessionManager.getSession(session.getId());
        if (liveSession == null) {
            log.warn("Received message for unknown session: {}", session.getId());
            return;
        }

        try {
            JsonNode root = objectMapper.readTree(message.getPayload());
            String type = root.has("type") ? root.get("type").asText() : "";

            switch (type) {
                case "SUBSCRIBE" -> handleSubscribe(liveSession, root);
                case "VISIBILITY_UPDATE" -> handleVisibilityUpdate(liveSession, root);
                case "PING" -> handlePing(liveSession, session);
                default -> log.warn("Unknown message type: {} from session {}", type, session.getId());
            }
        } catch (Exception e) {
            log.error("Error handling message from session {}", session.getId(), e);
        }
    }

    private void handleSubscribe(LiveSession session, JsonNode root) {
        Set<String> timeframes = new HashSet<>();
        if (root.has("timeframes") && root.get("timeframes").isArray()) {
            root.get("timeframes").forEach(tf -> timeframes.add(tf.asText()));
        }

        String benchmark = root.has("benchmark") ? root.get("benchmark").asText() : "NSE_INDEX_Nifty 50";

        Set<String> visibleSectors = new HashSet<>();
        if (root.has("visibleSectors") && root.get("visibleSectors").isArray()) {
            root.get("visibleSectors").forEach(s -> visibleSectors.add(s.asText()));
        }

        // Enforce sector limit
        int maxSectors = sessionManager.getMaxSectorsPerSession();
        Set<String> finalVisibleSectors = visibleSectors;
        if (visibleSectors.size() > maxSectors) {
            log.warn("Session {} requested {} sectors, capping to {}",
                    session.getSessionId(), visibleSectors.size(), maxSectors);
            finalVisibleSectors = new HashSet<>(visibleSectors.stream().limit(maxSectors).toList());
        }

        session.updateSubscription(timeframes, benchmark, finalVisibleSectors);
        log.info("Session {} subscribed: timeframes={}, benchmark={}, sectors={}",
                session.getSessionId(), timeframes, benchmark, finalVisibleSectors.size());

        // Parse optional fields
        int trailLength = root.has("trailLength") ? root.get("trailLength").asInt(10) : 10;
        boolean normalized = !root.has("normalized") || root.get("normalized").asBoolean(true);

        // Send initial SNAPSHOT for each subscribed timeframe
        Set<String> snapshotSectors = finalVisibleSectors;
        for (String tf : timeframes) {
            try {
                String snapshot = patchGenerator.generateSnapshot(
                        tf, snapshotSectors, trailLength, benchmark, normalized);
                session.getWebSocketSession().sendMessage(new TextMessage(snapshot));
            } catch (IOException e) {
                log.error("Failed to send initial SNAPSHOT to session {} for timeframe {}",
                        session.getSessionId(), tf, e);
            }
        }
    }

    private void handleVisibilityUpdate(LiveSession session, JsonNode root) {
        Set<String> visibleSectors = new HashSet<>();
        if (root.has("visibleSectors") && root.get("visibleSectors").isArray()) {
            root.get("visibleSectors").forEach(s -> visibleSectors.add(s.asText()));
        }

        int maxSectors = sessionManager.getMaxSectorsPerSession();
        Set<String> finalVisibleSectors = visibleSectors;
        if (visibleSectors.size() > maxSectors) {
            finalVisibleSectors = new HashSet<>(visibleSectors.stream().limit(maxSectors).toList());
        }

        session.updateVisibility(finalVisibleSectors);
        log.debug("Session {} visibility updated: {} sectors", session.getSessionId(), finalVisibleSectors.size());
    }

    private void handlePing(LiveSession session, WebSocketSession wsSession) {
        session.updateHeartbeat();
        try {
            wsSession.sendMessage(new TextMessage(
                String.format("{\"type\":\"PONG\",\"timestamp\":%d}", System.currentTimeMillis())));
        } catch (IOException e) {
            log.error("Failed to send PONG to session {}", session.getSessionId(), e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessionManager.unregister(session.getId());
        log.info("WebSocket disconnected: id={}, status={}", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket transport error for session {}", session.getId(), exception);
        sessionManager.unregister(session.getId());
    }

    /**
     * Send a text message to a specific session.
     * Called by LiveBroadcastScheduler.
     */
    public void sendToSession(LiveSession session, String message) {
        if (!session.isOpen()) return;
        try {
            session.getWebSocketSession().sendMessage(new TextMessage(message));
        } catch (IOException e) {
            log.error("Failed to send message to session {}", session.getSessionId(), e);
        }
    }
}
