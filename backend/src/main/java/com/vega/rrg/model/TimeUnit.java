package com.vega.rrg.model;

public enum TimeUnit {
    MINUTE("m"),
    HOUR("h"),
    DAY("d"),
    WEEK("w"),
    MONTH("mo"),
    YEAR("y");

    private final String value;

    TimeUnit(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static TimeUnit fromString(String text) {
        for (TimeUnit b : TimeUnit.values()) {
            if (b.value.equalsIgnoreCase(text)) {
                return b;
            }
        }
        return null;
    }
}
