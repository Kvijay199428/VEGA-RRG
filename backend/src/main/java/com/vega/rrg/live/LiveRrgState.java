package com.vega.rrg.live;

import com.vega.rrg.model.RrgPoint;
import lombok.Data;

import java.util.ArrayDeque;

/**
 * Per-sector incremental RRG state.
 * NO trail length dimension — trail length is VIEW STATE, not COMPUTATION STATE.
 *
 * Contains:
 * - Current position (x, y)
 * - Velocity and acceleration for predictive interpolation (correction #10)
 * - Canonical trail deque (full length, frontend slices)
 * - EMA/SMA carry-forward state for O(1) incremental updates
 * - Provisional flag for in-progress candle rendering (correction #4)
 */
@Data
public class LiveRrgState {

    /** Maximum canonical trail length — frontend slices to desired length */
    public static final int MAX_CANONICAL_TRAIL = 120;

    // --- Current position ---
    private double latestX;      // RS-Ratio
    private double latestY;      // RS-Momentum
    private String quadrant;

    // --- Velocity and acceleration (correction #10) ---
    private double velocityX;
    private double velocityY;
    private double accelerationX;
    private double accelerationY;

    // --- Canonical trail (correction #5 — no trail length dimension) ---
    private final ArrayDeque<LiveTrailPoint> canonicalTrail;

    // --- EMA/SMA carry-forward state for O(1) updates ---
    private double previousRawRs;
    private final double[] smaWindow;       // circular buffer for SMA window values
    private int smaWindowIndex;             // current write position in circular buffer
    private double smaWindowSum;            // running sum of SMA window
    private boolean smaWindowFull;          // true once we've filled the SMA window
    private double previousEmaX;            // EMA of RS-Ratio series
    private double previousEmaY;            // EMA of RS-Momentum series
    private double previousSmoothEmaX;      // for emaSmoothing > 1
    private double previousSmoothEmaY;      // for emaSmoothing > 1
    private int candleCount;                // total candles processed

    // --- Metadata ---
    private long updatedAt;
    private boolean provisional;             // true if last update was from provisional candle

    // --- Normalization state ---
    private final double axisCenter;         // 100.0 for normalized, 1.0 for raw
    private final boolean normalized;

    /**
     * Create a new LiveRrgState for a given SMA period and normalization mode.
     */
    public LiveRrgState(int smaPeriod, boolean normalized) {
        this.smaWindow = new double[smaPeriod];
        this.smaWindowIndex = 0;
        this.smaWindowSum = 0;
        this.smaWindowFull = false;
        this.canonicalTrail = new ArrayDeque<>(MAX_CANONICAL_TRAIL);
        this.candleCount = 0;
        this.normalized = normalized;
        this.axisCenter = normalized ? 100.0 : 1.0;
        this.quadrant = "LAGGING";
    }

    /**
     * Append a trail point, trimming to max capacity.
     */
    public void appendTrailPoint(LiveTrailPoint point) {
        if (canonicalTrail.size() >= MAX_CANONICAL_TRAIL) {
            canonicalTrail.pollFirst();
        }
        canonicalTrail.addLast(point);
    }

    /**
     * Replace the last trail point (used when updating provisional → final).
     */
    public void replaceLastTrailPoint(LiveTrailPoint point) {
        if (!canonicalTrail.isEmpty()) {
            canonicalTrail.pollLast();
        }
        canonicalTrail.addLast(point);
    }

    /**
     * Update the SMA circular buffer and return the new SMA value.
     */
    public double updateSmaAndGet(double newValue) {
        double oldValue = smaWindow[smaWindowIndex];
        smaWindow[smaWindowIndex] = newValue;
        smaWindowIndex = (smaWindowIndex + 1) % smaWindow.length;

        if (!smaWindowFull) {
            smaWindowSum += newValue;
            if (smaWindowIndex == 0) {
                smaWindowFull = true;
            }
            if (!smaWindowFull) {
                // Not enough data yet — return center value
                return axisCenter;
            }
        } else {
            smaWindowSum = smaWindowSum - oldValue + newValue;
        }

        return smaWindowSum / smaWindow.length;
    }

    /**
     * Compute quadrant based on position relative to axis center.
     */
    public static String computeQuadrant(double x, double y, double axisCenter) {
        if (x >= axisCenter && y >= axisCenter) return "LEADING";
        if (x >= axisCenter && y < axisCenter) return "WEAKENING";
        if (x < axisCenter && y < axisCenter) return "LAGGING";
        return "IMPROVING";
    }

    /**
     * Create an RrgPoint snapshot (for broadcast) with a given trail length slice.
     */
    public RrgPoint toRrgPoint(String symbol, int trailLength) {
        java.util.List<RrgPoint.TrailPoint> trail = new java.util.ArrayList<>();
        int skip = Math.max(0, canonicalTrail.size() - trailLength);
        int idx = 0;
        for (LiveTrailPoint ltp : canonicalTrail) {
            if (idx >= skip) {
                trail.add(RrgPoint.TrailPoint.builder()
                        .epochMillis(ltp.epochMillis())
                        .x(ltp.x())
                        .y(ltp.y())
                        .build());
            }
            idx++;
        }

        return RrgPoint.builder()
                .symbol(symbol)
                .x(latestX)
                .y(latestY)
                .quadrant(quadrant)
                .trail(trail)
                .stale(false)
                .computedAt(updatedAt)
                .build();
    }

    /**
     * Immutable trail point record.
     */
    public record LiveTrailPoint(
        long epochMillis,
        double x,
        double y,
        boolean provisional
    ) {}
}
