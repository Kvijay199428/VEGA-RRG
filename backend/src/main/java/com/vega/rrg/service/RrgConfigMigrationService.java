package com.vega.rrg.service;

import com.vega.rrg.model.config.*;
import org.springframework.stereotype.Service;

@Service
public class RrgConfigMigrationService {

    public SettingsConfig migrate(SettingsConfig config) {
        if (config == null) return new SettingsConfig();
        return config;
    }

    public CommandBarConfig migrate(CommandBarConfig config) {
        if (config == null) return new CommandBarConfig();
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
}
