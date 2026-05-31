package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.TimeUnit;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TimeframeParser {

    private static final Pattern PATTERN = Pattern.compile("^(\\d+)([a-zA-Z]+)$");

    private static final Map<String, TimeUnit> UNIT_ALIASES = Map.of(
            "min", TimeUnit.MINUTE,
            "m", TimeUnit.MINUTE,
            "h", TimeUnit.HOUR,
            "d", TimeUnit.DAY,
            "w", TimeUnit.WEEK,
            "mo", TimeUnit.MONTH,
            "y", TimeUnit.YEAR
    );

    private static final Map<TimeUnit, Integer> MAX_LIMITS = Map.of(
            TimeUnit.MINUTE, 1440,
            TimeUnit.HOUR, 168,
            TimeUnit.DAY, 365,
            TimeUnit.WEEK, 260,
            TimeUnit.MONTH, 120,
            TimeUnit.YEAR, 20
    );

    private static final Map<TimeUnit, Integer> SORT_WEIGHTS = Map.of(
            TimeUnit.MINUTE, 1,
            TimeUnit.HOUR, 60,
            TimeUnit.DAY, 1440,
            TimeUnit.WEEK, 10080,
            TimeUnit.MONTH, 50000,
            TimeUnit.YEAR, 600000
    );

    private static final Map<TimeUnit, String> UNIT_DISPLAY = Map.of(
            TimeUnit.MINUTE, "Min",
            TimeUnit.HOUR, "Hour",
            TimeUnit.DAY, "Day",
            TimeUnit.WEEK, "Week",
            TimeUnit.MONTH, "Month",
            TimeUnit.YEAR, "Year"
    );

    public ParsedTimeframe parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Timeframe cannot be empty");
        }

        Matcher matcher = PATTERN.matcher(raw.toLowerCase().trim());
        if (!matcher.matches()) {
            throw new IllegalArgumentException("Invalid timeframe format: " + raw);
        }

        String numStr = matcher.group(1);
        String unitStr = matcher.group(2);

        int multiplier = Integer.parseInt(numStr);
        if (multiplier <= 0) {
            throw new IllegalArgumentException("Timeframe multiplier must be > 0: " + raw);
        }

        TimeUnit unit = UNIT_ALIASES.get(unitStr);
        if (unit == null) {
            throw new IllegalArgumentException("Unknown timeframe unit: " + unitStr);
        }

        if (multiplier > MAX_LIMITS.get(unit)) {
            throw new IllegalArgumentException(String.format("Timeframe %d%s exceeds max limit of %d%s",
                    multiplier, unit.getValue(), MAX_LIMITS.get(unit), unit.getValue()));
        }

        String canonical = multiplier + unit.getValue();
        String displayLabel = multiplier + " " + UNIT_DISPLAY.get(unit);
        boolean intraday = (unit == TimeUnit.MINUTE || unit == TimeUnit.HOUR);
        boolean isCalendarAnchored = !intraday;

        int baseResolutionMinutes = intraday ? 1 : 1440;
        int baseCandleMultiplier = multiplier;
        if (unit == TimeUnit.HOUR) baseCandleMultiplier = multiplier * 60;
        else if (unit == TimeUnit.WEEK) baseCandleMultiplier = multiplier * 7;
        else if (unit == TimeUnit.MONTH) baseCandleMultiplier = multiplier * 30; // approx
        else if (unit == TimeUnit.YEAR) baseCandleMultiplier = multiplier * 365; // approx

        if (baseCandleMultiplier > 10000) {
            throw new IllegalArgumentException("Timeframe " + canonical + " base candle multiplier exceeds hard limit of 10000");
        }

        String timeframeScaleClass;
        if (unit == TimeUnit.MINUTE && multiplier < 15) timeframeScaleClass = "ultra_intraday";
        else if (intraday) timeframeScaleClass = "intraday";
        else if (unit == TimeUnit.DAY && multiplier < 5) timeframeScaleClass = "swing";
        else if (unit == TimeUnit.DAY || unit == TimeUnit.WEEK) timeframeScaleClass = "position";
        else timeframeScaleClass = "macro";

        long sortWeight = (long) SORT_WEIGHTS.get(unit) * multiplier;

        return ParsedTimeframe.builder()
                .raw(raw)
                .multiplier(multiplier)
                .unit(unit)
                .canonical(canonical)
                .displayLabel(displayLabel)
                .baseResolutionMinutes(baseResolutionMinutes)
                .baseCandleMultiplier(baseCandleMultiplier)
                .intraday(intraday)
                .isCalendarAnchored(isCalendarAnchored)
                .timeframeScaleClass(timeframeScaleClass)
                .sortWeight(sortWeight)
                .build();
    }
}
