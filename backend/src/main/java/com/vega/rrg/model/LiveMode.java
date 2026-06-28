package com.vega.rrg.model;

/**
 * Represents the live data mode for the RRG engine.
 * OFF = no live engine (historical snapshot only)
 * DEMO = simulated deterministic tick stream
 * LIVE = real market data (future: Dhan, Kite, etc.)
 */
public enum LiveMode {
    OFF,
    DEMO,
    LIVE
}
