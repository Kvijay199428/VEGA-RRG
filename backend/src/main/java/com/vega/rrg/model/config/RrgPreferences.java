package com.vega.rrg.model.config;

import java.util.List;
import java.time.Instant;

public record RrgPreferences(
    int version,
    long updatedAt,
    String activeTimeframe,
    int activeTrailLength,
    List<TimeframePreference> timeframes,
    List<TrailPreference> trails,
    Toggles toggles,
    ReplayPreferences replay
) {
    public RrgPreferences {
        activeTimeframe = activeTimeframe != null ? activeTimeframe : "15min";
        activeTrailLength = activeTrailLength > 0 ? activeTrailLength : 10;
        
        if (timeframes == null) {
            timeframes = List.of(
                new TimeframePreference("1min", "1 MIN", 1, true, true, true, null),
                new TimeframePreference("5min", "5 MIN", 5, true, true, true, null),
                new TimeframePreference("15min", "15 MIN", 15, true, true, true, null),
                new TimeframePreference("45min", "45 MIN", 45, true, true, true, null),
                new TimeframePreference("1h", "1 HOUR", 60, true, true, true, null),
                new TimeframePreference("1d", "1 DAY", 1440, true, true, true, null),
                new TimeframePreference("1w", "1 WEEK", 10080, true, true, true, null),
                new TimeframePreference("1mo", "1 MONTH", 43200, true, true, true, null)
            );
        } else {
            timeframes = List.copyOf(timeframes);
        }

        if (trails == null) {
            trails = List.of(
                new TrailPreference(5, true, true, null, null),
                new TrailPreference(10, true, true, null, null),
                new TrailPreference(15, true, true, null, null),
                new TrailPreference(20, true, true, null, null),
                new TrailPreference(30, true, true, null, null)
            );
        } else {
            trails = List.copyOf(trails);
        }

        toggles = toggles != null ? toggles : new Toggles();
        replay = replay != null ? replay : new ReplayPreferences();
    }

    public RrgPreferences() {
        this(1, 0, "15min", 10, null, null, new Toggles(), new ReplayPreferences());
    }

    public record TimeframePreference(
        String id,
        String label,
        int minutes,
        boolean bookmarked,
        boolean supported,
        boolean system,
        String createdAt
    ) {}

    public record TrailPreference(
        int value,
        boolean bookmarked,
        boolean system,
        String recommendedReplayRange,
        String createdAt
    ) {}

    public record Toggles(
        boolean normalized,
        boolean trailsEnabled,
        boolean intradayEnabled,
        boolean liveStreamingEnabled,
        boolean replayModeEnabled
    ) {
        public Toggles() { this(true, true, false, false, false); }
    }

    public record ReplayPreferences(
        String selectedRangePreset,
        String selectedTimeframe,
        int selectedTrailLength,
        double playbackSpeed,
        boolean loopPlayback,
        Long lastCursorTimestamp,
        Long lastStartTimestamp,
        Long lastEndTimestamp,
        String lastBenchmark
    ) {
        public ReplayPreferences() {
            this(null, null, 0, 1.0, false, null, null, null, null);
        }
    }
}
