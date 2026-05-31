package com.vega.rrg.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ParsedTimeframe {
    private String raw;
    private int multiplier;
    private TimeUnit unit;
    private String canonical;
    private String displayLabel;
    private int baseResolutionMinutes;
    private int baseCandleMultiplier;
    private boolean intraday;
    private boolean isCalendarAnchored;
    private String timeframeScaleClass;
    private long sortWeight;
}
