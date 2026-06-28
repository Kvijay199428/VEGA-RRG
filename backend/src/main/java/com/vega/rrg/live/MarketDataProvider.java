package com.vega.rrg.live;

import com.vega.rrg.model.LiveMode;

import java.util.function.Consumer;

/**
 * Interface for tick data sources.
 * Implementations: DemoMarketDataService (deterministic simulation),
 * and future real market providers (Dhan, Kite, AngelOne, Upstox).
 */
public interface MarketDataProvider {

    /**
     * Start generating ticks. Each tick is passed to the consumer.
     * Must be idempotent — calling start() when already running is a no-op.
     */
    void start(Consumer<MarketTick> tickConsumer);

    /**
     * Stop generating ticks. Must be idempotent.
     */
    void stop();

    /**
     * Returns the LiveMode this provider operates in.
     */
    LiveMode getMode();

    /**
     * Returns true if currently generating ticks.
     */
    boolean isRunning();
}
