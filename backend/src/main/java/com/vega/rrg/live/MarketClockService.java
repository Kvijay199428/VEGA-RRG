package com.vega.rrg.live;

import com.vega.rrg.model.LiveMode;
import com.vega.rrg.service.TradingSessionProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Central time authority for the entire live pipeline.
 * All live components use marketClock.now() instead of System.currentTimeMillis().
 *
 * Supports three modes:
 * - LIVE: delegates to system clock, aligned to IST
 * - DEMO: deterministic simulated clock advancing at configurable speed
 * - REPLAY: accelerated replay clock from a start timestamp
 */
@Slf4j
@Service
public class MarketClockService {

    private final TradingSessionProvider sessionProvider;

    private final AtomicReference<LiveMode> mode = new AtomicReference<>(LiveMode.OFF);
    private final AtomicLong demoStartRealMs = new AtomicLong(0);
    private final AtomicLong demoStartSimMs = new AtomicLong(0);
    private volatile double speedMultiplier = 1.0;

    // Replay state
    private final AtomicLong replayStartRealMs = new AtomicLong(0);
    private final AtomicLong replayStartSimMs = new AtomicLong(0);

    public MarketClockService(TradingSessionProvider sessionProvider) {
        this.sessionProvider = sessionProvider;
    }

    /**
     * Returns the current market time in epoch milliseconds.
     * In LIVE mode: system clock.
     * In DEMO mode: simulated clock starting from today's market open.
     * In REPLAY mode: accelerated clock from replay start.
     */
    public long now() {
        switch (mode.get()) {
            case DEMO:
                long demoElapsed = System.currentTimeMillis() - demoStartRealMs.get();
                return demoStartSimMs.get() + (long) (demoElapsed * speedMultiplier);
            case LIVE:
                return System.currentTimeMillis();
            default:
                return System.currentTimeMillis();
        }
    }

    /**
     * Returns today's session open time in epoch milliseconds.
     */
    public long getSessionOpenMs() {
        ZonedDateTime today = LocalDate.now().atTime(sessionProvider.getOpenTime())
                .atZone(sessionProvider.getZoneId());
        return today.toInstant().toEpochMilli();
    }

    /**
     * Returns today's session close time in epoch milliseconds.
     */
    public long getSessionCloseMs() {
        ZonedDateTime today = LocalDate.now().atTime(sessionProvider.getCloseTime())
                .atZone(sessionProvider.getZoneId());
        return today.toInstant().toEpochMilli();
    }

    /**
     * Returns whether the market is currently open based on the clock mode.
     */
    public boolean isMarketOpen() {
        long current = now();
        return current >= getSessionOpenMs() && current <= getSessionCloseMs();
    }

    /**
     * Floors a timestamp to the nearest minute boundary.
     */
    public long getMinuteBoundary(long epochMs) {
        return (epochMs / 60_000L) * 60_000L;
    }

    /**
     * Returns the minute-of-session (0-based) for a given timestamp.
     */
    public int getSessionMinute(long epochMs) {
        long openMs = getSessionOpenMs();
        if (epochMs < openMs) return 0;
        return (int) ((epochMs - openMs) / 60_000L);
    }

    /**
     * Activates DEMO mode. Simulated clock starts from today's market open
     * and advances at the given speed multiplier.
     */
    public void setDemoMode(double speedMultiplier) {
        this.speedMultiplier = speedMultiplier;
        this.demoStartRealMs.set(System.currentTimeMillis());
        this.demoStartSimMs.set(getSessionOpenMs());
        this.mode.set(LiveMode.DEMO);
        log.info("MarketClock: DEMO mode activated. speed={}x, simStart={}",
                speedMultiplier, Instant.ofEpochMilli(demoStartSimMs.get()));
    }

    /**
     * Activates REPLAY mode from a specific start timestamp.
     */
    public void setReplayMode(long startMs, double speedMultiplier) {
        this.speedMultiplier = speedMultiplier;
        this.replayStartRealMs.set(System.currentTimeMillis());
        this.replayStartSimMs.set(startMs);
        this.mode.set(LiveMode.LIVE); // Replay uses LIVE enum but with offset
        log.info("MarketClock: REPLAY mode activated. start={}, speed={}x",
                Instant.ofEpochMilli(startMs), speedMultiplier);
    }

    /**
     * Activates LIVE mode (real system clock).
     */
    public void setLiveMode() {
        this.speedMultiplier = 1.0;
        this.mode.set(LiveMode.LIVE);
        log.info("MarketClock: LIVE mode activated");
    }

    /**
     * Resets to OFF mode.
     */
    public void reset() {
        this.mode.set(LiveMode.OFF);
        this.speedMultiplier = 1.0;
        log.info("MarketClock: reset to OFF");
    }

    public LiveMode getMode() {
        return mode.get();
    }

    public double getSpeedMultiplier() {
        return speedMultiplier;
    }
}
