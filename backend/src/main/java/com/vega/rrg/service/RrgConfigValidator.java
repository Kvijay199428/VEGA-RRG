package com.vega.rrg.service;

import com.vega.rrg.model.config.CommandBarConfig;
import com.vega.rrg.model.config.SettingsConfig;
import com.vega.rrg.model.config.WatchlistConfig;
import com.vega.rrg.model.config.TimeframesConfig;
import com.vega.rrg.model.config.CachePolicyConfig;
import com.vega.rrg.model.config.FeatureFlagsConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

        return new SettingsConfig(
                config.version(),
                config.updatedAt(),
                config.optimization(),
                config.rendering(),
                newCamera,
                config.interaction(),
                config.windowing()
        );
    }

    public CommandBarConfig validate(CommandBarConfig config) {
        if (config == null) return new CommandBarConfig();

        CommandBarConfig.Timeframes newTf = config.timeframes();
        if (newTf != null) {
            var unique = new LinkedHashSet<>(newTf.bookmarked());
            newTf = new CommandBarConfig.Timeframes(newTf.active(), new java.util.ArrayList<>(unique));
        }

        CommandBarConfig.TrailLengths newTl = config.trailLengths();
        if (newTl != null) {
            var unique = new LinkedHashSet<>(newTl.bookmarked());
            unique.removeIf(val -> val < 0);
            int active = newTl.active() < 0 ? 10 : newTl.active();
            newTl = new CommandBarConfig.TrailLengths(active, new java.util.ArrayList<>(unique));
        }

        return new CommandBarConfig(
                config.version(),
                config.updatedAt(),
                newTf,
                newTl,
                config.toggles()
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
}
