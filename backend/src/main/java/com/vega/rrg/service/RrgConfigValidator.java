package com.vega.rrg.service;

import com.vega.rrg.model.config.RrgPreferences;
import com.vega.rrg.model.config.SettingsConfig;
import com.vega.rrg.model.config.WatchlistConfig;
import com.vega.rrg.model.config.TimeframesConfig;
import com.vega.rrg.model.config.CachePolicyConfig;
import com.vega.rrg.model.config.FeatureFlagsConfig;
import com.vega.rrg.model.config.ReplayConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.LinkedHashSet;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RrgConfigValidator {

    public WatchlistConfig validate(WatchlistConfig config) {
        if (config == null) return new WatchlistConfig();

        var validatedProfiles = new java.util.ArrayList<WatchlistConfig.WatchlistProfile>();
        for (WatchlistConfig.WatchlistProfile profile : config.watchlists()) {
            var uniqueSymbols = new java.util.HashSet<String>();
            var validatedSectors = new java.util.ArrayList<WatchlistConfig.SectorEntry>();

            for (var sector : profile.sectors()) {
                if (sector.symbol() != null && !sector.symbol().isBlank()) {
                    if (uniqueSymbols.add(sector.symbol())) {
                        validatedSectors.add(sector);
                    }
                }
            }
            validatedProfiles.add(new WatchlistConfig.WatchlistProfile(
                    profile.id(), profile.name(), profile.active(), validatedSectors
            ));
        }

        return new WatchlistConfig(config.version(), config.updatedAt(), config.watchlistOnlyResampling(), validatedProfiles);
    }

    public SettingsConfig validate(SettingsConfig config) {
        if (config == null) return new SettingsConfig();

        SettingsConfig.CameraSettings newCamera = config.camera();
        if (newCamera != null) {
            double minZoom = newCamera.minInteractionZoom();
            double maxZoom = newCamera.maxZoom();
            boolean changed = false;

            if (minZoom <= 0) {
                minZoom = 0.1;
                changed = true;
            }
            if (maxZoom < minZoom) {
                maxZoom = minZoom + 5.0;
                changed = true;
            }
            
            if (changed) {
                newCamera = new SettingsConfig.CameraSettings(
                        newCamera.autoFitEnabled(),
                        newCamera.fitPadding(),
                        newCamera.smoothInterpolation(),
                        maxZoom,
                        minZoom
                );
            }
        }

        // Validate trailReplay — clamp defaultTrailLength to [1, maxTrailLength]
        SettingsConfig.TrailReplayConfig newReplay = config.trailReplay();
        if (newReplay != null && newReplay.timeframeDateRanges() != null) {
            var validatedRanges = new java.util.LinkedHashMap<String, SettingsConfig.TimeframeReplayConfig>();
            for (Map.Entry<String, SettingsConfig.TimeframeReplayConfig> entry : newReplay.timeframeDateRanges().entrySet()) {
                SettingsConfig.TimeframeReplayConfig tf = entry.getValue();
                if (tf == null) continue;
                int maxTrail = Math.max(1, tf.maxTrailLength());
                int defTrail = Math.min(Math.max(1, tf.defaultTrailLength()), maxTrail);
                int rangeVal = Math.max(1, tf.rangeValue());
                validatedRanges.put(entry.getKey(),
                    new SettingsConfig.TimeframeReplayConfig(
                        tf.rangeType(),
                        rangeVal,
                        defTrail,
                        maxTrail,
                        tf.autoApplyDefaultTrail()));
            }
            newReplay = new SettingsConfig.TrailReplayConfig(
                newReplay.enabled(),
                validatedRanges,
                newReplay.replayDefaults() != null ? newReplay.replayDefaults() : new SettingsConfig.ReplayDefaults());
        }

        return new SettingsConfig(
                config.version(),
                config.updatedAt(),
                config.optimization(),
                config.rendering(),
                newCamera,
                config.interaction(),
                config.windowing(),
                newReplay);
    }

    public RrgPreferences validate(RrgPreferences config) {
        if (config == null) return new RrgPreferences();

        List<RrgPreferences.TimeframePreference> newTf = config.timeframes();
        if (newTf != null) {
            var uniqueItems = new java.util.LinkedHashMap<String, RrgPreferences.TimeframePreference>();
            for (var item : newTf) {
                if (item.minutes() >= 1 && item.minutes() <= 43200) {
                    uniqueItems.putIfAbsent(item.id(), new RrgPreferences.TimeframePreference(
                        item.id(), item.label(), item.minutes(), item.bookmarked(),
                        true, item.system(), item.createdAt()
                    ));
                }
            }
            newTf = new java.util.ArrayList<>(uniqueItems.values());
        }

        List<RrgPreferences.TrailPreference> newTl = config.trails();
        if (newTl != null) {
            var uniqueItems = new java.util.LinkedHashMap<Integer, RrgPreferences.TrailPreference>();
            for (var item : newTl) {
                if (item.value() > 0) {
                    uniqueItems.putIfAbsent(item.value(), item);
                }
            }
            newTl = new java.util.ArrayList<>(uniqueItems.values());
        }

        int activeTrailLength = config.activeTrailLength() < 0 ? 10 : config.activeTrailLength();

        return new RrgPreferences(
                config.version(),
                config.updatedAt(),
                config.activeTimeframe(),
                activeTrailLength,
                newTf,
                newTl,
                config.toggles(),
                config.replay()
        );
    }

    public TimeframesConfig validate(TimeframesConfig config) {
        if (config == null) return new TimeframesConfig();
        // Implement inheritance resolution here
        var validatedProfiles = new java.util.HashMap<String, TimeframesConfig.TimeframeProfileConfig>();
        for (var entry : config.profiles().entrySet()) {
            TimeframesConfig.TimeframeProfileConfig profile = entry.getValue();
            if (profile.extendProfile() != null && config.profiles().containsKey(profile.extendProfile())) {
                TimeframesConfig.TimeframeProfileConfig base = config.profiles().get(profile.extendProfile());
                profile = new TimeframesConfig.TimeframeProfileConfig(
                    null,
                    profile.smaPeriod() != null ? profile.smaPeriod() : base.smaPeriod(),
                    profile.minPeriods() != null ? profile.minPeriods() : base.minPeriods(),
                    profile.alignmentToleranceMs() != null ? profile.alignmentToleranceMs() : base.alignmentToleranceMs(),
                    profile.defaultTrailLength() != null ? profile.defaultTrailLength() : base.defaultTrailLength(),
                    profile.isIntraday() != null ? profile.isIntraday() : base.isIntraday(),
                    profile.emaSmoothing() != null ? profile.emaSmoothing() : base.emaSmoothing()
                );
            }
            validatedProfiles.put(entry.getKey(), profile);
        }
        return new TimeframesConfig(config.version(), config.updatedAt(), validatedProfiles);
    }

    public CachePolicyConfig validate(CachePolicyConfig config) {
        if (config == null) return new CachePolicyConfig();
        return config;
    }

    public FeatureFlagsConfig validate(FeatureFlagsConfig config) {
        if (config == null) return new FeatureFlagsConfig();
        return config;
    }

    public ReplayConfig validate(ReplayConfig config) {
        if (config == null) return new ReplayConfig();
        
        String activeRange = config.ranges().bookmarked().contains(config.ranges().active()) ? config.ranges().active() : config.ranges().bookmarked().get(0);
        ReplayConfig.RangeConfig ranges = new ReplayConfig.RangeConfig(activeRange, config.ranges().bookmarked());

        String activeTimeframe = config.timeframes().bookmarked().contains(config.timeframes().active()) ? config.timeframes().active() : config.timeframes().bookmarked().get(0);
        ReplayConfig.TimeframeConfig timeframes = new ReplayConfig.TimeframeConfig(activeTimeframe, config.timeframes().bookmarked());

        int activeTrailLength = config.trailLengths().bookmarked().contains(config.trailLengths().active()) ? config.trailLengths().active() : config.trailLengths().bookmarked().get(0);
        ReplayConfig.TrailLengthConfig trailLengths = new ReplayConfig.TrailLengthConfig(activeTrailLength, config.trailLengths().bookmarked());

        double defaultSpeed = config.playback().availableSpeeds().contains(config.playback().defaultSpeed()) ? config.playback().defaultSpeed() : 1.0;
        ReplayConfig.PlaybackConfig playback = new ReplayConfig.PlaybackConfig(defaultSpeed, config.playback().defaultLoop(), config.playback().availableStates(), config.playback().availableSpeeds());

        int preloadFrames = Math.max(0, config.dataset().preloadFrames());
        int warmupExtraCandles = Math.max(0, config.dataset().warmupExtraCandles());
        ReplayConfig.DatasetConfig dataset = new ReplayConfig.DatasetConfig(config.dataset().autoWarmup(), warmupExtraCandles, preloadFrames, config.dataset().cacheEnabled());

        return new ReplayConfig(
            config.configVersion(),
            config.updatedAt(),
            ranges,
            timeframes,
            trailLengths,
            playback,
            config.timeline(),
            dataset
        );
    }
}
