package com.vega.rrg.model.config;

public record SettingsConfig(
    int version,
    long updatedAt,
    OptimizationSettings optimization,
    RenderingSettings rendering,
    CameraSettings camera,
    InteractionSettings interaction,
    WindowingSettings windowing
) {
    public SettingsConfig {
        optimization = optimization != null ? optimization : new OptimizationSettings();
        rendering = rendering != null ? rendering : new RenderingSettings();
        camera = camera != null ? camera : new CameraSettings();
        interaction = interaction != null ? interaction : new InteractionSettings();
        windowing = windowing != null ? windowing : new WindowingSettings();
    }

    public SettingsConfig() {
        this(1, 0, new OptimizationSettings(), new RenderingSettings(), new CameraSettings(), new InteractionSettings(), new WindowingSettings());
    }

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
}
