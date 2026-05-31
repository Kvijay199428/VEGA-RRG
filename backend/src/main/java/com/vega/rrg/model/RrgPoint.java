package com.vega.rrg.model;

import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class RrgPoint {
    private String symbol;
    private double x; // RS-Ratio
    private double y; // RS-Momentum
    private String quadrant;
    private List<TrailPoint> trail;
    private boolean stale;
    private long computedAt;

    public RrgPoint deepClone() {
        List<TrailPoint> clonedTrail = null;
        if (this.trail != null) {
            clonedTrail = this.trail.stream()
                .map(t -> TrailPoint.builder()
                    .epochMillis(t.epochMillis)
                    .x(t.x)
                    .y(t.y)
                    .build())
                .collect(java.util.stream.Collectors.toList());
        }
        
        return RrgPoint.builder()
            .symbol(this.symbol)
            .x(this.x)
            .y(this.y)
            .quadrant(this.quadrant)
            .trail(clonedTrail)
            .stale(this.stale)
            .computedAt(this.computedAt)
            .build();
    }

    @Data
    @Builder
    public static class TrailPoint {
        private long epochMillis;
        private double x;
        private double y;
    }
}
