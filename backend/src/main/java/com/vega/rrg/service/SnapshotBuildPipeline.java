package com.vega.rrg.service;

import com.vega.rrg.model.config.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class SnapshotBuildPipeline {

    private final RrgConfigValidator validator;
    private final RrgConfigMigrationService migrationService;
    private final ConfigHasher hasher;
    private final AtomicLong generationCounter = new AtomicLong(0);

    public SnapshotBuildPipeline(RrgConfigValidator validator, RrgConfigMigrationService migrationService, ConfigHasher hasher) {
        this.validator = validator;
        this.migrationService = migrationService;
        this.hasher = hasher;
    }

    public RrgRuntimeConfigurationSnapshot build(
            SettingsConfig rawSettings,
            CommandBarConfig rawCommandBar,
            WatchlistConfig rawWatchlist,
            TimeframesConfig rawTimeframes,
            CachePolicyConfig rawCachePolicy,
            FeatureFlagsConfig rawFeatureFlags) {
        
        long generationId = generationCounter.incrementAndGet();

        // Stage 2: Migrate
        SettingsConfig migratedSettings = migrationService.migrate(rawSettings);
        CommandBarConfig migratedCommandBar = migrationService.migrate(rawCommandBar);
        WatchlistConfig migratedWatchlist = migrationService.migrate(rawWatchlist);
        TimeframesConfig migratedTimeframes = migrationService.migrate(rawTimeframes);
        CachePolicyConfig migratedCachePolicy = migrationService.migrate(rawCachePolicy);
        FeatureFlagsConfig migratedFeatureFlags = migrationService.migrate(rawFeatureFlags);

        // Stage 3 & 4: Validate & Normalize
        SettingsConfig validSettings = validator.validate(migratedSettings);
        CommandBarConfig validCommandBar = validator.validate(migratedCommandBar);
        WatchlistConfig validWatchlist = validator.validate(migratedWatchlist);
        TimeframesConfig validTimeframes = validator.validate(migratedTimeframes); // Handle inheritance here
        CachePolicyConfig validCachePolicy = validator.validate(migratedCachePolicy);
        FeatureFlagsConfig validFeatureFlags = validator.validate(migratedFeatureFlags);

        // Stage 5: Hash
        String settingsHash = hasher.hash(validSettings);
        String commandBarHash = hasher.hash(validCommandBar);
        String watchlistHash = hasher.hash(validWatchlist);
        String timeframesHash = hasher.hash(validTimeframes);
        String cachePolicyHash = hasher.hash(validCachePolicy);
        String featureFlagsHash = hasher.hash(validFeatureFlags);

        String globalHash = hasher.hash(Map.of(
                "settings", settingsHash,
                "commandBar", commandBarHash,
                "watchlist", watchlistHash,
                "timeframes", timeframesHash,
                "cachePolicy", cachePolicyHash,
                "featureFlags", featureFlagsHash
        ));

        // Stage 6: Finalize (Immutable Snapshot)
        return new RrgRuntimeConfigurationSnapshot(
                validSettings,
                validCommandBar,
                validWatchlist,
                validTimeframes,
                validCachePolicy,
                validFeatureFlags,
                1, // configVersion
                globalHash,
                generationId,
                System.currentTimeMillis(),
                settingsHash,
                commandBarHash,
                watchlistHash,
                timeframesHash,
                cachePolicyHash,
                featureFlagsHash
        );
    }
}
