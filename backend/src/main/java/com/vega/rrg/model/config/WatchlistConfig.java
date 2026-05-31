package com.vega.rrg.model.config;

import java.util.List;

public record WatchlistConfig(
    int version,
    long updatedAt,
    boolean watchlistOnlyResampling,
    List<WatchlistProfile> watchlists
) {
    public WatchlistConfig {
        watchlists = watchlists != null ? List.copyOf(watchlists) : List.of();
    }

    public WatchlistConfig() {
        this(1, 0, false, null);
    }

    public record WatchlistProfile(
        String id,
        String name,
        boolean active,
        List<SectorEntry> sectors
    ) {
        public WatchlistProfile {
            sectors = sectors != null ? List.copyOf(sectors) : List.of();
        }
    }

    public record SectorEntry(
        String symbol,
        boolean pinned,
        int priority,
        boolean hidden
    ) {}
}
