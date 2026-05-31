package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgTimeframeConfig;
import org.springframework.stereotype.Component;

@Component
public class RrgWindowCalculator {

    public int calculateRequiredRawCandles(ParsedTimeframe tf, int trailLength, RrgTimeframeConfig config) {
        int effectiveTrailLength = Math.max(trailLength, config.defaultTrailLength());
        
        int warmup = Math.max(config.smaPeriod() * 3, config.minPeriods());
        int stabilization = config.emaSmoothing() * 4;
        
        int requiredHigherTfCandles = warmup + stabilization + effectiveTrailLength + 10;
        
        // Use the baseCandleMultiplier directly (e.g. 1mo = 30 daily candles)
        // This implicitly executes date-range based math by grabbing roughly enough days
        int requiredRawCandles = requiredHigherTfCandles * tf.getBaseCandleMultiplier();
        
        int minimumSafeWindow = 1200; // Default minimum safe window
        if (tf.isIntraday()) {
            minimumSafeWindow = Math.max(1200, 120 * tf.getBaseCandleMultiplier());
        }
        
        return Math.max(requiredRawCandles, minimumSafeWindow);
    }
}
