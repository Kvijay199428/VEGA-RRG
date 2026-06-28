package com.vega.rrg.model.config;

import java.util.List;

public record ReplayConfig(
    int configVersion,
    long updatedAt,
    RangeConfig ranges,
    TimeframeConfig timeframes,
    TrailLengthConfig trailLengths,
    PlaybackConfig playback,
    TimelineConfig timeline,
    DatasetConfig dataset
) {
    public ReplayConfig {
        configVersion = configVersion > 0 ? configVersion : 1;
        if (ranges == null) ranges = new RangeConfig("1W", List.of("1W", "1M", "3M", "6M", "1Y", "MAX", "CUSTOM"));
        if (timeframes == null) timeframes = new TimeframeConfig("5min", List.of("1min", "5min", "15min", "45min", "1h", "1d", "1w", "1mo"));
        if (trailLengths == null) trailLengths = new TrailLengthConfig(5, List.of(5, 10, 15, 20, 30));
        if (playback == null) playback = new PlaybackConfig(1.0, false, List.of("STOPPED", "PLAYING", "PAUSED", "FINISHED"), List.of(0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0));
        if (timeline == null) timeline = new TimelineConfig(true, true, true, true, true);
        if (dataset == null) dataset = new DatasetConfig(true, 0, 300, true);
    }

    public ReplayConfig() {
        this(1, 0, null, null, null, null, null, null);
    }

    public record RangeConfig(String active, List<String> bookmarked) {}
    public record TimeframeConfig(String active, List<String> bookmarked) {}
    public record TrailLengthConfig(int active, List<Integer> bookmarked) {}
    public record PlaybackConfig(double defaultSpeed, boolean defaultLoop, List<String> availableStates, List<Double> availableSpeeds) {}
    public record TimelineConfig(boolean showCursor, boolean showTrail, boolean snapToFrame, boolean autoScroll, boolean allowFrameScrubbing) {}
    public record DatasetConfig(boolean autoWarmup, int warmupExtraCandles, int preloadFrames, boolean cacheEnabled) {}
}
