package com.vega.rrg.service;

import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.time.ZoneId;

@Service
public class TradingSessionProvider {

    private static final ZoneId ZONE_ID = ZoneId.of("Asia/Kolkata");
    
    // Default open time is 09:15 IST
    private static final LocalTime DEFAULT_OPEN = LocalTime.of(9, 15);
    
    // Default close time is 15:30 IST
    private static final LocalTime DEFAULT_CLOSE = LocalTime.of(15, 30);

    public LocalTime getOpenTime() {
        return DEFAULT_OPEN;
    }

    public LocalTime getCloseTime() {
        return DEFAULT_CLOSE;
    }

    public ZoneId getZoneId() {
        return ZONE_ID;
    }
}
