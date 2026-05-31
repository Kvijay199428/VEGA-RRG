package com.vega.rrg.controller;

import com.vega.rrg.model.RrgPoint;
import com.vega.rrg.service.RrgService;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.constraints.Min;
import java.io.File;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.service.TimeframeParser;
import com.vega.rrg.service.InflightComputationRegistry;

@Slf4j
@RestController
@RequestMapping("/api/rrg")
@CrossOrigin(origins = "*")
@Validated
public class RrgController {

    @Autowired
    private RrgService rrgService;

    @Autowired
    private TimeframeParser timeframeParser;

    @Autowired
    private InflightComputationRegistry inflightRegistry;

    @GetMapping("/snapshot")
    public CompletableFuture<List<RrgPoint>> getSnapshot(
            @RequestParam(defaultValue = "NSE_INDEX_Nifty 50") String benchmark,
            @RequestParam(defaultValue = "1d") String timeframe,
            @RequestParam(defaultValue = "10") @Min(value = 0, message = "trailLength must be >= 0") int trailLength,
            @RequestParam(defaultValue = "true") boolean normalized,
            @RequestParam(defaultValue = "false") boolean minimalWindowResampling,
            @RequestParam(required = false) List<String> sectors,
            @RequestParam(required = false) String date,
            @RequestParam(defaultValue = "false") boolean watchlistOnlyResampling,
            @RequestParam(required = false) List<String> watchlist,
            @RequestParam(required = false) String selectedSector,
            @RequestParam(required = false) String hoveredSector,
            @RequestParam(required = false) String watchlistHash) {

        boolean isReplay = (date != null && !date.isEmpty());
        final boolean finalMinimalWindowResampling = isReplay ? false : minimalWindowResampling;
        final boolean finalWatchlistOnlyResampling = isReplay ? false : watchlistOnlyResampling;

        String requestHash = String.format("%s|%s|%d|%b|%b|%s|%s|%b|%s|%s|%s",
                benchmark, timeframe, trailLength, normalized, finalMinimalWindowResampling,
                sectors != null ? sectors.hashCode() : 0,
                date, finalWatchlistOnlyResampling, watchlistHash,
                selectedSector, hoveredSector);

        return inflightRegistry.computeOrAwait(requestHash, () -> {
            ParsedTimeframe parsedTf;
            try {
                parsedTf = timeframeParser.parse(timeframe);
            } catch (Exception e) {
                log.warn("Failed to parse timeframe: {}. Defaulting to 1d.", timeframe);
                parsedTf = timeframeParser.parse("1d");
            }

            String normalizedTimeframe = parsedTf.getCanonical();

            List<String> targetSectors;
            if (sectors == null || sectors.isEmpty()) {
                File storageDir = new File("../storage/candles/sector");
                String[] sectorDirs = storageDir.list((dir, name) -> new File(dir, name).isDirectory());
                targetSectors = sectorDirs != null ? Arrays.asList(sectorDirs) : new ArrayList<>();
            } else {
                targetSectors = sectors;
            }

            targetSectors = targetSectors.stream()
                    .filter(s -> !s.equalsIgnoreCase("sector"))
                    .collect(Collectors.toList());

            if (targetSectors.isEmpty()) {
                throw new DataNotFoundException("No sectors found to process", "ALL", normalizedTimeframe);
            }

            List<RrgPoint> results = rrgService.calculateRrg(targetSectors, benchmark, parsedTf, trailLength, normalized, finalMinimalWindowResampling,
                    watchlist, selectedSector, hoveredSector, finalWatchlistOnlyResampling, isReplay);
            
            if (isReplay) {
                try {
                    long requestedEpochMillis = parseReplayTime(date);
                    results = results.stream().map(pt -> {
                        List<RrgPoint.TrailPoint> filteredTrail = pt.getTrail().stream()
                                .filter(t -> t.getEpochMillis() <= requestedEpochMillis)
                                .collect(Collectors.toList());
                        
                        if (filteredTrail.isEmpty()) return null;
                        
                        RrgPoint.TrailPoint last = filteredTrail.get(filteredTrail.size() - 1);
                        return RrgPoint.builder()
                                .symbol(pt.getSymbol())
                                .x(last.getX())
                                .y(last.getY())
                                .quadrant(getQuadrant(last.getX(), last.getY(), normalized ? 100.0 : 1.0))
                                .trail(filteredTrail)
                                .stale(pt.isStale())
                                .computedAt(pt.getComputedAt())
                                .build();
                    }).filter(Objects::nonNull).collect(Collectors.toList());
                } catch (Exception e) {
                    log.warn("Failed to parse replay date: {}", date);
                }
            }

            if (results.isEmpty()) {
                throw new DataNotFoundException("RRG calculation yielded empty results", benchmark, normalizedTimeframe);
            }

            return results;
        });
    }
    
    private String getQuadrant(double x, double y, double axisCenter) {
        if (x >= axisCenter && y >= axisCenter) return "LEADING";
        if (x >= axisCenter && y < axisCenter) return "WEAKENING";
        if (x < axisCenter && y < axisCenter) return "LAGGING";
        return "IMPROVING";
    }

    @GetMapping("/sectors")
    public List<String> getSectors() {
        File storageDir = new File("../storage/candles/sector");
        String[] sectorDirs = storageDir.list((dir, name) -> new File(dir, name).isDirectory());
        return sectorDirs != null ? Arrays.asList(sectorDirs) : Arrays.asList();
    }

    @ExceptionHandler(DataNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleDataNotFound(DataNotFoundException ex) {
        log.error("DataNotFoundException: {}", ex.getMessage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.NOT_FOUND.value());
        body.put("error", ex.getMessage());
        body.put("sector", ex.getSector());
        body.put("timeframe", ex.getTimeframe());
        return new ResponseEntity<>(body, HttpStatus.NOT_FOUND);
    }
    
    @Getter
    public static class DataNotFoundException extends RuntimeException {
        private final String sector;
        private final String timeframe;
        
        public DataNotFoundException(String message, String sector, String timeframe) {
            super(message);
            this.sector = sector;
            this.timeframe = timeframe;
        }
    }

    private long parseReplayTime(String value) {
        try {
            return LocalDateTime.parse(value)
                .atZone(ZoneId.of("Asia/Kolkata"))
                .toInstant()
                .toEpochMilli();
        } catch (Exception ignored) {
            return LocalDate.parse(value)
                .atStartOfDay(ZoneId.of("Asia/Kolkata"))
                .toInstant()
                .toEpochMilli();
        }
    }
}
