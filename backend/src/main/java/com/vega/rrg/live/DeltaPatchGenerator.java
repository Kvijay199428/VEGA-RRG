package com.vega.rrg.live;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Generates minimal delta patches for WebSocket broadcasting (correction #8).
 *
 * Instead of sending full sector arrays every broadcast:
 * - Tracks previous broadcast state per timeframe
 * - Computes diff: only sectors whose position changed beyond threshold
 * - Generates PATCH messages with sequential seq numbers
 * - Full SNAPSHOT only on initial connect, reconnect, or desync recovery
 */
@Slf4j
@Component
public class DeltaPatchGenerator {

    private static final double CHANGE_THRESHOLD = 0.001;

    private final LiveRrgStateCache stateCache;
    private final HybridTrailComposer trailComposer;
    private final ObjectMapper objectMapper;

    // Previous broadcast state: timeframe → sector → {x, y}
    private final Map<String, Map<String, double[]>> previousState = new ConcurrentHashMap<>();

    // Sequence counter per timeframe
    private final Map<String, Long> sequenceCounters = new ConcurrentHashMap<>();

    public DeltaPatchGenerator(LiveRrgStateCache stateCache, HybridTrailComposer trailComposer) {
        this.stateCache = stateCache;
        this.trailComposer = trailComposer;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Generate a full SNAPSHOT message for a timeframe (used on initial connect).
     * Uses HybridTrailComposer as the SINGLE SOURCE OF TRUTH for trail data.
     * Includes historicalCount/liveCount/provisionalCount per point (correction #6).
     */
    public String generateSnapshot(String timeframe, Set<String> visibleSectors,
                                    int trailLength, String benchmark, boolean normalized) {
        Map<String, LiveRrgState> states = stateCache.getAllStates(timeframe);

        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "SNAPSHOT");
        root.put("timeframe", timeframe);
        root.put("timestamp", System.currentTimeMillis());

        long seq = sequenceCounters.merge(timeframe, 1L, Long::sum);
        root.put("seq", seq);

        ArrayNode pointsArray = root.putArray("points");

        for (Map.Entry<String, LiveRrgState> entry : states.entrySet()) {
            String sector = entry.getKey();
            if (!visibleSectors.contains(sector)) continue;

            LiveRrgState state = entry.getValue();

            // Compose hybrid trail via single source of truth
            HybridTrail hybridTrail = trailComposer.compose(
                    sector, benchmark, timeframe, trailLength, normalized);

            ObjectNode point = createPointNode(sector, state, hybridTrail);
            pointsArray.add(point);

            // Update previous state for delta tracking
            previousState.computeIfAbsent(timeframe, k -> new ConcurrentHashMap<>())
                    .put(sector, new double[]{state.getLatestX(), state.getLatestY()});
        }

        return root.toString();
    }

    /**
     * Generate a PATCH message containing only changed sectors (correction #8).
     * Returns null if no sectors changed beyond threshold.
     */
    public String generatePatch(String timeframe, Set<String> visibleSectors) {
        Map<String, LiveRrgState> currentStates = stateCache.getAllStates(timeframe);
        Map<String, double[]> prevStates = previousState.computeIfAbsent(timeframe, k -> new ConcurrentHashMap<>());

        List<Map.Entry<String, LiveRrgState>> changed = new ArrayList<>();

        for (Map.Entry<String, LiveRrgState> entry : currentStates.entrySet()) {
            String sector = entry.getKey();
            if (!visibleSectors.contains(sector)) continue;

            LiveRrgState state = entry.getValue();
            double[] prev = prevStates.get(sector);

            if (prev == null
                    || Math.abs(state.getLatestX() - prev[0]) > CHANGE_THRESHOLD
                    || Math.abs(state.getLatestY() - prev[1]) > CHANGE_THRESHOLD) {
                changed.add(entry);
            }
        }

        if (changed.isEmpty()) return null;

        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "PATCH");
        root.put("timeframe", timeframe);
        root.put("timestamp", System.currentTimeMillis());

        long seq = sequenceCounters.merge(timeframe, 1L, Long::sum);
        root.put("seq", seq);

        ArrayNode changesArray = root.putArray("changes");

        for (Map.Entry<String, LiveRrgState> entry : changed) {
            String sector = entry.getKey();
            LiveRrgState state = entry.getValue();

            ObjectNode change = objectMapper.createObjectNode();
            change.put("symbol", sector);
            change.put("x", round6(state.getLatestX()));
            change.put("y", round6(state.getLatestY()));
            change.put("q", state.getQuadrant());
            change.put("provisional", state.isProvisional());
            change.put("vx", round6(state.getVelocityX()));
            change.put("vy", round6(state.getVelocityY()));
            change.put("ax", round6(state.getAccelerationX()));
            change.put("ay", round6(state.getAccelerationY()));

            // Include the latest trail point only (not the full trail)
            if (!state.getCanonicalTrail().isEmpty()) {
                LiveRrgState.LiveTrailPoint lastTrail = state.getCanonicalTrail().peekLast();
                ObjectNode tp = objectMapper.createObjectNode();
                tp.put("t", lastTrail.epochMillis());
                tp.put("x", round6(lastTrail.x()));
                tp.put("y", round6(lastTrail.y()));
                tp.put("p", lastTrail.provisional());
                change.set("trailPoint", tp);
            }

            changesArray.add(change);

            // Update previous state
            prevStates.put(sector, new double[]{state.getLatestX(), state.getLatestY()});
        }

        return root.toString();
    }

    /**
     * Generate a HEARTBEAT message with health metrics.
     */
    public String generateHeartbeat(LiveEngineHealthMetrics metrics) {
        return String.format(
            "{\"type\":\"HEARTBEAT\",\"timestamp\":%d,\"metrics\":%s}",
            System.currentTimeMillis(), metrics.toJsonFragment()
        );
    }

    /**
     * Generate a FALLBACK message (circuit breaker triggered).
     */
    public String generateFallback(String reason) {
        return String.format(
            "{\"type\":\"FALLBACK\",\"timestamp\":%d,\"reason\":\"%s\"}",
            System.currentTimeMillis(), reason.replace("\"", "\\\"")
        );
    }

    /**
     * Get current sequence number for a timeframe.
     */
    public long getSequence(String timeframe) {
        return sequenceCounters.getOrDefault(timeframe, 0L);
    }

    /**
     * Reset delta tracking state (used on live mode restart).
     */
    public void reset() {
        previousState.clear();
        sequenceCounters.clear();
    }

    /**
     * Create a SNAPSHOT point node using HybridTrail (single source of truth).
     * Boundary metadata sent as top-level integers, NOT per-point markers (correction #6).
     */
    private ObjectNode createPointNode(String sector, LiveRrgState state, HybridTrail hybridTrail) {
        ObjectNode point = objectMapper.createObjectNode();
        point.put("symbol", sector);
        point.put("x", round6(state.getLatestX()));
        point.put("y", round6(state.getLatestY()));
        point.put("quadrant", state.getQuadrant());
        point.put("provisional", state.isProvisional());
        point.put("vx", round6(state.getVelocityX()));
        point.put("vy", round6(state.getVelocityY()));

        // Boundary metadata — SNAPSHOT only (correction #3)
        point.put("historicalCount", hybridTrail.historicalCount());
        point.put("liveCount", hybridTrail.liveCount());
        point.put("provisionalCount", hybridTrail.provisionalCount());
        point.put("requestedLength", hybridTrail.requestedLength());
        point.put("availableLength", hybridTrail.availableLength());

        // Stable trail points from HybridTrailComposer
        ArrayNode trailArray = point.putArray("trail");
        for (LiveRrgState.LiveTrailPoint tp : hybridTrail.stablePoints()) {
            ObjectNode tpNode = objectMapper.createObjectNode();
            tpNode.put("epochMillis", tp.epochMillis());
            tpNode.put("x", round6(tp.x()));
            tpNode.put("y", round6(tp.y()));
            tpNode.put("provisional", false); // stable points are never provisional
            trailArray.add(tpNode);
        }

        // Provisional overlay point (separate from stable trail)
        if (hybridTrail.provisionalPoint() != null) {
            ObjectNode tpNode = objectMapper.createObjectNode();
            tpNode.put("epochMillis", hybridTrail.provisionalPoint().epochMillis());
            tpNode.put("x", round6(hybridTrail.provisionalPoint().x()));
            tpNode.put("y", round6(hybridTrail.provisionalPoint().y()));
            tpNode.put("provisional", true);
            trailArray.add(tpNode);
        }

        return point;
    }

    private double round6(double value) {
        return Math.round(value * 1_000_000.0) / 1_000_000.0;
    }
}
