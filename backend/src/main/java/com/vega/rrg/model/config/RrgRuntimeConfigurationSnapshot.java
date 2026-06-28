package com.vega.rrg.model.config;

public record RrgRuntimeConfigurationSnapshot(
    SettingsConfig settingsConfig,
    RrgPreferences preferencesConfig,
    WatchlistConfig watchlistConfig,
    TimeframesConfig timeframesConfig,
    CachePolicyConfig cachePolicyConfig,
    FeatureFlagsConfig featureFlagsConfig,
    ReplayConfig replayConfig,

    int configVersion,
    String configHash,
    long generationId,
    long loadedAt,
    
    String settingsHash,
    String preferencesHash,
    String watchlistHash,
    String timeframesHash,
    String cachePolicyHash,
    String featureFlagsHash,
    String replayHash
) {}
