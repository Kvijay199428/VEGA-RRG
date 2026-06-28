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
            RrgPreferences rawPreferences,
            WatchlistConfig rawWatchlist,
            TimeframesConfig rawTimeframes,
            CachePolicyConfig rawCachePolicy,
            FeatureFlagsConfig rawFeatureFlags,
            ReplayConfig rawReplayConfig) {
        
        long generationId = generationCounter.incrementAndGet();

        // Stage 2: Migrate
        SettingsConfig migratedSettings = migrationService.migrate(rawSettings);
        RrgPreferences migratedPreferences = migrationService.migrate(rawPreferences);
        WatchlistConfig migratedWatchlist = migrationService.migrate(rawWatchlist);
        TimeframesConfig migratedTimeframes = migrationService.migrate(rawTimeframes);
        CachePolicyConfig migratedCachePolicy = migrationService.migrate(rawCachePolicy);
        FeatureFlagsConfig migratedFeatureFlags = migrationService.migrate(rawFeatureFlags);
        ReplayConfig migratedReplayConfig = migrationService.migrate(rawReplayConfig);

        // Stage 3 & 4: Validate & Normalize
        SettingsConfig validSettings = validator.validate(migratedSettings);
        RrgPreferences validPreferences = validator.validate(migratedPreferences);
        WatchlistConfig validWatchlist = validator.validate(migratedWatchlist);
        TimeframesConfig validTimeframes = validator.validate(migratedTimeframes); // Handle inheritance here
        CachePolicyConfig validCachePolicy = validator.validate(migratedCachePolicy);
        FeatureFlagsConfig validFeatureFlags = validator.validate(migratedFeatureFlags);
        ReplayConfig validReplayConfig = validator.validate(migratedReplayConfig);

        // Stage 5: Hash
        String settingsHash = hasher.hash(validSettings);
        String preferencesHash = hasher.hash(validPreferences);
        String watchlistHash = hasher.hash(validWatchlist);
        String timeframesHash = hasher.hash(validTimeframes);
        String cachePolicyHash = hasher.hash(validCachePolicy);
        String featureFlagsHash = hasher.hash(validFeatureFlags);
        String replayHash = hasher.hash(validReplayConfig);

        String globalHash = hasher.hash(Map.of(
                "settings", settingsHash,
                "preferences", preferencesHash,
                "watchlist", watchlistHash,
                "timeframes", timeframesHash,
                "cachePolicy", cachePolicyHash,
                "featureFlags", featureFlagsHash,
                "replay", replayHash
        ));

        // Stage 6: Finalize (Immutable Snapshot)
        return new RrgRuntimeConfigurationSnapshot(
                validSettings,
                validPreferences,
                validWatchlist,
                validTimeframes,
                validCachePolicy,
                validFeatureFlags,
                validReplayConfig,
                1, // configVersion
                globalHash,
                generationId,
                System.currentTimeMillis(),
                settingsHash,
                preferencesHash,
                watchlistHash,
                timeframesHash,
                cachePolicyHash,
                featureFlagsHash,
                replayHash
        );
    }
}
