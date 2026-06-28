package com.vega.rrg.live;

/**
 * A single price tick from a market data source.
 * This is the atomic unit of live data flowing through the pipeline.
 */
public record MarketTick(
    String symbol,
    double price,
    double volume,
    long timestampMs
) {}
