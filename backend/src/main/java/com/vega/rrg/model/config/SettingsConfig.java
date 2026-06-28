package com.vega.rrg.model.config;

import java.util.Map;

public record SettingsConfig(
    int version,
    long updatedAt,
    OptimizationSettings optimization,
    RenderingSettings rendering,
    CameraSettings camera,
    InteractionSettings interaction,
    WindowingSettings windowing,
    TrailReplayConfig trailReplay
) {
    public SettingsConfig {
        optimization = optimization != null ? optimization : new OptimizationSettings();
        rendering    = rendering    != null ? rendering    : new RenderingSettings();
        camera       = camera       != null ? camera       : new CameraSettings();
        interaction  = interaction  != null ? interaction  : new InteractionSettings();
        windowing    = windowing    != null ? windowing    : new WindowingSettings();
        trailReplay  = trailReplay  != null ? trailReplay  : new TrailReplayConfig();
    }

    public SettingsConfig() {
        this(1, 0,
            new OptimizationSettings(),
            new RenderingSettings(),
            new CameraSettings(),
            new InteractionSettings(),
            new WindowingSettings(),
            new TrailReplayConfig());
    }

    // -------------------------------------------------------------------------
    // Existing nested records (unchanged)
    // -------------------------------------------------------------------------

    public record OptimizationSettings(
        boolean minimalWindowResampling,
        boolean watchlistOnlyResampling,
        boolean backgroundSnapshotRefresh,
        boolean snapshotCacheEnabled,
        boolean snapshotCacheTtlEnabled
    ) {
        public OptimizationSettings() { this(false, false, true, true, true); }
    }

    public record RenderingSettings(
        boolean trailsEnabled,
        boolean trailArrowsEnabled,
        boolean trailGlowEnabled,
        boolean labelsEnabled,
        boolean adaptiveLabels,
        boolean semanticZoom
    ) {
        public RenderingSettings() { this(true, true, true, true, true, true); }
    }

    public record CameraSettings(
        boolean autoFitEnabled,
        double fitPadding,
        boolean smoothInterpolation,
        double maxZoom,
        double minInteractionZoom
    ) {
        public CameraSettings() { this(true, 0.5, true, 20.0, 1.0); }
    }

    public record InteractionSettings(
        boolean hoverHighlight,
        boolean selectionHighlight,
        boolean tooltipEnabled
    ) {
        public InteractionSettings() { this(true, true, true); }
    }

    public record WindowingSettings(
        int minimumSafeWindow,
        double warmupMultiplier,
        double stabilizationMultiplier
    ) {
        public WindowingSettings() { this(1200, 1.5, 1.2); }
    }

    // -------------------------------------------------------------------------
    // Trail Replay — NEW
    // -------------------------------------------------------------------------

    /**
     * Root configuration for the Trail Replay slider feature.
     * Persisted in rrg_settings.json under "trailReplay".
     */
    public record TrailReplayConfig(
        boolean enabled,
        Map<String, TimeframeReplayConfig> timeframeDateRanges,
        ReplayDefaults replayDefaults
    ) {
        public TrailReplayConfig() {
            this(true, defaultRanges(), new ReplayDefaults());
        }

        private static Map<String, TimeframeReplayConfig> defaultRanges() {
            return Map.of(
                "MINUTE", new TimeframeReplayConfig("WEEK",  1,  30, 120, true),
                "HOUR",   new TimeframeReplayConfig("WEEK",  3,  20, 120, true),
                "DAY",    new TimeframeReplayConfig("MONTH", 3,  15, 120, true),
                "WEEK",   new TimeframeReplayConfig("MONTH", 9,  12, 120, false),
                "MONTH",  new TimeframeReplayConfig("YEAR",  10, 10, 120, false)
            );
        }
    }

    /**
     * Per-timeframe replay configuration.
     *
     * @param rangeType             WEEK | MONTH | YEAR
     * @param rangeValue            Number of rangeType units to look back from today
     * @param defaultTrailLength    Trail length applied once on entering replay mode
     * @param maxTrailLength        Hard upper bound for the slider
     * @param autoApplyDefaultTrail If true, apply defaultTrailLength once when replay is enabled
     */
    public record TimeframeReplayConfig(
        String rangeType,
        int rangeValue,
        int defaultTrailLength,
        int maxTrailLength,
        boolean autoApplyDefaultTrail
    ) {}

    /**
     * Persistence preferences for replay session state.
     * When true, the corresponding value is stored in localStorage and restored on load.
     */
    public record ReplayDefaults(
        boolean restoreLastReplayDate,
        boolean rememberLastTrailLength,
        boolean rememberPlaybackSpeed
    ) {
        public ReplayDefaults() { this(true, true, true); }
    }
}
