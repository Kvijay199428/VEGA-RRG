package com.vega.rrg.model;

public record RrgTimeframeConfig(
    int smaPeriod,
    int minPeriods,
    long alignmentToleranceMs,
    int defaultTrailLength,
    boolean intraday,
    int emaSmoothing
) {}
