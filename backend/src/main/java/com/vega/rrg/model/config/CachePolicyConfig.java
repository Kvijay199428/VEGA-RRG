package com.vega.rrg.model.config;

import java.util.Map;

public record CachePolicyConfig(
    int version,
    long updatedAt,
    Map<String, Long> ttl,
    Map<String, Boolean> backgroundRefresh
) {
    public CachePolicyConfig {
        ttl = ttl != null ? Map.copyOf(ttl) : Map.of();
        backgroundRefresh = backgroundRefresh != null ? Map.copyOf(backgroundRefresh) : Map.of();
    }

    public CachePolicyConfig() {
        this(1, 0, null, null);
    }
}
