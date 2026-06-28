package com.vega.rrg.service;

import com.vega.rrg.model.config.*;
import org.springframework.stereotype.Service;

@Service
public class RrgConfigMigrationService {

    public SettingsConfig migrate(SettingsConfig config) {
        if (config == null) return new SettingsConfig();

        // Forward-migration: inject default trailReplay for JSON files that predate this field
        if (config.trailReplay() == null) {
            return new SettingsConfig(
                config.version(),
                config.updatedAt(),
                config.optimization(),
                config.rendering(),
                config.camera(),
                config.interaction(),
                config.windowing(),
                new SettingsConfig.TrailReplayConfig()
            );
        }

        return config;
    }

    public RrgPreferences migrate(RrgPreferences config) {
        if (config == null) return new RrgPreferences();
        return config;
    }

    public WatchlistConfig migrate(WatchlistConfig config) {
        if (config == null) return new WatchlistConfig();
        return config;
    }

    public TimeframesConfig migrate(TimeframesConfig config) {
        if (config == null) return new TimeframesConfig();
        return config;
    }

    public CachePolicyConfig migrate(CachePolicyConfig config) {
        if (config == null) return new CachePolicyConfig();
        return config;
    }

    public FeatureFlagsConfig migrate(FeatureFlagsConfig config) {
        if (config == null) return new FeatureFlagsConfig();
        return config;
    }

    public ReplayConfig migrate(ReplayConfig config) {
        if (config == null) return new ReplayConfig();
        return config;
    }
}
