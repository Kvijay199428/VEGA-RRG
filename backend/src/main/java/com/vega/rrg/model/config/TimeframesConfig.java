package com.vega.rrg.model.config;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record TimeframesConfig(
    int version,
    long updatedAt,
    Map<String, TimeframeProfileConfig> profiles
) {
    public TimeframesConfig {
        profiles = profiles != null ? Map.copyOf(profiles) : Map.of();
    }

    public TimeframesConfig() {
        this(1, 0, null);
    }

    public record TimeframeProfileConfig(
        @JsonProperty("extends") String extendProfile,
        Integer smaPeriod,
        Integer minPeriods,
        Long alignmentToleranceMs,
        Integer defaultTrailLength,
        Boolean isIntraday,
        Integer emaSmoothing
    ) {}
}
