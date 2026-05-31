package com.vega.rrg.model.config;

import java.util.Map;

public record FeatureFlagsConfig(
    int version,
    long updatedAt,
    Map<String, Boolean> features
) {
    public FeatureFlagsConfig {
        features = features != null ? Map.copyOf(features) : Map.of();
    }

    public FeatureFlagsConfig() {
        this(1, 0, null);
    }
}
