package com.vega.rrg.model.config;

import java.util.List;

public record CommandBarConfig(
    int version,
    long updatedAt,
    Timeframes timeframes,
    TrailLengths trailLengths,
    Toggles toggles
) {
    public CommandBarConfig {
        timeframes = timeframes != null ? timeframes : new Timeframes();
        trailLengths = trailLengths != null ? trailLengths : new TrailLengths();
        toggles = toggles != null ? toggles : new Toggles();
    }

    public CommandBarConfig() {
        this(1, 0, new Timeframes(), new TrailLengths(), new Toggles());
    }

    public record Timeframes(
        String active,
        List<String> bookmarked
    ) {
        public Timeframes {
            active = active != null ? active : "15min";
            bookmarked = bookmarked != null ? List.copyOf(bookmarked) : List.of("1min", "5min", "15min", "45min", "1h", "1d", "1w", "1mo");
        }
        public Timeframes() { this("15min", null); }
    }

    public record TrailLengths(
        int active,
        List<Integer> bookmarked
    ) {
        public TrailLengths {
            bookmarked = bookmarked != null ? List.copyOf(bookmarked) : List.of(5, 10, 15, 20, 30);
        }
        public TrailLengths() { this(10, null); }
    }

    public record Toggles(
        boolean normalized,
        boolean trailsEnabled
    ) {
        public Toggles() { this(true, true); }
    }
}
