package com.vega.rrg.model.config;

public record RrgRuntimeConfigurationSnapshot(
    SettingsConfig settingsConfig,
    CommandBarConfig commandBarConfig,
    WatchlistConfig watchlistConfig,
    TimeframesConfig timeframesConfig,
    CachePolicyConfig cachePolicyConfig,
    FeatureFlagsConfig featureFlagsConfig,

    int configVersion,
    String configHash,
    long generationId,
    long loadedAt,
    
    String settingsHash,
    String commandBarHash,
    String watchlistHash,
    String timeframesHash,
    String cachePolicyHash,
    String featureFlagsHash
) {}
