```xml
// File: pom.xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>
    <groupId>com.vega</groupId>
    <artifactId>rrg</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>rrg</name>
    <description>RRG Analytics Engine</description>
    <properties>
        <java.version>21</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>com.google.protobuf</groupId>
            <artifactId>protobuf-java</artifactId>
            <version>3.25.1</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-math3</artifactId>
            <version>3.6.1</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-cache</artifactId>
        </dependency>
        <dependency>
            <groupId>com.github.ben-manes.caffeine</groupId>
            <artifactId>caffeine</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.xolstice.maven.plugins</groupId>
                <artifactId>protobuf-maven-plugin</artifactId>
                <version>0.6.1</version>
                <configuration>
                    <protocArtifact>com.google.protobuf:protoc:3.25.1:exe:${os.detected.classifier}</protocArtifact>
                    <pluginId>grpc-java</pluginId>
                    <pluginArtifact>io.grpc:protoc-gen-grpc-java:1.60.0:exe:${os.detected.classifier}</pluginArtifact>
                </configuration>
                <executions>
                    <execution>
                        <goals>
                            <goal>compile</goal>
                            <goal>compile-custom</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
            <plugin>
                <groupId>kr.motd.maven</groupId>
                <artifactId>os-maven-plugin</artifactId>
                <version>1.7.1</version>
                <executions>
                    <execution>
                        <phase>initialize</phase>
                        <goals>
                            <goal>detect</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

```java
// File: src\main\java\com\vega\rrg\controller\RrgConfigController.java
package com.vega.rrg.controller;

import com.vega.rrg.model.config.CommandBarConfig;
import com.vega.rrg.model.config.SettingsConfig;
import com.vega.rrg.model.config.WatchlistConfig;
import com.vega.rrg.model.config.RrgRuntimeConfigurationSnapshot;
import com.vega.rrg.service.RrgConfigurationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.util.Map;

@Slf4j
@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/rrg/config")
public class RrgConfigController {

    @Autowired
    private RrgConfigurationService configService;

    @GetMapping("/bootstrap")
    public ResponseEntity<RrgRuntimeConfigurationSnapshot> getBootstrap(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (snapshot == null) return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();

        if (request.checkNotModified(snapshot.configHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }

        return ResponseEntity.ok()
                .eTag("\"" + snapshot.configHash() + "\"")
                .body(snapshot);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> getHealth() {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (snapshot == null) {
            return ResponseEntity.ok(Map.of(
                "valid", false,
                "degradedMode", true
            ));
        }
        
        return ResponseEntity.ok(Map.of(
            "valid", true,
            "degradedMode", false,
            "runtimeSnapshotId", snapshot.generationId(),
            "configHash", snapshot.configHash(),
            "loadedAt", snapshot.loadedAt(),
            "domains", Map.of(
                "settings", true,
                "watchlist", true,
                "timeframes", true,
                "cachePolicy", true,
                "commandBar", true
            )
        ));
    }

    @GetMapping("/settings")
    public ResponseEntity<SettingsConfig> getSettings(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (request.checkNotModified(snapshot.settingsHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.settingsHash() + "\"")
                .body(snapshot.settingsConfig());
    }

    @PatchMapping("/settings")
    public ResponseEntity<SettingsConfig> updateSettings(
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody SettingsConfig config) {
        
        String expectedHash = ifMatch != null ? ifMatch.replace("\"", "") : null;
        configService.updateSettingsConfig(config, expectedHash);
        
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.settingsHash() + "\"")
                .body(snapshot.settingsConfig());
    }

    @GetMapping("/commandbar")
    public ResponseEntity<CommandBarConfig> getCommandBar(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (request.checkNotModified(snapshot.commandBarHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.commandBarHash() + "\"")
                .body(snapshot.commandBarConfig());
    }

    @PatchMapping("/commandbar")
    public ResponseEntity<CommandBarConfig> updateCommandBar(
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody CommandBarConfig config) {
        
        String expectedHash = ifMatch != null ? ifMatch.replace("\"", "") : null;
        configService.updateCommandBarConfig(config, expectedHash);
        
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.commandBarHash() + "\"")
                .body(snapshot.commandBarConfig());
    }

    @GetMapping("/watchlist")
    public ResponseEntity<WatchlistConfig> getWatchlist(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (request.checkNotModified(snapshot.watchlistHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.watchlistHash() + "\"")
                .body(snapshot.watchlistConfig());
    }

    @PatchMapping("/watchlist")
    public ResponseEntity<WatchlistConfig> updateWatchlist(
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody WatchlistConfig config) {
        
        String expectedHash = ifMatch != null ? ifMatch.replace("\"", "") : null;
        configService.updateWatchlistConfig(config, expectedHash);
        
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.watchlistHash() + "\"")
                .body(snapshot.watchlistConfig());
    }
}
```

```java
// File: src\main\java\com\vega\rrg\controller\RrgController.java
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
```

```java
// File: src\main\java\com\vega\rrg\events\RrgConfigurationEvents.java
package com.vega.rrg.events;

import com.vega.rrg.model.config.RrgRuntimeConfigurationSnapshot;
import java.util.Set;

public class RrgConfigurationEvents {

    public record SnapshotChangedEvent(
            RrgRuntimeConfigurationSnapshot oldSnapshot,
            RrgRuntimeConfigurationSnapshot newSnapshot,
            Set<String> changedDomains,
            long generationId
    ) {}
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\CachePolicyConfig.java
package com.vega.rrg.model.config;

import java.util.Map;

public record CachePolicyConfig(
    int version,
    long updatedAt,
    Map<String, Long> ttl,
    Map<String, Boolean> backgroundRefresh
) {
    public CachePolicyConfig {
        ttl = ttl != null ? Map.copyOf(ttl) : Map.of();
        backgroundRefresh = backgroundRefresh != null ? Map.copyOf(backgroundRefresh) : Map.of();
    }

    public CachePolicyConfig() {
        this(1, 0, null, null);
    }
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\CommandBarConfig.java
package com.vega.rrg.model.config;

import java.util.List;

public record CommandBarConfig(
    int version,
    long updatedAt,
    Timeframes timeframes,
    TrailLengths trailLengths,
    Toggles toggles
) {
    public CommandBarConfig {
        timeframes = timeframes != null ? timeframes : new Timeframes();
        trailLengths = trailLengths != null ? trailLengths : new TrailLengths();
        toggles = toggles != null ? toggles : new Toggles();
    }

    public CommandBarConfig() {
        this(1, 0, new Timeframes(), new TrailLengths(), new Toggles());
    }

    public record Timeframes(
        String active,
        List<String> bookmarked
    ) {
        public Timeframes {
            active = active != null ? active : "15min";
            bookmarked = bookmarked != null ? List.copyOf(bookmarked) : List.of("1min", "5min", "15min", "45min", "1h", "1d", "1w", "1mo");
        }
        public Timeframes() { this("15min", null); }
    }

    public record TrailLengths(
        int active,
        List<Integer> bookmarked
    ) {
        public TrailLengths {
            bookmarked = bookmarked != null ? List.copyOf(bookmarked) : List.of(5, 10, 15, 20, 30);
        }
        public TrailLengths() { this(10, null); }
    }

    public record Toggles(
        boolean normalized,
        boolean trailsEnabled
    ) {
        public Toggles() { this(true, true); }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\DomainBuildResult.java
package com.vega.rrg.model.config;

public record DomainBuildResult<T>(
    String domainName,
    T config,
    String hash,
    DomainStatus status,
    String errorMessage
) {
    public enum DomainStatus {
        VALID, DEGRADED, FAILED
    }
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\FeatureFlagsConfig.java
package com.vega.rrg.model.config;

import java.util.Map;

public record FeatureFlagsConfig(
    int version,
    long updatedAt,
    Map<String, Boolean> features
) {
    public FeatureFlagsConfig {
        features = features != null ? Map.copyOf(features) : Map.of();
    }

    public FeatureFlagsConfig() {
        this(1, 0, null);
    }
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\RrgRuntimeConfigurationSnapshot.java
package com.vega.rrg.model.config;

public record RrgRuntimeConfigurationSnapshot(
    SettingsConfig settingsConfig,
    CommandBarConfig commandBarConfig,
    WatchlistConfig watchlistConfig,
    TimeframesConfig timeframesConfig,
    CachePolicyConfig cachePolicyConfig,
    FeatureFlagsConfig featureFlagsConfig,

    int configVersion,
    String configHash,
    long generationId,
    long loadedAt,
    
    String settingsHash,
    String commandBarHash,
    String watchlistHash,
    String timeframesHash,
    String cachePolicyHash,
    String featureFlagsHash
) {}
```

```java
// File: src\main\java\com\vega\rrg\model\config\SettingsConfig.java
package com.vega.rrg.model.config;

public record SettingsConfig(
    int version,
    long updatedAt,
    OptimizationSettings optimization,
    RenderingSettings rendering,
    CameraSettings camera,
    InteractionSettings interaction,
    WindowingSettings windowing
) {
    public SettingsConfig {
        optimization = optimization != null ? optimization : new OptimizationSettings();
        rendering = rendering != null ? rendering : new RenderingSettings();
        camera = camera != null ? camera : new CameraSettings();
        interaction = interaction != null ? interaction : new InteractionSettings();
        windowing = windowing != null ? windowing : new WindowingSettings();
    }

    public SettingsConfig() {
        this(1, 0, new OptimizationSettings(), new RenderingSettings(), new CameraSettings(), new InteractionSettings(), new WindowingSettings());
    }

    public record OptimizationSettings(
        boolean minimalWindowResampling,
        boolean watchlistOnlyResampling,
        boolean backgroundSnapshotRefresh,
        boolean snapshotCacheEnabled,
        boolean snapshotCacheTtlEnabled
    ) {
        public OptimizationSettings() { this(false, false, true, true, true); }
    }

    public record RenderingSettings(
        boolean trailsEnabled,
        boolean trailArrowsEnabled,
        boolean trailGlowEnabled,
        boolean labelsEnabled,
        boolean adaptiveLabels,
        boolean semanticZoom
    ) {
        public RenderingSettings() { this(true, true, true, true, true, true); }
    }

    public record CameraSettings(
        boolean autoFitEnabled,
        double fitPadding,
        boolean smoothInterpolation,
        double maxZoom,
        double minInteractionZoom
    ) {
        public CameraSettings() { this(true, 0.5, true, 20.0, 1.0); }
    }

    public record InteractionSettings(
        boolean hoverHighlight,
        boolean selectionHighlight,
        boolean tooltipEnabled
    ) {
        public InteractionSettings() { this(true, true, true); }
    }

    public record WindowingSettings(
        int minimumSafeWindow,
        double warmupMultiplier,
        double stabilizationMultiplier
    ) {
        public WindowingSettings() { this(1200, 1.5, 1.2); }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\model\config\TimeframesConfig.java
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
```

```java
// File: src\main\java\com\vega\rrg\model\config\WatchlistConfig.java
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
```

```java
// File: src\main\java\com\vega\rrg\model\ParsedTimeframe.java
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
```

```java
// File: src\main\java\com\vega\rrg\model\RrgPoint.java
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
```

```java
// File: src\main\java\com\vega\rrg\model\RrgTimeframeConfig.java
package com.vega.rrg.model;

public record RrgTimeframeConfig(
    int smaPeriod,
    int minPeriods,
    long alignmentToleranceMs,
    int defaultTrailLength,
    boolean intraday,
    int emaSmoothing
) {}
```

```java
// File: src\main\java\com\vega\rrg\model\TimeUnit.java
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
```

```java
// File: src\main\java\com\vega\rrg\RrgApplication.java
package com.vega.rrg;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableCaching
@EnableScheduling
public class RrgApplication {
    public static void main(String[] args) {
        SpringApplication.run(RrgApplication.class, args);
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\CacheInvalidationCoordinator.java
package com.vega.rrg.service;

import com.vega.rrg.events.RrgConfigurationEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CacheInvalidationCoordinator {

    // Inject planners and caches when implemented in Phase 2
    // private final RrgSnapshotCache cache;
    // private final SectorComputationPlanner planner;
    // private final InflightComputationRegistry registry;

    @Async
    @EventListener
    public void handleSnapshotChanged(RrgConfigurationEvents.SnapshotChangedEvent event) {
        log.info("Received SnapshotChangedEvent. Generation: {}. Changed Domains: {}", event.generationId(), event.changedDomains());
        
        // Coalesced invalidation logic will go here during Phase 2
        if (event.changedDomains().contains("timeframes")) {
            log.info("Timeframes changed. Invalidating aggregation cache, snapshot cache, inflight registry.");
            // cache.clearAll();
            // registry.clearAll();
        }

        if (event.changedDomains().contains("cachePolicy")) {
            log.info("Cache policy changed. Invalidating TTL planner and scheduler timing.");
        }

        if (event.changedDomains().contains("settings")) {
            // Check if windowing changed
            // Invalidating aggregation/snapshot caches.
            log.info("Settings changed. Invalidating aggregation/snapshot caches if windowing changed.");
        }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\CandleService.java
package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import org.springframework.stereotype.Service;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;

@Service
public class CandleService {

    private final Path storageRoot = Paths.get("..", "storage", "candles", "sector");
    private final TimeframeAggregationService aggregationService;

    private static final Map<String, String> BASE_FILES = Map.of(
        "daily", "day.pb",
        "intraday", "1m.pb"
    );

    public CandleService(TimeframeAggregationService aggregationService) {
        this.aggregationService = aggregationService;
    }

    public Optional<ProtoCandleFile> loadCandles(String sector, ParsedTimeframe parsedTf) {
        return aggregationService.getAggregated(sector, parsedTf, () -> loadBaseCandles(sector, parsedTf));
    }

    public Optional<ProtoCandleFile> loadRecentCandles(String sector, ParsedTimeframe parsedTf, int requiredRawCandles) {
        return aggregationService.getAggregatedWindow(sector, parsedTf, requiredRawCandles, () -> loadBaseCandlesWindowed(sector, parsedTf, requiredRawCandles));
    }

    private Optional<ProtoCandleFile> loadBaseCandlesWindowed(String sector, ParsedTimeframe parsedTf, int requiredRawCandles) {
        Optional<ProtoCandleFile> baseOpt = loadBaseCandles(sector, parsedTf);
        if (baseOpt.isEmpty()) return Optional.empty();
        
        ProtoCandleFile parsed = baseOpt.get();
        java.util.List<ProtoCandle> candles = parsed.getCandlesList();
        
        int start = Math.max(0, candles.size() - requiredRawCandles);
        java.util.List<ProtoCandle> window = new java.util.ArrayList<>(candles.subList(start, candles.size()));
        
        return Optional.of(ProtoCandleFile.newBuilder(parsed)
                .clearCandles()
                .addAllCandles(window)
                .build());
    }

    private Optional<ProtoCandleFile> loadBaseCandles(String sector, ParsedTimeframe parsedTf) {
        Path path = storageRoot.resolve(sector).resolve(getBaseFile(parsedTf));
        try (FileInputStream input = new FileInputStream(path.toFile())) {
            return Optional.of(ProtoCandleFile.parseFrom(input));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private String getBaseFile(ParsedTimeframe parsedTf) {
        return parsedTf.isIntraday() ? BASE_FILES.get("intraday") : BASE_FILES.get("daily");
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\ConfigHasher.java
package com.vega.rrg.service;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
public class ConfigHasher {
    private final ObjectMapper mapper;

    public ConfigHasher() {
        this.mapper = new ObjectMapper();
        this.mapper.configure(SerializationFeature.INDENT_OUTPUT, false);
        this.mapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
    }

    public String hash(Object config) {
        try {
            // Convert to a tree so we can manually strip volatile fields before hashing
            com.fasterxml.jackson.databind.JsonNode node = mapper.valueToTree(config);
            if (node.isObject()) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("updatedAt");
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("version");
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("loadedAt");
            }
            String canonicalJson = mapper.writeValueAsString(node);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(canonicalJson.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate structural hash", e);
        }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\ConfigReloadDebouncer.java
package com.vega.rrg.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class ConfigReloadDebouncer {

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> pendingTask = null;
    private final Object lock = new Object();

    public void scheduleReload(Runnable reloadTask) {
        synchronized (lock) {
            if (pendingTask != null && !pendingTask.isDone()) {
                pendingTask.cancel(false);
            }
            pendingTask = scheduler.schedule(reloadTask, 250, TimeUnit.MILLISECONDS);
        }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\InflightComputationRegistry.java
package com.vega.rrg.service;

import com.vega.rrg.model.RrgPoint;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

@Component
public class InflightComputationRegistry {

    private final ConcurrentHashMap<String, CompletableFuture<List<RrgPoint>>> registry = new ConcurrentHashMap<>();

    public CompletableFuture<List<RrgPoint>> computeOrAwait(String cacheKey, Supplier<List<RrgPoint>> computation) {
        return registry.computeIfAbsent(cacheKey, k -> 
            CompletableFuture.supplyAsync(computation).whenComplete((res, ex) -> registry.remove(k))
        );
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgConfigMigrationService.java
package com.vega.rrg.service;

import com.vega.rrg.model.config.*;
import org.springframework.stereotype.Service;

@Service
public class RrgConfigMigrationService {

    public SettingsConfig migrate(SettingsConfig config) {
        if (config == null) return new SettingsConfig();
        return config;
    }

    public CommandBarConfig migrate(CommandBarConfig config) {
        if (config == null) return new CommandBarConfig();
        return config;
    }

    public WatchlistConfig migrate(WatchlistConfig config) {
        if (config == null) return new WatchlistConfig();
        return config;
    }

    public TimeframesConfig migrate(TimeframesConfig config) {
        if (config == null) return new TimeframesConfig();
        return config;
    }

    public CachePolicyConfig migrate(CachePolicyConfig config) {
        if (config == null) return new CachePolicyConfig();
        return config;
    }

    public FeatureFlagsConfig migrate(FeatureFlagsConfig config) {
        if (config == null) return new FeatureFlagsConfig();
        return config;
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgConfigurationService.java
package com.vega.rrg.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vega.rrg.model.config.*;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.ApplicationEventPublisher;

@Slf4j
@Service
public class RrgConfigurationService {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path configDir = Paths.get("../storage/config/rrg");
    private final Path backupsDir = configDir.resolve("backups");

    private final Path watchlistPath = configDir.resolve("sector_rrg_watchlist.json");
    private final Path settingsPath = configDir.resolve("rrg_settings.json");
    private final Path commandBarPath = configDir.resolve("rrg_commandbar.json");
    private final Path timeframesPath = configDir.resolve("rrg_timeframes.json");
    private final Path cachePolicyPath = configDir.resolve("rrg_cache_policy.json");
    private final Path featureFlagsPath = configDir.resolve("rrg_feature_flags.json");

    private final AtomicReference<RrgRuntimeConfigurationSnapshot> runtimeSnapshotRef = new AtomicReference<>();
    private volatile RrgRuntimeConfigurationSnapshot lastKnownGoodSnapshot;

    private final SnapshotBuildPipeline buildPipeline;
    private final ConfigReloadDebouncer debouncer;
    private final ApplicationEventPublisher eventPublisher;

    private WatchService watchService;
    private ExecutorService watchExecutor;
    private boolean hotReloadEnabled = true;

    public RrgConfigurationService(SnapshotBuildPipeline buildPipeline, ConfigReloadDebouncer debouncer, ApplicationEventPublisher eventPublisher) {
        this.buildPipeline = buildPipeline;
        this.debouncer = debouncer;
        this.eventPublisher = eventPublisher;
    }

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(configDir);
            Files.createDirectories(backupsDir);
            
            performFullReload();
            startWatchService();
        } catch (IOException e) {
            log.error("Failed to initialize RRG Configuration Service directories", e);
        }
    }

    @PreDestroy
    public void destroy() {
        if (watchExecutor != null) {
            watchExecutor.shutdownNow();
        }
        if (watchService != null) {
            try {
                watchService.close();
            } catch (IOException e) {
                log.error("Failed to close watch service", e);
            }
        }
    }

    public RrgRuntimeConfigurationSnapshot getRuntimeSnapshot() {
        return runtimeSnapshotRef.get();
    }

    private synchronized void performFullReload() {
        try {
            SettingsConfig settings = loadConfig(settingsPath, SettingsConfig.class, new SettingsConfig());
            CommandBarConfig commandBar = loadConfig(commandBarPath, CommandBarConfig.class, new CommandBarConfig());
            WatchlistConfig watchlist = loadConfig(watchlistPath, WatchlistConfig.class, new WatchlistConfig());
            TimeframesConfig timeframes = loadConfig(timeframesPath, TimeframesConfig.class, new TimeframesConfig());
            CachePolicyConfig cachePolicy = loadConfig(cachePolicyPath, CachePolicyConfig.class, new CachePolicyConfig());
            FeatureFlagsConfig featureFlags = loadConfig(featureFlagsPath, FeatureFlagsConfig.class, new FeatureFlagsConfig());

            RrgRuntimeConfigurationSnapshot newSnapshot = buildPipeline.build(
                settings, commandBar, watchlist, timeframes, cachePolicy, featureFlags
            );

            RrgRuntimeConfigurationSnapshot oldSnapshot = runtimeSnapshotRef.get();
            runtimeSnapshotRef.set(newSnapshot);
            lastKnownGoodSnapshot = newSnapshot;
            log.info("Successfully loaded new configuration snapshot: gen={}, hash={}", newSnapshot.generationId(), newSnapshot.configHash());
            
            java.util.Set<String> changedDomains = new java.util.HashSet<>();
            if (oldSnapshot != null) {
                if (!java.util.Objects.equals(oldSnapshot.settingsHash(), newSnapshot.settingsHash())) changedDomains.add("settings");
                if (!java.util.Objects.equals(oldSnapshot.commandBarHash(), newSnapshot.commandBarHash())) changedDomains.add("commandBar");
                if (!java.util.Objects.equals(oldSnapshot.watchlistHash(), newSnapshot.watchlistHash())) changedDomains.add("watchlist");
                if (!java.util.Objects.equals(oldSnapshot.timeframesHash(), newSnapshot.timeframesHash())) changedDomains.add("timeframes");
                if (!java.util.Objects.equals(oldSnapshot.cachePolicyHash(), newSnapshot.cachePolicyHash())) changedDomains.add("cachePolicy");
                if (!java.util.Objects.equals(oldSnapshot.featureFlagsHash(), newSnapshot.featureFlagsHash())) changedDomains.add("featureFlags");
            } else {
                changedDomains.addAll(java.util.Set.of("settings", "commandBar", "watchlist", "timeframes", "cachePolicy", "featureFlags"));
            }

            if (!changedDomains.isEmpty()) {
                eventPublisher.publishEvent(new com.vega.rrg.events.RrgConfigurationEvents.SnapshotChangedEvent(
                        oldSnapshot, newSnapshot, changedDomains, newSnapshot.generationId()
                ));
            }
        } catch (Exception e) {
            log.error("Failed to build new configuration snapshot. Retaining last known good state.", e);
            // System degraded warning logic
        }
    }

    private <T> T loadConfig(Path file, Class<T> clazz, T fallback) {
        if (!Files.exists(file)) {
            saveConfig(file, fallback);
            return fallback;
        }

        try {
            return objectMapper.readValue(file.toFile(), clazz);
        } catch (Exception e) {
            log.error("Failed to parse config file: {}. Returning null for partial domain degradation.", file, e);
            backupBrokenFile(file);
            return null; // The builder will use default fallback
        }
    }

    private void backupBrokenFile(Path file) {
        try {
            String backupName = file.getFileName().toString().replace(".json", ".bak.json");
            Path backupPath = backupsDir.resolve(backupName);
            Files.copy(file, backupPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("Backed up broken config to {}", backupPath);
        } catch (IOException ex) {
            log.error("Failed to backup broken config file", ex);
        }
    }

    private synchronized <T> void saveConfig(Path file, T config) {
        try {
            Path tempFile = file.resolveSibling(file.getFileName() + ".tmp");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), config);
            Files.move(tempFile, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            log.error("Failed to save config: {}", file, e);
        }
    }

    private void startWatchService() {
        try {
            watchService = FileSystems.getDefault().newWatchService();
            configDir.register(watchService, StandardWatchEventKinds.ENTRY_MODIFY);
            
            watchExecutor = Executors.newSingleThreadExecutor();
            watchExecutor.submit(() -> {
                while (!Thread.currentThread().isInterrupted()) {
                    try {
                        WatchKey key = watchService.take();
                        for (WatchEvent<?> event : key.pollEvents()) {
                            WatchEvent.Kind<?> kind = event.kind();
                            if (kind == StandardWatchEventKinds.OVERFLOW) continue;
                            
                            Path changed = (Path) event.context();
                            if (changed.toString().endsWith(".tmp") || changed.toString().endsWith("~")) continue;

                            if (hotReloadEnabled) {
                                debouncer.scheduleReload(this::performFullReload);
                            }
                        }
                        key.reset();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    } catch (Exception e) {
                        log.error("Error in hot reload watch service", e);
                    }
                }
            });
            log.info("Started hot-reload watch service for config directory");
        } catch (IOException e) {
            log.error("Failed to start watch service", e);
        }
    }

    public void updateSettingsConfig(SettingsConfig config, String expectedHash) {
        // Optimistic concurrency check (simplified for now)
        saveConfig(settingsPath, config);
        performFullReload();
    }
    
    public void updateCommandBarConfig(CommandBarConfig config, String expectedHash) {
        saveConfig(commandBarPath, config);
        performFullReload();
    }

    public void updateWatchlistConfig(WatchlistConfig config, String expectedHash) {
        saveConfig(watchlistPath, config);
        performFullReload();
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgConfigValidator.java
package com.vega.rrg.service;

import com.vega.rrg.model.config.CommandBarConfig;
import com.vega.rrg.model.config.SettingsConfig;
import com.vega.rrg.model.config.WatchlistConfig;
import com.vega.rrg.model.config.TimeframesConfig;
import com.vega.rrg.model.config.CachePolicyConfig;
import com.vega.rrg.model.config.FeatureFlagsConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RrgConfigValidator {

    public WatchlistConfig validate(WatchlistConfig config) {
        if (config == null) return new WatchlistConfig();

        var validatedProfiles = new java.util.ArrayList<WatchlistConfig.WatchlistProfile>();
        for (WatchlistConfig.WatchlistProfile profile : config.watchlists()) {
            var uniqueSymbols = new java.util.HashSet<String>();
            var validatedSectors = new java.util.ArrayList<WatchlistConfig.SectorEntry>();

            for (var sector : profile.sectors()) {
                if (sector.symbol() != null && !sector.symbol().isBlank()) {
                    if (uniqueSymbols.add(sector.symbol())) {
                        validatedSectors.add(sector);
                    }
                }
            }
            validatedProfiles.add(new WatchlistConfig.WatchlistProfile(
                    profile.id(), profile.name(), profile.active(), validatedSectors
            ));
        }

        return new WatchlistConfig(config.version(), config.updatedAt(), config.watchlistOnlyResampling(), validatedProfiles);
    }

    public SettingsConfig validate(SettingsConfig config) {
        if (config == null) return new SettingsConfig();

        SettingsConfig.CameraSettings newCamera = config.camera();
        if (newCamera != null) {
            double minZoom = newCamera.minInteractionZoom();
            double maxZoom = newCamera.maxZoom();
            boolean changed = false;

            if (minZoom <= 0) {
                minZoom = 0.1;
                changed = true;
            }
            if (maxZoom < minZoom) {
                maxZoom = minZoom + 5.0;
                changed = true;
            }
            
            if (changed) {
                newCamera = new SettingsConfig.CameraSettings(
                        newCamera.autoFitEnabled(),
                        newCamera.fitPadding(),
                        newCamera.smoothInterpolation(),
                        maxZoom,
                        minZoom
                );
            }
        }

        return new SettingsConfig(
                config.version(),
                config.updatedAt(),
                config.optimization(),
                config.rendering(),
                newCamera,
                config.interaction(),
                config.windowing()
        );
    }

    public CommandBarConfig validate(CommandBarConfig config) {
        if (config == null) return new CommandBarConfig();

        CommandBarConfig.Timeframes newTf = config.timeframes();
        if (newTf != null) {
            var unique = new LinkedHashSet<>(newTf.bookmarked());
            newTf = new CommandBarConfig.Timeframes(newTf.active(), new java.util.ArrayList<>(unique));
        }

        CommandBarConfig.TrailLengths newTl = config.trailLengths();
        if (newTl != null) {
            var unique = new LinkedHashSet<>(newTl.bookmarked());
            unique.removeIf(val -> val < 0);
            int active = newTl.active() < 0 ? 10 : newTl.active();
            newTl = new CommandBarConfig.TrailLengths(active, new java.util.ArrayList<>(unique));
        }

        return new CommandBarConfig(
                config.version(),
                config.updatedAt(),
                newTf,
                newTl,
                config.toggles()
        );
    }

    public TimeframesConfig validate(TimeframesConfig config) {
        if (config == null) return new TimeframesConfig();
        // Implement inheritance resolution here
        var validatedProfiles = new java.util.HashMap<String, TimeframesConfig.TimeframeProfileConfig>();
        for (var entry : config.profiles().entrySet()) {
            TimeframesConfig.TimeframeProfileConfig profile = entry.getValue();
            if (profile.extendProfile() != null && config.profiles().containsKey(profile.extendProfile())) {
                TimeframesConfig.TimeframeProfileConfig base = config.profiles().get(profile.extendProfile());
                profile = new TimeframesConfig.TimeframeProfileConfig(
                    null,
                    profile.smaPeriod() != null ? profile.smaPeriod() : base.smaPeriod(),
                    profile.minPeriods() != null ? profile.minPeriods() : base.minPeriods(),
                    profile.alignmentToleranceMs() != null ? profile.alignmentToleranceMs() : base.alignmentToleranceMs(),
                    profile.defaultTrailLength() != null ? profile.defaultTrailLength() : base.defaultTrailLength(),
                    profile.isIntraday() != null ? profile.isIntraday() : base.isIntraday(),
                    profile.emaSmoothing() != null ? profile.emaSmoothing() : base.emaSmoothing()
                );
            }
            validatedProfiles.put(entry.getKey(), profile);
        }
        return new TimeframesConfig(config.version(), config.updatedAt(), validatedProfiles);
    }

    public CachePolicyConfig validate(CachePolicyConfig config) {
        if (config == null) return new CachePolicyConfig();
        return config;
    }

    public FeatureFlagsConfig validate(FeatureFlagsConfig config) {
        if (config == null) return new FeatureFlagsConfig();
        return config;
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgService.java
package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import com.vega.rrg.model.RrgTimeframeConfig;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RrgService {

    @Autowired
    private CandleService candleService;

    private static final Map<String, RrgTimeframeConfig> CONFIGS = Map.of(
        "1min", new RrgTimeframeConfig(10, 25, 60_000L, 60, true, 5),
        "5min", new RrgTimeframeConfig(10, 25, 300_000L, 48, true, 3),
        "15min", new RrgTimeframeConfig(12, 30, 900_000L, 32, true, 3),
        "30min", new RrgTimeframeConfig(14, 30, 1800_000L, 24, true, 2),
        "1h", new RrgTimeframeConfig(14, 40, 3600_000L, 20, true, 2),
        "1d", new RrgTimeframeConfig(14, 30, 86400_000L, 10, false, 1),
        "1w", new RrgTimeframeConfig(10, 30, 7 * 86400_000L, 10, false, 1),
        "1mo", new RrgTimeframeConfig(6, 18, 10 * 86400_000L, 10, false, 1)
    );

    @Autowired
    private RrgWindowCalculator windowCalculator;

    @Autowired
    private SectorComputationPlanner planner;
    
    @Autowired
    private RrgSnapshotCache cache;

    private final java.util.concurrent.ExecutorService selectiveComputeExecutor = 
        java.util.concurrent.Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors() / 2)
        );

    public static RrgTimeframeConfig getConfig(ParsedTimeframe tf) {
        int emaSmoothing = (tf.getUnit() == com.vega.rrg.model.TimeUnit.MINUTE || tf.getUnit() == com.vega.rrg.model.TimeUnit.HOUR) ? 3 : 1;
        int smaPeriod = 14;
        if (tf.getUnit() == com.vega.rrg.model.TimeUnit.WEEK) smaPeriod = 10;
        else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.MONTH) smaPeriod = 6;
        else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.YEAR) smaPeriod = 5;

        int minPeriods = smaPeriod * 2 + emaSmoothing;
        long alignmentToleranceMs = 60_000L * tf.getBaseCandleMultiplier();
        int defaultTrailLength = 10;
        if (tf.getUnit() == com.vega.rrg.model.TimeUnit.MINUTE) {
            if (tf.getMultiplier() == 1) defaultTrailLength = 60;
            else if (tf.getMultiplier() == 5) defaultTrailLength = 48;
            else if (tf.getMultiplier() == 15) defaultTrailLength = 32;
            else if (tf.getMultiplier() == 30) defaultTrailLength = 24;
        } else if (tf.getUnit() == com.vega.rrg.model.TimeUnit.HOUR) {
            defaultTrailLength = 20;
        }

        return new RrgTimeframeConfig(smaPeriod, minPeriods, alignmentToleranceMs, defaultTrailLength, tf.isIntraday(), emaSmoothing);
    }

    public List<RrgPoint> calculateRrg(List<String> allSectors, String benchmark, ParsedTimeframe parsedTf, int trailLength, boolean normalized, boolean minimalWindowResampling) {
        return calculateRrg(allSectors, benchmark, parsedTf, trailLength, normalized, minimalWindowResampling, null, null, null, false, false);
    }

    public List<RrgPoint> calculateRrg(List<String> allSectors, String benchmark, ParsedTimeframe parsedTf, int trailLength, boolean normalized, boolean minimalWindowResampling,
                                       List<String> watchlist, String selectedSector, String hoveredSector, boolean watchlistOnlyResampling, boolean replayMode) {
        long startTotal = System.currentTimeMillis();
        
        SectorComputationPlanner.SectorComputationPlan plan = planner.plan(
                allSectors, watchlist, selectedSector, hoveredSector, watchlistOnlyResampling, replayMode, cache,
                benchmark, parsedTf, trailLength, normalized
        );

        int requiredRawCandles = -1;
        if (minimalWindowResampling && !plan.fullCompute.isEmpty()) {
            long startCalc = System.currentTimeMillis();
            requiredRawCandles = windowCalculator.calculateRequiredRawCandles(parsedTf, trailLength, getConfig(parsedTf));
            long calcMs = System.currentTimeMillis() - startCalc;
        }
        
        final int finalRequiredRawCandles = requiredRawCandles;

        long startAggr = System.currentTimeMillis();
        Optional<ProtoCandleFile> benchmarkFile = finalRequiredRawCandles > 0 && !plan.fullCompute.isEmpty()
            ? candleService.loadRecentCandles(benchmark, parsedTf, finalRequiredRawCandles)
            : candleService.loadCandles(benchmark, parsedTf);
            
        List<Long> benchmarkTimestamps = new ArrayList<>();
        Map<Long, Double> benchmarkCloses = new TreeMap<>();
        List<ProtoCandle> benchmarkCandles = new ArrayList<>();

        if (benchmarkFile.isPresent()) {
            benchmarkCandles = benchmarkFile.get().getCandlesList();
            benchmarkTimestamps = benchmarkCandles.stream()
                    .map(ProtoCandle::getEpochMillis)
                    .collect(Collectors.toList());
            benchmarkCloses = benchmarkCandles.stream()
                    .collect(Collectors.toMap(ProtoCandle::getEpochMillis, ProtoCandle::getClose, (a, b) -> a, TreeMap::new));
        }

        List<RrgPoint> results = new ArrayList<>();
        long now = System.currentTimeMillis();

        // 1. Process cachedOnly sectors
        for (String sector : plan.cachedOnly) {
            Optional<RrgPoint> cachedOpt = cache.get(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector);
            if (cachedOpt.isPresent()) {
                RrgPoint point = cachedOpt.get();
                point.setStale(true);
                results.add(point);
            }
        }

        // 2. Process fullCompute sectors concurrently using custom executor
        if (!plan.fullCompute.isEmpty() && benchmarkFile.isPresent()) {
            final List<Long> bTs = benchmarkTimestamps;
            final Map<Long, Double> bCloses = benchmarkCloses;
            
            List<java.util.concurrent.CompletableFuture<Optional<RrgPoint>>> futures = plan.fullCompute.stream()
                .map(sector -> java.util.concurrent.CompletableFuture.supplyAsync(
                    () -> {
                        Optional<RrgPoint> opt = calculateForSector(sector, bTs, bCloses, parsedTf, trailLength, normalized, finalRequiredRawCandles);
                        opt.ifPresent(p -> {
                            p.setStale(false);
                            p.setComputedAt(now);
                            cache.put(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector, p);
                        });
                        return opt;
                    }, 
                    selectiveComputeExecutor))
                .collect(Collectors.toList());

            for (java.util.concurrent.CompletableFuture<Optional<RrgPoint>> f : futures) {
                try {
                    f.join().ifPresent(results::add);
                } catch (Exception e) {
                    log.error("Error computing RRG point", e);
                }
            }
        }
                
        long aggrMs = System.currentTimeMillis() - startAggr;
        long rrgMs = System.currentTimeMillis() - startTotal;
        
        log.info("RRG Compute Metrics: total={} ms, aggr={} ms, fullCompute={}, cachedReuse={}, skipped={}, rawCandlesLoaded={}", 
            rrgMs, aggrMs, plan.fullCompute.size(), plan.cachedOnly.size(), plan.skipped.size(),
            (finalRequiredRawCandles > 0 ? finalRequiredRawCandles * (plan.fullCompute.size() + 1) : "all"));
        
        return results;
    }

    private Optional<RrgPoint> calculateForSector(String sector, List<Long> benchmarkTimestamps, Map<Long, Double> benchmarkCloses, ParsedTimeframe parsedTf, int trailLength, boolean normalized, int requiredRawCandles) {
        Optional<ProtoCandleFile> sectorFile = requiredRawCandles > 0
            ? candleService.loadRecentCandles(sector, parsedTf, requiredRawCandles)
            : candleService.loadCandles(sector, parsedTf);
            
        if (sectorFile.isEmpty()) return Optional.empty();

        List<ProtoCandle> sectorCandles = sectorFile.get().getCandlesList();
        RrgTimeframeConfig config = getConfig(parsedTf);
        
        // Align sector closes to benchmark timestamps
        Map<Long, Double> alignedSectorCloses = TimeSeriesAligner.alignSectorCloses(sectorCandles, benchmarkTimestamps, config.alignmentToleranceMs());
        
        List<Long> timestamps = new ArrayList<>();
        List<Double> rawRsSeries = new ArrayList<>();

        for (Long bTs : benchmarkTimestamps) {
            Double sClose = alignedSectorCloses.get(bTs);
            if (sClose != null && benchmarkCloses.containsKey(bTs)) {
                timestamps.add(bTs);
                rawRsSeries.add(sClose / benchmarkCloses.get(bTs));
            }
        }

        int minPeriods = config.minPeriods();
        int smaPeriod = config.smaPeriod();
        
        if (rawRsSeries.size() < minPeriods) return Optional.empty(); // Need enough data for MAs

        double axisCenter = normalized ? 100.0 : 1.0;
        List<Double> xSeries;
        List<Double> ySeries;

        if (normalized) {
            xSeries = calculateSmaNormalized(rawRsSeries, smaPeriod, 100.0);
            ySeries = calculateSmaNormalized(xSeries, smaPeriod, 100.0);
        } else {
            xSeries = new ArrayList<>(rawRsSeries.size());
            double firstRs = rawRsSeries.get(0);
            for (Double rs : rawRsSeries) {
                xSeries.add(rs / firstRs);
            }
            List<Double> ema = calculateEmaSeries(xSeries, smaPeriod, 1.0);
            ySeries = new ArrayList<>(xSeries.size());
            for (int i = 0; i < xSeries.size(); i++) {
                if (i < smaPeriod - 1) { // period - 1
                    ySeries.add(1.0);
                } else {
                    ySeries.add(xSeries.get(i) / ema.get(i));
                }
            }
        }

        if (config.emaSmoothing() > 1) {
            xSeries = calculateEmaSeries(xSeries, config.emaSmoothing(), axisCenter);
            ySeries = calculateEmaSeries(ySeries, config.emaSmoothing(), axisCenter);
        }

        int lastIdx = xSeries.size() - 1;
        List<RrgPoint.TrailPoint> trail = new ArrayList<>();
        for (int i = Math.max(0, lastIdx - trailLength + 1); i <= lastIdx; i++) {
            trail.add(RrgPoint.TrailPoint.builder()
                    .epochMillis(timestamps.get(i))
                    .x(xSeries.get(i))
                    .y(ySeries.get(i))
                    .build());
        }

        double x = xSeries.get(lastIdx);
        double y = ySeries.get(lastIdx);

        return Optional.of(RrgPoint.builder()
                .symbol(sector)
                .x(x)
                .y(y)
                .quadrant(getQuadrant(x, y, axisCenter))
                .trail(trail)
                .build());
    }

    private List<Double> calculateSmaNormalized(List<Double> series, int period, double center) {
        List<Double> normalized = new ArrayList<>();
        for (int i = 0; i < series.size(); i++) {
            if (i < period - 1) {
                normalized.add(center);
                continue;
            }
            double sum = 0;
            for (int j = i - period + 1; j <= i; j++) {
                sum += series.get(j);
            }
            double ma = sum / period;
            normalized.add((series.get(i) / ma) * center);
        }
        return normalized;
    }

    private List<Double> calculateEmaSeries(List<Double> series, int period, double center) {
        List<Double> ema = new ArrayList<>();
        double multiplier = 2.0 / (period + 1);
        double sum = 0;
        for (int i = 0; i < series.size(); i++) {
            if (i < period - 1) {
                sum += series.get(i);
                ema.add(center);
                continue;
            }
            if (i == period - 1) {
                sum += series.get(i);
                double sma = sum / period;
                ema.add(sma);
            } else {
                double prevEma = ema.get(i - 1);
                ema.add((series.get(i) - prevEma) * multiplier + prevEma);
            }
        }
        return ema;
    }

    private String getQuadrant(double x, double y, double axisCenter) {
        if (x >= axisCenter && y >= axisCenter) return "LEADING";
        if (x >= axisCenter && y < axisCenter) return "WEAKENING";
        if (x < axisCenter && y < axisCenter) return "LAGGING";
        return "IMPROVING";
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgSnapshotCache.java
package com.vega.rrg.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.vega.rrg.model.RrgPoint;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class RrgSnapshotCache {

    private final Cache<String, RrgPoint> cache = Caffeine.newBuilder()
            .maximumWeight(200_000_000) // Approx 200MB
            .weigher((String key, RrgPoint value) -> {
                // Approximate weight: 100 bytes base + 24 bytes per trail point
                int trailSize = value.getTrail() != null ? value.getTrail().size() : 0;
                return 100 + (trailSize * 24);
            })
            .build();

    public void put(String benchmark, String canonicalTf, int trailLength, boolean normalized, String sector, RrgPoint point) {
        String key = generateKey(benchmark, canonicalTf, trailLength, normalized, sector);
        // Store an immutable clone to prevent external mutation
        cache.put(key, point.deepClone());
    }

    public Optional<RrgPoint> get(String benchmark, String canonicalTf, int trailLength, boolean normalized, String sector) {
        String key = generateKey(benchmark, canonicalTf, trailLength, normalized, sector);
        RrgPoint point = cache.getIfPresent(key);
        if (point != null) {
            // Return an immutable clone so the caller doesn't mutate the cache
            return Optional.of(point.deepClone());
        }
        return Optional.empty();
    }
    
    public java.util.Set<String> getKeys() {
        return cache.asMap().keySet();
    }

    public java.util.Map<String, RrgPoint> getAsMap() {
        return cache.asMap();
    }

    public void invalidateAll() {
        cache.invalidateAll();
    }

    private String generateKey(String benchmark, String canonicalTf, int trailLength, boolean normalized, String sector) {
        return String.format("snapshot_v1|%s|%s|%d|%b|%s", benchmark, canonicalTf, trailLength, normalized, sector);
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\RrgWindowCalculator.java
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
```

```java
// File: src\main\java\com\vega\rrg\service\SectorComputationPlanner.java
package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Component
public class SectorComputationPlanner {

    public static class SectorComputationPlan {
        public List<String> fullCompute = new ArrayList<>();
        public List<String> cachedOnly = new ArrayList<>();
        public List<String> skipped = new ArrayList<>();
    }

    public SectorComputationPlan plan(
            List<String> allSectors,
            List<String> watchlist,
            String selectedSector,
            String hoveredSector,
            boolean watchlistOnlyResampling,
            boolean replayMode,
            RrgSnapshotCache cache,
            String benchmark,
            ParsedTimeframe parsedTf,
            int trailLength,
            boolean normalized) {

        SectorComputationPlan plan = new SectorComputationPlan();
        long now = System.currentTimeMillis();
        long ttlMs = getTtlMs(parsedTf.getTimeframeScaleClass());

        Set<String> watchlistSet = watchlist != null ? new HashSet<>(watchlist) : new HashSet<>();
        
        List<String> priority1 = new ArrayList<>(); // selected
        List<String> priority2 = new ArrayList<>(); // hovered
        List<String> priority3 = new ArrayList<>(); // watchlist
        List<String> priority4 = new ArrayList<>(); // others (cache miss or ttl expired)

        for (String sector : allSectors) {
            boolean isWatchlist = watchlistSet.contains(sector);
            boolean isSelected = sector.equals(selectedSector);
            boolean isHovered = sector.equals(hoveredSector);

            if (replayMode || !watchlistOnlyResampling || isSelected || isHovered || isWatchlist) {
                assignPriority(sector, isSelected, isHovered, isWatchlist, priority1, priority2, priority3, priority4);
            } else {
                Optional<RrgPoint> cachedOpt = cache.get(benchmark, parsedTf.getCanonical(), trailLength, normalized, sector);
                if (cachedOpt.isEmpty()) {
                    assignPriority(sector, false, false, false, priority1, priority2, priority3, priority4);
                } else {
                    RrgPoint cached = cachedOpt.get();
                    if (now - cached.getComputedAt() > ttlMs) {
                        assignPriority(sector, false, false, false, priority1, priority2, priority3, priority4);
                    } else {
                        plan.cachedOnly.add(sector);
                    }
                }
            }
        }

        plan.fullCompute.addAll(priority1);
        plan.fullCompute.addAll(priority2);
        plan.fullCompute.addAll(priority3);
        plan.fullCompute.addAll(priority4);

        return plan;
    }

    private void assignPriority(String sector, boolean isSelected, boolean isHovered, boolean isWatchlist,
                                List<String> p1, List<String> p2, List<String> p3, List<String> p4) {
        if (isSelected) p1.add(sector);
        else if (isHovered) p2.add(sector);
        else if (isWatchlist) p3.add(sector);
        else p4.add(sector);
    }

    public long getTtlMs(String scaleClass) {
        if (scaleClass == null) return 60_000L;
        switch (scaleClass) {
            case "ultra_intraday": return 30_000L;
            case "intraday": return 120_000L;
            case "swing": return 900_000L;
            case "position": return 3600_000L;
            case "macro": return 86400_000L;
            default: return 60_000L;
        }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\SnapshotBuildPipeline.java
package com.vega.rrg.service;

import com.vega.rrg.model.config.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class SnapshotBuildPipeline {

    private final RrgConfigValidator validator;
    private final RrgConfigMigrationService migrationService;
    private final ConfigHasher hasher;
    private final AtomicLong generationCounter = new AtomicLong(0);

    public SnapshotBuildPipeline(RrgConfigValidator validator, RrgConfigMigrationService migrationService, ConfigHasher hasher) {
        this.validator = validator;
        this.migrationService = migrationService;
        this.hasher = hasher;
    }

    public RrgRuntimeConfigurationSnapshot build(
            SettingsConfig rawSettings,
            CommandBarConfig rawCommandBar,
            WatchlistConfig rawWatchlist,
            TimeframesConfig rawTimeframes,
            CachePolicyConfig rawCachePolicy,
            FeatureFlagsConfig rawFeatureFlags) {
        
        long generationId = generationCounter.incrementAndGet();

        // Stage 2: Migrate
        SettingsConfig migratedSettings = migrationService.migrate(rawSettings);
        CommandBarConfig migratedCommandBar = migrationService.migrate(rawCommandBar);
        WatchlistConfig migratedWatchlist = migrationService.migrate(rawWatchlist);
        TimeframesConfig migratedTimeframes = migrationService.migrate(rawTimeframes);
        CachePolicyConfig migratedCachePolicy = migrationService.migrate(rawCachePolicy);
        FeatureFlagsConfig migratedFeatureFlags = migrationService.migrate(rawFeatureFlags);

        // Stage 3 & 4: Validate & Normalize
        SettingsConfig validSettings = validator.validate(migratedSettings);
        CommandBarConfig validCommandBar = validator.validate(migratedCommandBar);
        WatchlistConfig validWatchlist = validator.validate(migratedWatchlist);
        TimeframesConfig validTimeframes = validator.validate(migratedTimeframes); // Handle inheritance here
        CachePolicyConfig validCachePolicy = validator.validate(migratedCachePolicy);
        FeatureFlagsConfig validFeatureFlags = validator.validate(migratedFeatureFlags);

        // Stage 5: Hash
        String settingsHash = hasher.hash(validSettings);
        String commandBarHash = hasher.hash(validCommandBar);
        String watchlistHash = hasher.hash(validWatchlist);
        String timeframesHash = hasher.hash(validTimeframes);
        String cachePolicyHash = hasher.hash(validCachePolicy);
        String featureFlagsHash = hasher.hash(validFeatureFlags);

        String globalHash = hasher.hash(Map.of(
                "settings", settingsHash,
                "commandBar", commandBarHash,
                "watchlist", watchlistHash,
                "timeframes", timeframesHash,
                "cachePolicy", cachePolicyHash,
                "featureFlags", featureFlagsHash
        ));

        // Stage 6: Finalize (Immutable Snapshot)
        return new RrgRuntimeConfigurationSnapshot(
                validSettings,
                validCommandBar,
                validWatchlist,
                validTimeframes,
                validCachePolicy,
                validFeatureFlags,
                1, // configVersion
                globalHash,
                generationId,
                System.currentTimeMillis(),
                settingsHash,
                commandBarHash,
                watchlistHash,
                timeframesHash,
                cachePolicyHash,
                featureFlagsHash
        );
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\SnapshotRefreshScheduler.java
package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class SnapshotRefreshScheduler {

    @Autowired
    private RrgSnapshotCache cache;

    @Lazy
    @Autowired
    private RrgService rrgService;

    @Autowired
    private TimeframeParser timeframeParser;

    @Autowired
    private SectorComputationPlanner planner;

    private static final int MAX_REFRESH_PER_CYCLE = 10;

    @Scheduled(fixedDelay = 60000)
    public void refreshStaleSnapshots() {
        Map<String, RrgPoint> cacheMap = cache.getAsMap();
        if (cacheMap.isEmpty()) return;

        long now = System.currentTimeMillis();
        
        // Find stale items that are close to or exceeding TTL
        List<Map.Entry<String, RrgPoint>> candidates = new ArrayList<>();
        
        for (Map.Entry<String, RrgPoint> entry : cacheMap.entrySet()) {
            String key = entry.getKey();
            RrgPoint point = entry.getValue();
            
            try {
                String[] parts = key.split("\\|");
                if (parts.length < 6) continue;
                String canonicalTf = parts[2];
                ParsedTimeframe parsedTf = timeframeParser.parse(canonicalTf);
                long ttlMs = planner.getTtlMs(parsedTf.getTimeframeScaleClass());
                
                // If age > TTL / 2, consider it a candidate for background refresh
                long age = now - point.getComputedAt();
                if (age > (ttlMs / 2)) {
                    candidates.add(entry);
                }
            } catch (Exception e) {
                log.warn("Failed to parse cache key for background refresh: {}", key);
            }
        }
        
        if (candidates.isEmpty()) return;
        
        // Sort by oldest first
        candidates.sort(Comparator.comparingLong(e -> e.getValue().getComputedAt()));
        
        int count = Math.min(MAX_REFRESH_PER_CYCLE, candidates.size());
        List<Map.Entry<String, RrgPoint>> toRefresh = candidates.subList(0, count);
        
        log.info("Background refresh triggered for {} stale sectors", count);
        
        for (Map.Entry<String, RrgPoint> entry : toRefresh) {
            String key = entry.getKey();
            try {
                String[] parts = key.split("\\|");
                String benchmark = parts[1];
                String canonicalTf = parts[2];
                int trailLength = Integer.parseInt(parts[3]);
                boolean normalized = Boolean.parseBoolean(parts[4]);
                String sector = parts[5];
                
                ParsedTimeframe parsedTf = timeframeParser.parse(canonicalTf);
                
                // Compute using the exact same parameters (minimalWindowResampling = true as optimization)
                List<RrgPoint> results = rrgService.calculateRrg(
                        Collections.singletonList(sector),
                        benchmark,
                        parsedTf,
                        trailLength,
                        normalized,
                        true
                );
                
                if (!results.isEmpty()) {
                    RrgPoint fresh = results.get(0);
                    fresh.setComputedAt(System.currentTimeMillis());
                    fresh.setStale(false);
                    cache.put(benchmark, canonicalTf, trailLength, normalized, sector, fresh);
                }
                
            } catch (Exception e) {
                log.error("Failed to refresh stale snapshot for key: {}", key, e);
            }
        }
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\TimeframeAggregationService.java
package com.vega.rrg.service;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.TimeUnit;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Supplier;

@Slf4j
@Service
public class TimeframeAggregationService {

    @Autowired
    private TradingSessionProvider sessionProvider;

    private final Cache<String, Optional<ProtoCandleFile>> cache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(Duration.ofHours(12))
            .build();

    public Optional<ProtoCandleFile> getAggregated(String sector, ParsedTimeframe tf, Supplier<Optional<ProtoCandleFile>> dailySupplier) {
        String key = "v2_session_anchor_partial_live|" + sector + "|" + tf.getCanonical();
        return cache.get(key, k -> {
            Optional<ProtoCandleFile> baseOpt = dailySupplier.get();
            if (baseOpt.isEmpty()) return Optional.empty();
            ProtoCandleFile baseFile = baseOpt.get();
            if (baseFile.getCandlesCount() == 0) return baseOpt;
            return Optional.of(doAggregation(baseFile, tf));
        });
    }

    public Optional<ProtoCandleFile> getAggregatedWindow(String sector, ParsedTimeframe tf, int requiredRawCandles, Supplier<Optional<ProtoCandleFile>> baseCandleSupplier) {
        String key = "v2_session_anchor_partial_live|" + sector + "|" + tf.getCanonical() + "|" + requiredRawCandles + "|windowed";
        return cache.get(key, k -> {
            Optional<ProtoCandleFile> baseOpt = baseCandleSupplier.get();
            if (baseOpt.isEmpty()) return Optional.empty();
            ProtoCandleFile baseFile = baseOpt.get();
            if (baseFile.getCandlesCount() == 0) return baseOpt;
            return Optional.of(doAggregation(baseFile, tf));
        });
    }

    private ProtoCandleFile doAggregation(ProtoCandleFile baseFile, ParsedTimeframe tf) {
        List<ProtoCandle> baseCandles = baseFile.getCandlesList();
        List<ProtoCandle> aggregated;

        if (tf.getUnit() == TimeUnit.MINUTE || tf.getUnit() == TimeUnit.HOUR) {
            aggregated = aggregateIntraday(baseCandles, tf);
        } else if (tf.getUnit() == TimeUnit.DAY) {
            aggregated = aggregateDaily(baseCandles, tf);
        } else if (tf.getUnit() == TimeUnit.WEEK) {
            aggregated = aggregateWeekly(baseCandles, tf);
        } else if (tf.getUnit() == TimeUnit.MONTH) {
            aggregated = aggregateMonthly(baseCandles, tf);
        } else if (tf.getUnit() == TimeUnit.YEAR) {
            aggregated = aggregateYearly(baseCandles, tf);
        } else {
            aggregated = baseCandles;
        }

        return ProtoCandleFile.newBuilder()
                .setInstrumentKey(baseFile.getInstrumentKey())
                .setTimeframe(tf.getCanonical())
                .setUpdatedAtEpochMillis(baseFile.getUpdatedAtEpochMillis())
                .addAllCandles(aggregated)
                .build();
    }

    private List<ProtoCandle> aggregateIntraday(List<ProtoCandle> candles, ParsedTimeframe tf) {
        Map<String, List<ProtoCandle>> grouped = new LinkedHashMap<>();
        int intervalMinutes = tf.getBaseCandleMultiplier();
        int openHour = sessionProvider.getOpenTime().getHour();
        int openMinute = sessionProvider.getOpenTime().getMinute();
        int openTotalMinutes = openHour * 60 + openMinute;

        for (ProtoCandle c : candles) {
            ZonedDateTime zdt = Instant.ofEpochMilli(c.getEpochMillis()).atZone(sessionProvider.getZoneId());
            int sessionMinute = (zdt.getHour() * 60 + zdt.getMinute()) - openTotalMinutes;
            
            if (sessionMinute < 0) continue; // Before session start

            int minuteBucket = (sessionMinute / intervalMinutes) * intervalMinutes;
            String key = zdt.toLocalDate().toString() + "|" + minuteBucket;
            
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(c);
        }
        return buildAggregated(grouped);
    }

    private List<ProtoCandle> aggregateDaily(List<ProtoCandle> candles, ParsedTimeframe tf) {
        Map<String, List<ProtoCandle>> grouped = new LinkedHashMap<>();
        int multiplier = tf.getMultiplier();
        for (ProtoCandle c : candles) {
            ZonedDateTime zdt = Instant.ofEpochMilli(c.getEpochMillis()).atZone(sessionProvider.getZoneId());
            long epochDay = zdt.toLocalDate().toEpochDay();
            long bucketId = epochDay / multiplier;
            grouped.computeIfAbsent(String.valueOf(bucketId), k -> new ArrayList<>()).add(c);
        }
        return buildAggregated(grouped);
    }

    private List<ProtoCandle> aggregateWeekly(List<ProtoCandle> candles, ParsedTimeframe tf) {
        Map<String, List<ProtoCandle>> grouped = new LinkedHashMap<>();
        int multiplier = tf.getMultiplier();
        for (ProtoCandle c : candles) {
            ZonedDateTime zdt = Instant.ofEpochMilli(c.getEpochMillis()).atZone(sessionProvider.getZoneId());
            long epochDay = zdt.toLocalDate().toEpochDay();
            long weekEpochIndex = (epochDay + 3) / 7; // Monday epoch
            long bucketId = weekEpochIndex / multiplier;
            grouped.computeIfAbsent(String.valueOf(bucketId), k -> new ArrayList<>()).add(c);
        }
        return buildAggregated(grouped);
    }

    private List<ProtoCandle> aggregateMonthly(List<ProtoCandle> candles, ParsedTimeframe tf) {
        Map<String, List<ProtoCandle>> grouped = new LinkedHashMap<>();
        int multiplier = tf.getMultiplier();
        for (ProtoCandle c : candles) {
            ZonedDateTime zdt = Instant.ofEpochMilli(c.getEpochMillis()).atZone(sessionProvider.getZoneId());
            YearMonth ym = YearMonth.from(zdt);
            long monthIndex = ym.getYear() * 12L + (ym.getMonthValue() - 1);
            long bucketId = monthIndex / multiplier;
            grouped.computeIfAbsent(String.valueOf(bucketId), k -> new ArrayList<>()).add(c);
        }
        return buildAggregated(grouped);
    }

    private List<ProtoCandle> aggregateYearly(List<ProtoCandle> candles, ParsedTimeframe tf) {
        Map<String, List<ProtoCandle>> grouped = new LinkedHashMap<>();
        int multiplier = tf.getMultiplier();
        for (ProtoCandle c : candles) {
            ZonedDateTime zdt = Instant.ofEpochMilli(c.getEpochMillis()).atZone(sessionProvider.getZoneId());
            int year = zdt.getYear();
            long bucketId = year / multiplier;
            grouped.computeIfAbsent(String.valueOf(bucketId), k -> new ArrayList<>()).add(c);
        }
        return buildAggregated(grouped);
    }

    private List<ProtoCandle> buildAggregated(Map<String, List<ProtoCandle>> grouped) {
        List<ProtoCandle> result = new ArrayList<>(grouped.size());
        for (List<ProtoCandle> group : grouped.values()) {
            if (group.isEmpty()) continue;
            group.sort(Comparator.comparingLong(ProtoCandle::getEpochMillis));
            ProtoCandle first = group.get(0);
            ProtoCandle last = group.get(group.size() - 1);

            double open = first.getOpen();
            double close = last.getClose();
            double high = group.stream().mapToDouble(ProtoCandle::getHigh).max().orElse(first.getHigh());
            double low = group.stream().mapToDouble(ProtoCandle::getLow).min().orElse(first.getLow());
            double volume = group.stream().mapToDouble(ProtoCandle::getVolume).sum();

            result.add(ProtoCandle.newBuilder()
                    .setEpochMillis(last.getEpochMillis())
                    .setOpen(open)
                    .setHigh(high)
                    .setLow(low)
                    .setClose(close)
                    .setVolume(volume)
                    .setOpenInterest(last.getOpenInterest())
                    .build());
        }
        return result;
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\TimeframeParser.java
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
```

```java
// File: src\main\java\com\vega\rrg\service\TimeSeriesAligner.java
package com.vega.rrg.service;

import com.vega.rrg.proto.ProtoCandle;
import java.util.*;

public class TimeSeriesAligner {

    /**
     * Aligns sector candles to benchmark timestamps to prevent dropping candles due to holiday mismatches.
     * Returns a map of benchmark timestamp -> sector close price.
     */
    public static Map<Long, Double> alignSectorCloses(List<ProtoCandle> sectorCandles, List<Long> benchmarkTimestamps, long maxDiffMs) {
        Map<Long, Double> alignedCloses = new LinkedHashMap<>();
        if (sectorCandles.isEmpty() || benchmarkTimestamps.isEmpty()) return alignedCloses;

        int sectorIdx = 0;
        int maxIdx = sectorCandles.size() - 1;
        long MAX_DIFF_MS = maxDiffMs;

        for (Long bTs : benchmarkTimestamps) {
            while (sectorIdx < maxIdx) {
                long currentTs = sectorCandles.get(sectorIdx).getEpochMillis();
                long nextTs = sectorCandles.get(sectorIdx + 1).getEpochMillis();
                
                if (nextTs <= bTs) {
                    sectorIdx++;
                } else {
                    long currentDiff = Math.abs(currentTs - bTs);
                    long nextDiff = Math.abs(nextTs - bTs);
                    if (nextDiff < currentDiff) {
                        sectorIdx++;
                    } else {
                        break;
                    }
                }
            }
            
            ProtoCandle matched = sectorCandles.get(sectorIdx);
            if (Math.abs(matched.getEpochMillis() - bTs) <= MAX_DIFF_MS) {
                alignedCloses.put(bTs, matched.getClose());
            }
        }
        
        return alignedCloses;
    }
}
```

```java
// File: src\main\java\com\vega\rrg\service\TradingSessionProvider.java
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
```

```protobuf
// File: src\main\proto\warehouse.proto
syntax = "proto3";

package vega.rrg.proto;

option java_multiple_files = true;
option java_package = "com.vega.rrg.proto";
option java_outer_classname = "WarehouseProto";

message ProtoCandle {
  int64 epoch_millis = 1;
  double open = 2;
  double high = 3;
  double low = 4;
  double close = 5;
  double volume = 6;
  double open_interest = 7;
}

message ProtoCandleFile {
  string instrument_key = 1;
  string timeframe = 2;
  int64 updated_at_epoch_millis = 3;
  repeated ProtoCandle candles = 4;
}

message ProtoResolvedSectorInstrument {
  string sector = 1;
  string company_name = 2;
  string symbol = 3;
  string isin = 4;
  string instrument_key = 5;
  string segment = 6;
  string trading_symbol = 7;
}

message ProtoSectorMetadata {
  string sector_name = 1;
  string benchmark = 2;
  string index_symbol = 3;
  string index_instrument_key = 4;
  string weightage_url = 5;
  repeated ProtoResolvedSectorInstrument constituents = 6;
}

message ProtoSectorMetadataCollection {
  int64 updated_at_epoch_millis = 1;
  repeated ProtoSectorMetadata sectors = 2;
}

message ProtoInstrumentIndexEntry {
  string lookup_key = 1;
  string instrument_key = 2;
  string segment = 3;
  string instrument_type = 4;
  string exchange = 5;
  string name = 6;
  string isin = 7;
  string trading_symbol = 8;
}

message ProtoInstrumentIndexSnapshot {
  int64 updated_at_epoch_millis = 1;
  repeated ProtoInstrumentIndexEntry isin_entries = 2;
  repeated ProtoInstrumentIndexEntry symbol_entries = 3;
  repeated ProtoInstrumentIndexEntry trading_symbol_entries = 4;
  repeated ProtoInstrumentIndexEntry index_symbol_entries = 5;
}

message ProtoInstrumentMapping {
  string sector = 1;
  string isin = 2;
  string instrument_key = 3;
  string trading_symbol = 4;
  string segment = 5;
}

message ProtoInstrumentMappings {
  int64 updated_at_epoch_millis = 1;
  repeated ProtoInstrumentMapping mappings = 2;
}
```

```
// File: .gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

```javascript
// File: dist\assets\es-CRgxV0p-.js
function e(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement(`base`),i=n.createElement(`a`);return n.head.appendChild(r),n.body.appendChild(i),t&&(r.href=t),i.href=e,i.href}var t=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function n(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var r=null;function i(e={}){return r||(e.includeStyleProperties?(r=e.includeStyleProperties,r):(r=n(window.getComputedStyle(document.documentElement)),r))}function a(e,t){let n=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return n?parseFloat(n.replace(`px`,``)):0}function o(e){let t=a(e,`border-left-width`),n=a(e,`border-right-width`);return e.clientWidth+t+n}function s(e){let t=a(e,`border-top-width`),n=a(e,`border-bottom-width`);return e.clientHeight+t+n}function c(e,t={}){return{width:t.width||o(e),height:t.height||s(e)}}function l(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var u=16384;function ee(e){(e.width>u||e.height>u)&&(e.width>u&&e.height>u?e.width>e.height?(e.height*=u/e.width,e.width=u):(e.width*=u/e.height,e.height=u):e.width>u?(e.height*=u/e.width,e.width=u):(e.width*=u/e.height,e.height=u))}function d(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin=`anonymous`,r.decoding=`async`,r.src=e})}async function f(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(e=>`data:image/svg+xml;charset=utf-8,${e}`)}async function te(e,t,n){let r=`http://www.w3.org/2000/svg`,i=document.createElementNS(r,`svg`),a=document.createElementNS(r,`foreignObject`);return i.setAttribute(`width`,`${t}`),i.setAttribute(`height`,`${n}`),i.setAttribute(`viewBox`,`0 0 ${t} ${n}`),a.setAttribute(`width`,`100%`),a.setAttribute(`height`,`100%`),a.setAttribute(`x`,`0`),a.setAttribute(`y`,`0`),a.setAttribute(`externalResourcesRequired`,`true`),i.appendChild(a),a.appendChild(e),f(i)}var p=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||p(n,t)};function m(e){let t=e.getPropertyValue(`content`);return`${e.cssText} content: '${t.replace(/'|"/g,``)}';`}function ne(e,t){return i(t).map(t=>`${t}: ${e.getPropertyValue(t)}${e.getPropertyPriority(t)?` !important`:``};`).join(` `)}function re(e,t,n,r){let i=`.${e}:${t}`,a=n.cssText?m(n):ne(n,r);return document.createTextNode(`${i}{${a}}`)}function h(e,n,r,i){let a=window.getComputedStyle(e,r),o=a.getPropertyValue(`content`);if(o===``||o===`none`)return;let s=t();try{n.className=`${n.className} ${s}`}catch{return}let c=document.createElement(`style`);c.appendChild(re(s,r,a,i)),n.appendChild(c)}function ie(e,t,n){h(e,t,`:before`,n),h(e,t,`:after`,n)}var g=`application/font-woff`,_=`image/jpeg`,v={woff:g,woff2:g,ttf:`application/font-truetype`,eot:`application/vnd.ms-fontobject`,png:`image/png`,jpg:_,jpeg:_,gif:`image/gif`,tiff:`image/tiff`,svg:`image/svg+xml`,webp:`image/webp`};function y(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:``}function b(e){return v[y(e).toLowerCase()]||``}function x(e){return e.split(/,/)[1]}function S(e){return e.search(/^(data:)/)!==-1}function C(e,t){return`data:${t};base64,${e}`}async function w(e,t,n){let r=await fetch(e,t);if(r.status===404)throw Error(`Resource "${r.url}" not found`);let i=await r.blob();return new Promise((e,t)=>{let a=new FileReader;a.onerror=t,a.onloadend=()=>{try{e(n({res:r,result:a.result}))}catch(e){t(e)}},a.readAsDataURL(i)})}var T={};function ae(e,t,n){let r=e.replace(/\?.*/,``);return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,``)),t?`[${t}]${r}`:r}async function E(e,t,n){let r=ae(e,t,n.includeQueryParams);if(T[r]!=null)return T[r];n.cacheBust&&(e+=(/\?/.test(e)?`&`:`?`)+new Date().getTime());let i;try{i=C(await w(e,n.fetchRequestInit,({res:e,result:n})=>(t||=e.headers.get(`Content-Type`)||``,x(n))),t)}catch(t){i=n.imagePlaceholder||``;let r=`Failed to fetch resource: ${e}`;t&&(r=typeof t==`string`?t:t.message),r&&console.warn(r)}return T[r]=i,i}async function oe(e){let t=e.toDataURL();return t===`data:,`?e.cloneNode(!1):d(t)}async function se(e,t){if(e.currentSrc){let t=document.createElement(`canvas`),n=t.getContext(`2d`);return t.width=e.clientWidth,t.height=e.clientHeight,n?.drawImage(e,0,0,t.width,t.height),d(t.toDataURL())}let n=e.poster;return d(await E(n,b(n),t))}async function ce(e,t){try{if(e?.contentDocument?.body)return await I(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function D(e,t){return p(e,HTMLCanvasElement)?oe(e):p(e,HTMLVideoElement)?se(e,t):p(e,HTMLIFrameElement)?ce(e,t):e.cloneNode(k(e))}var O=e=>e.tagName!=null&&e.tagName.toUpperCase()===`SLOT`,k=e=>e.tagName!=null&&e.tagName.toUpperCase()===`SVG`;async function A(e,t,r){if(k(t))return t;let i=[];return i=O(e)&&e.assignedNodes?n(e.assignedNodes()):p(e,HTMLIFrameElement)&&e.contentDocument?.body?n(e.contentDocument.body.childNodes):n((e.shadowRoot??e).childNodes),i.length===0||p(e,HTMLVideoElement)||await i.reduce((e,n)=>e.then(()=>I(n,r)).then(e=>{e&&t.appendChild(e)}),Promise.resolve()),t}function j(e,t,n){let r=t.style;if(!r)return;let a=window.getComputedStyle(e);a.cssText?(r.cssText=a.cssText,r.transformOrigin=a.transformOrigin):i(n).forEach(n=>{let i=a.getPropertyValue(n);n===`font-size`&&i.endsWith(`px`)&&(i=`${Math.floor(parseFloat(i.substring(0,i.length-2)))-.1}px`),p(e,HTMLIFrameElement)&&n===`display`&&i===`inline`&&(i=`block`),n===`d`&&t.getAttribute(`d`)&&(i=`path(${t.getAttribute(`d`)})`),r.setProperty(n,i,a.getPropertyPriority(n))})}function M(e,t){p(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),p(e,HTMLInputElement)&&t.setAttribute(`value`,e.value)}function N(e,t){if(p(e,HTMLSelectElement)){let n=t,r=Array.from(n.children).find(t=>e.value===t.getAttribute(`value`));r&&r.setAttribute(`selected`,``)}}function P(e,t,n){return p(t,Element)&&(j(e,t,n),ie(e,t,n),M(e,t),N(e,t)),t}async function F(e,t){let n=e.querySelectorAll?e.querySelectorAll(`use`):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let a=n[i].getAttribute(`xlink:href`);if(a){let n=e.querySelector(a),i=document.querySelector(a);!n&&i&&!r[a]&&(r[a]=await I(i,t,!0))}}let i=Object.values(r);if(i.length){let t=`http://www.w3.org/1999/xhtml`,n=document.createElementNS(t,`svg`);n.setAttribute(`xmlns`,t),n.style.position=`absolute`,n.style.width=`0`,n.style.height=`0`,n.style.overflow=`hidden`,n.style.display=`none`;let r=document.createElementNS(t,`defs`);n.appendChild(r);for(let e=0;e<i.length;e++)r.appendChild(i[e]);e.appendChild(n)}return e}async function I(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(e=>D(e,t)).then(n=>A(e,n,t)).then(n=>P(e,n,t)).then(e=>F(e,t))}var L=/url\((['"]?)([^'"]+?)\1\)/g,R=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,z=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function B(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,`\\$1`);return RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,`g`)}function V(e){let t=[];return e.replace(L,(e,n,r)=>(t.push(r),e)),t.filter(e=>!S(e))}async function H(t,n,r,i,a){try{let o=r?e(n,r):n,s=b(n),c;return c=a?C(await a(o),s):await E(o,s,i),t.replace(B(n),`$1${c}$3`)}catch{}return t}function U(e,{preferredFontFormat:t}){return t?e.replace(z,e=>{for(;;){let[n,,r]=R.exec(e)||[];if(!r)return``;if(r===t)return`src: ${n};`}}):e}function W(e){return e.search(L)!==-1}async function G(e,t,n){if(!W(e))return e;let r=U(e,n);return V(r).reduce((e,r)=>e.then(e=>H(e,r,t,n)),Promise.resolve(r))}async function K(e,t,n){let r=t.style?.getPropertyValue(e);if(r){let i=await G(r,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function le(e,t){await K(`background`,e,t)||await K(`background-image`,e,t),await K(`mask`,e,t)||await K(`-webkit-mask`,e,t)||await K(`mask-image`,e,t)||await K(`-webkit-mask-image`,e,t)}async function ue(e,t){let n=p(e,HTMLImageElement);if(!(n&&!S(e.src))&&!(p(e,SVGImageElement)&&!S(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,i=await E(r,b(r),t);await new Promise((r,a)=>{e.onload=r,e.onerror=t.onImageErrorHandler?(...e)=>{try{r(t.onImageErrorHandler(...e))}catch(e){a(e)}}:a;let o=e;o.decode&&=r,o.loading===`lazy`&&(o.loading=`eager`),n?(e.srcset=``,e.src=i):e.href.baseVal=i})}async function de(e,t){let r=n(e.childNodes).map(e=>q(e,t));await Promise.all(r).then(()=>e)}async function q(e,t){p(e,Element)&&(await le(e,t),await ue(e,t),await de(e,t))}function fe(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(e=>{n[e]=r[e]}),e}var J={};async function Y(e){let t=J[e];return t??(t={url:e,cssText:await(await fetch(e)).text()},J[e]=t,t)}async function X(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async i=>{let a=i.replace(r,`$1`);return a.startsWith(`https://`)||(a=new URL(a,e.url).href),w(a,t.fetchRequestInit,({result:e})=>(n=n.replace(i,`url(${e})`),[i,e]))});return Promise.all(i).then(()=>n)}function Z(e){if(e==null)return[];let t=[],n=e.replace(/(\/\*[\s\S]*?\*\/)/gi,``),r=RegExp(`((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})`,`gi`);for(;;){let e=r.exec(n);if(e===null)break;t.push(e[0])}n=n.replace(r,``);let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a=RegExp(`((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})`,`gi`);for(;;){let e=i.exec(n);if(e===null){if(e=a.exec(n),e===null)break;i.lastIndex=a.lastIndex}else a.lastIndex=i.lastIndex;t.push(e[0])}return t}async function pe(e,t){let r=[],i=[];return e.forEach(r=>{if(`cssRules`in r)try{n(r.cssRules||[]).forEach((e,n)=>{if(e.type===CSSRule.IMPORT_RULE){let a=n+1,o=e.href,s=Y(o).then(e=>X(e,t)).then(e=>Z(e).forEach(e=>{try{r.insertRule(e,e.startsWith(`@import`)?a+=1:r.cssRules.length)}catch(t){console.error(`Error inserting rule from remote css`,{rule:e,error:t})}})).catch(e=>{console.error(`Error loading remote css`,e.toString())});i.push(s)}})}catch(n){let a=e.find(e=>e.href==null)||document.styleSheets[0];r.href!=null&&i.push(Y(r.href).then(e=>X(e,t)).then(e=>Z(e).forEach(e=>{a.insertRule(e,a.cssRules.length)})).catch(e=>{console.error(`Error loading remote stylesheet`,e)})),console.error(`Error inlining remote css file`,n)}}),Promise.all(i).then(()=>(e.forEach(e=>{if(`cssRules`in e)try{n(e.cssRules||[]).forEach(e=>{r.push(e)})}catch(t){console.error(`Error while reading CSS rules from ${e.href}`,t)}}),r))}function me(e){return e.filter(e=>e.type===CSSRule.FONT_FACE_RULE).filter(e=>W(e.style.getPropertyValue(`src`)))}async function he(e,t){if(e.ownerDocument==null)throw Error(`Provided element is not within a Document`);return me(await pe(n(e.ownerDocument.styleSheets),t))}function Q(e){return e.trim().replace(/["']/g,``)}function ge(e){let t=new Set;function n(e){(e.style.fontFamily||getComputedStyle(e).fontFamily).split(`,`).forEach(e=>{t.add(Q(e))}),Array.from(e.children).forEach(e=>{e instanceof HTMLElement&&n(e)})}return n(e),t}async function $(e,t){let n=await he(e,t),r=ge(e);return(await Promise.all(n.filter(e=>r.has(Q(e.style.fontFamily))).map(e=>{let n=e.parentStyleSheet?e.parentStyleSheet.href:null;return G(e.cssText,n,t)}))).join(`
`)}async function _e(e,t){let n=t.fontEmbedCSS==null?t.skipFonts?null:await $(e,t):t.fontEmbedCSS;if(n){let t=document.createElement(`style`),r=document.createTextNode(n);t.appendChild(r),e.firstChild?e.insertBefore(t,e.firstChild):e.appendChild(t)}}async function ve(e,t={}){let{width:n,height:r}=c(e,t),i=await I(e,t,!0);return await _e(i,t),await q(i,t),fe(i,t),await te(i,n,r)}async function ye(e,t={}){let{width:n,height:r}=c(e,t),i=await d(await ve(e,t)),a=document.createElement(`canvas`),o=a.getContext(`2d`),s=t.pixelRatio||l(),u=t.canvasWidth||n,f=t.canvasHeight||r;return a.width=u*s,a.height=f*s,t.skipAutoScale||ee(a),a.style.width=`${u}`,a.style.height=`${f}`,t.backgroundColor&&(o.fillStyle=t.backgroundColor,o.fillRect(0,0,a.width,a.height)),o.drawImage(i,0,0,a.width,a.height),a}async function be(e,t={}){return(await ye(e,t)).toDataURL()}export{be as toPng};
```

```css
// File: dist\assets\index-Dk8xVSF8.css
:root{--bg-primary:#000;--bg-secondary:#050505;--bg-panel:#0b0b0b;--bg-command:#111;--bg-input:#0a0a0a;--bg-hover:#1a1a1a;--bg-active:#222;--border-primary:#1f1f1f;--border-secondary:#2a2a2a;--border-grid:#1e1e1e;--border-grid-major:#2a2a2a;--border-active:var(--accent-orange);--text-primary:#e0e0e0;--text-secondary:#909090;--text-muted:#606060;--text-label:#707070;--accent-orange:#f90;--accent-orange-dim:#ff99004d;--quadrant-leading:#0d5c2a;--quadrant-weakening:#8a7a00;--quadrant-lagging:#5a120f;--quadrant-improving:#0b3d5a;--quadrant-leading-text:#2ecc71;--quadrant-weakening-text:#f1c40f;--quadrant-lagging-text:#e74c3c;--quadrant-improving-text:#3498db;--axis-center:#707070;--space-xs:2px;--space-sm:4px;--space-md:8px;--space-lg:12px;--space-xl:16px;--space-2xl:24px;--font-mono:"IBM Plex Mono", "JetBrains Mono", "Roboto Mono", monospace;--font-size-xs:9px;--font-size-sm:10px;--font-size-base:11px;--font-size-md:12px;--font-size-lg:14px;--font-size-xl:16px;--command-bar-height:42px;--status-bar-height:24px;--watchlist-width:260px;--radius-none:0px;--radius-sm:2px}*,:before,:after{box-sizing:border-box}body{background-color:var(--bg-primary);color:var(--text-primary);font-family:var(--font-mono);font-size:var(--font-size-base);margin:0}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:var(--bg-primary)}::-webkit-scrollbar-thumb{background:var(--border-secondary);border-radius:var(--radius-sm)}::-webkit-scrollbar-thumb:hover{background:var(--text-muted)}::selection{background:var(--accent-orange-dim);color:var(--text-primary)}input,select,button{font-family:inherit;font-size:inherit;color:inherit;background:0 0;border:none;outline:none}.text-leading{color:var(--quadrant-leading-text)}.text-weakening{color:var(--quadrant-weakening-text)}.text-lagging{color:var(--quadrant-lagging-text)}.text-improving{color:var(--quadrant-improving-text)}.text-truncate{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.settings-overlay{z-index:999;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);background:#000000bf;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.settings-modal{background:#0a0a0a;border:1px solid #2a2a2a;flex-direction:column;width:600px;max-height:85vh;font-family:IBM Plex Mono,monospace;display:flex;overflow:hidden;box-shadow:0 24px 64px #000c}.settings-modal__header{background:#111;border-bottom:1px solid #1f1f1f;flex-shrink:0;justify-content:space-between;align-items:center;padding:12px 16px;display:flex}.settings-modal__title{letter-spacing:3px;color:#f90;text-transform:uppercase;font-size:11px;font-weight:600}.settings-modal__close{color:#909090;cursor:pointer;background:0 0;border:none;padding:0 4px;font-size:18px;line-height:1;transition:color .15s}.settings-modal__close:hover{color:#e0e0e0}.settings-modal__body{scrollbar-width:thin;scrollbar-color:#333 transparent;flex:1;overflow-y:auto}.settings-section{border-bottom:1px solid #1a1a1a;padding:12px 16px}.settings-section__title{letter-spacing:3px;color:#f90;text-transform:uppercase;border-bottom:1px solid #1f1f1f;margin-bottom:12px;padding-bottom:6px;font-size:9px;font-weight:600}.settings-row{justify-content:space-between;align-items:center;gap:12px;padding:5px 0;display:flex}.settings-row__label{color:#909090;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;flex:1;font-size:10px}.settings-row__control{align-items:center;gap:4px;display:flex}.settings-btn{color:#707070;cursor:pointer;letter-spacing:.5px;text-transform:uppercase;background:#111;border:1px solid #2a2a2a;padding:3px 8px;font-family:IBM Plex Mono,monospace;font-size:10px;transition:all .15s}.settings-btn:hover{color:#e0e0e0;border-color:#f90}.settings-btn--active{color:#f90;background:#ff99001f;border-color:#f90}.settings-slider{appearance:none;cursor:pointer;background:#2a2a2a;border-radius:0;outline:none;width:140px;height:3px}.settings-slider::-webkit-slider-thumb{-webkit-appearance:none;cursor:pointer;background:#f90;border-radius:0;width:12px;height:12px}.settings-input{color:#e0e0e0;text-align:right;background:#0a0a0a;border:1px solid #2a2a2a;width:56px;padding:3px 6px;font-family:IBM Plex Mono,monospace;font-size:10px}.settings-input:focus{border-color:#f90;outline:none}.settings-select{color:#e0e0e0;background:#0a0a0a;border:1px solid #2a2a2a;padding:3px 6px;font-family:IBM Plex Mono,monospace;font-size:10px}.settings-select:focus{border-color:#f90;outline:none}.settings-modal__footer{background:#111;border-top:1px solid #1f1f1f;flex-shrink:0;justify-content:flex-end;gap:8px;padding:10px 16px;display:flex}.settings-footer-btn{color:#909090;cursor:pointer;text-transform:uppercase;letter-spacing:1px;background:#111;border:1px solid #2a2a2a;padding:5px 14px;font-family:IBM Plex Mono,monospace;font-size:10px;transition:all .15s}.settings-footer-btn:hover{color:#f90;border-color:#f90}.settings-footer-btn--primary{color:#f90;background:#ff990026;border-color:#f90}.settings-toggle{cursor:pointer;flex-shrink:0;width:36px;height:18px;display:inline-block;position:relative}.settings-toggle input{display:none}.settings-toggle__track{background:#1f1f1f;border:1px solid #333;transition:all .2s;position:absolute;inset:0}.settings-toggle input:checked+.settings-toggle__track{background:#f903;border-color:#f90}.settings-toggle__thumb{pointer-events:none;background:#555;width:10px;height:10px;transition:all .2s;position:absolute;top:3px;left:3px}.settings-toggle input:checked+.settings-toggle__track+.settings-toggle__thumb{background:#f90;transform:translate(18px)}.settings-sector-header{justify-content:space-between;align-items:center;margin-bottom:8px;display:flex}.settings-sector-count{color:#707070;letter-spacing:1px;font-size:9px}.settings-sector-actions{gap:4px;display:flex}.settings-sector-grid{scrollbar-width:thin;scrollbar-color:#333 transparent;grid-template-columns:repeat(3,1fr);gap:3px;max-height:150px;display:grid;overflow-y:auto}.settings-sector-btn{color:#707070;cursor:pointer;text-align:left;white-space:nowrap;text-overflow:ellipsis;letter-spacing:.3px;background:#111;border:1px solid #222;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;transition:all .1s;overflow:hidden}.settings-sector-btn:hover{color:#e0e0e0;border-color:#555}.settings-sector-btn--active{color:#f90;background:#ff990014;border-color:#ff990080}.settings-value-display{color:#f90;text-align:right;width:36px;font-size:9px;font-weight:600}.command-bar{height:var(--command-bar-height,42px);background-color:var(--bg-command,#1e1e1e);border-bottom:1px solid var(--border-primary,#333);font-family:var(--font-mono,"IBM Plex Mono", monospace);font-size:var(--font-size-sm,12px);color:var(--text-primary,#eee);box-sizing:border-box;align-items:center;gap:8px;padding:0 12px;display:flex}.command-bar__benchmark{background-color:var(--bg-input,#000);color:var(--text-primary,#eee);border:1px solid var(--border-secondary,#444);font-family:inherit;font-size:inherit;border-radius:var(--radius-none,0);cursor:pointer;text-transform:uppercase;outline:none;padding:2px 8px}.command-bar__benchmark:focus{border-color:var(--accent-orange,#ff6b00)}.command-bar__group{border:1px solid var(--border-secondary,#444);align-items:center;display:flex}.command-bar__segment-btn{background-color:var(--bg-panel,#2a2a2a);color:var(--text-secondary,#aaa);border:none;border-right:1px solid var(--border-secondary,#444);font-family:inherit;font-size:inherit;cursor:pointer;border-radius:var(--radius-none,0);border-bottom:2px solid #0000;outline:none;padding:4px 10px}.command-bar__segment-btn:last-child{border-right:none}.command-bar__segment-btn:hover{background-color:var(--bg-hover,#333);color:var(--text-primary,#eee)}.command-bar__segment-btn--active{color:var(--text-primary,#eee);border-bottom:2px solid var(--accent-orange,#ff6b00);background-color:var(--bg-active,#222)}.command-bar__toggle{color:var(--text-secondary,#aaa);font-family:inherit;font-size:inherit;cursor:pointer;border-radius:var(--radius-none,0);background:0 0;border:none;align-items:center;padding:4px 8px;display:flex}.command-bar__toggle:hover{color:var(--text-primary,#eee)}.command-bar__toggle--active{color:var(--accent-orange,#ff6b00)}.command-bar__playback{align-items:center;gap:2px;margin-left:8px;display:flex}.command-bar__playback-btn{border:1px solid var(--border-secondary,#444);color:var(--text-primary,#eee);cursor:pointer;border-radius:var(--radius-none,0);background:0 0;justify-content:center;align-items:center;padding:2px 6px;font-size:14px;display:flex}.command-bar__playback-btn:hover{border-color:var(--accent-orange,#ff6b00);color:var(--accent-orange,#ff6b00)}.command-bar__export-btn{color:var(--text-secondary,#aaa);border:1px solid var(--border-secondary,#444);font-family:inherit;font-size:inherit;cursor:pointer;border-radius:var(--radius-none,0);background-color:#0000;margin-left:8px;padding:2px 12px}.command-bar__export-btn:hover{color:var(--text-primary,#eee);border-color:var(--text-secondary,#aaa)}.command-bar__spacer{flex:1}.command-bar__clock{color:var(--text-muted,#777);font-size:var(--font-size-xs,10px)}.command-bar__settings-btn{color:#f90;cursor:pointer;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;background:0 0;border:1px solid #2a2a2a;padding:4px 10px;font-family:IBM Plex Mono,monospace;font-size:10px;transition:all .15s}.command-bar__settings-btn:hover{background:#ff99001a;border-color:#f90}.watchlist-modal-overlay{-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);z-index:1000;background:#000000b3;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.watchlist-modal{background:var(--bg-panel);border:1px solid var(--border-primary);flex-direction:column;width:400px;max-width:90vw;max-height:80vh;display:flex;box-shadow:0 10px 30px #000c}.watchlist-modal__header{padding:var(--space-md) var(--space-xl);border-bottom:1px solid var(--border-primary);background:var(--bg-command);justify-content:space-between;align-items:center;display:flex}.watchlist-modal__title{font-family:var(--font-mono);font-size:var(--font-size-md);color:var(--text-primary);font-weight:600}.watchlist-modal__close{color:var(--text-muted);cursor:pointer;background:0 0;border:none;padding:0;font-size:20px;line-height:1}.watchlist-modal__close:hover{color:var(--text-primary)}.watchlist-modal__search-container{padding:var(--space-md) var(--space-xl);border-bottom:1px solid var(--border-primary)}.watchlist-modal__search{background:var(--bg-input);border:1px solid var(--border-primary);width:100%;color:var(--text-primary);font-family:var(--font-mono);font-size:var(--font-size-base);padding:var(--space-sm) var(--space-md);box-sizing:border-box;outline:none}.watchlist-modal__search:focus{border-color:var(--accent-orange)}.watchlist-modal__actions{gap:var(--space-sm);padding:var(--space-sm) var(--space-xl);border-bottom:1px solid var(--border-primary);display:flex}.watchlist-modal__btn{background:var(--bg-hover);border:1px solid var(--border-primary);color:var(--text-secondary);font-family:var(--font-mono);font-size:var(--font-size-xs);cursor:pointer;padding:4px 8px}.watchlist-modal__btn:hover{background:var(--bg-active);color:var(--text-primary)}.watchlist-modal__btn--primary{background:var(--accent-orange-dim);border-color:var(--accent-orange);color:var(--accent-orange);width:100%;font-size:var(--font-size-base);padding:8px}.watchlist-modal__btn--primary:hover{background:var(--accent-orange);color:var(--bg-primary)}.watchlist-modal__list{padding:var(--space-md) var(--space-xl);flex:1;overflow-y:auto}.watchlist-modal__list::-webkit-scrollbar{width:6px}.watchlist-modal__list::-webkit-scrollbar-thumb{background:var(--border-primary)}.watchlist-modal__list::-webkit-scrollbar-track{background:0 0}.watchlist-modal__row{cursor:pointer;align-items:center;padding:6px 0;display:flex}.watchlist-modal__row:hover{background:var(--bg-hover)}.watchlist-modal__checkbox{margin-right:var(--space-md);accent-color:var(--accent-orange)}.watchlist-modal__name{font-family:var(--font-mono);font-size:var(--font-size-base);color:var(--text-primary)}.watchlist-modal__empty{color:var(--text-muted);font-family:var(--font-mono);font-size:var(--font-size-base);text-align:center;padding:var(--space-xl) 0}.watchlist-modal__footer{padding:var(--space-md) var(--space-xl);border-top:1px solid var(--border-primary);background:var(--bg-command)}.watchlist{width:var(--watchlist-width,240px);background-color:var(--bg-panel,#121212);border-right:1px solid var(--border-primary,#333);height:100%;font-family:var(--font-mono,"IBM Plex Mono", monospace);font-size:var(--font-size-sm,12px);color:var(--text-primary,#eee);box-sizing:border-box;flex-direction:column;display:flex}.watchlist__search-container{padding:8px}.watchlist__search{background-color:var(--bg-input,#000);border:1px solid var(--border-secondary,#444);width:100%;color:var(--text-primary,#eee);font-family:inherit;font-size:inherit;box-sizing:border-box;border-radius:var(--radius-none,0);outline:none;padding:4px 8px}.watchlist__search:focus{border-color:var(--accent-orange,#ff6b00)}.watchlist__divider{background-color:var(--border-secondary,#444);height:1px;margin-bottom:4px}.watchlist__header{color:var(--text-muted,#777);font-size:var(--font-size-xs,10px);letter-spacing:1px;text-transform:uppercase;padding:4px 8px}.watchlist__list{flex-direction:column;flex:1;display:flex;overflow-y:auto}.watchlist__list::-webkit-scrollbar{width:6px}.watchlist__list::-webkit-scrollbar-track{background:var(--bg-panel,#121212)}.watchlist__list::-webkit-scrollbar-thumb{background:var(--border-secondary,#444)}.watchlist__row{cursor:pointer;-webkit-user-select:none;user-select:none;border-left:2px solid #0000;align-items:center;padding:4px 8px;display:flex}.watchlist__row--hovered{background-color:var(--bg-hover,#1e1e1e)}.watchlist__row--selected{background-color:var(--bg-active,#222);border-left-color:var(--accent-orange,#ff6b00)}.watchlist__indicator{flex-shrink:0;width:8px;height:8px;margin-right:8px}.watchlist__name{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.watchlist__section{margin-bottom:12px}.watchlist__section-header{letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--border-primary,#333);margin-top:4px;margin-bottom:2px;padding:4px 8px;font-size:10px;font-weight:600}.status-bar{height:var(--status-bar-height,24px);background-color:var(--bg-secondary,#1a1a1a);border-top:1px solid var(--border-primary,#333);font-family:var(--font-mono,"IBM Plex Mono", monospace);font-size:var(--font-size-xs,10px);color:var(--text-secondary,#aaa);box-sizing:border-box;justify-content:space-between;align-items:center;padding:0 12px;display:flex}.status-bar__left,.status-bar__center,.status-bar__right{align-items:center;gap:12px;display:flex}.status-bar__center{flex:1;justify-content:center}.status-bar__dot{background-color:var(--text-muted,#555);border-radius:50%;width:8px;height:8px}.status-bar__dot--connected{background-color:#0f0}.status-bar__dot--disconnected{background-color:red}.status-bar__dot--reconnecting{background-color:#ff0}.status-bar__connection{font-weight:700}.status-bar__live{color:#0f0;align-items:center;gap:4px;font-weight:700;display:flex}.status-bar__live-dot{background-color:#0f0;border-radius:50%;width:6px;height:6px;animation:1s infinite blink}@keyframes blink{0%,to{opacity:1}50%{opacity:0}}.status-bar__info{white-space:nowrap}.status-bar__breadth{border-left:1px solid var(--border-secondary,#444);gap:8px;padding-left:12px;font-weight:700;display:flex}.metrics{background-color:var(--bg-panel,#121212);border-top:1px solid var(--border-primary,#333);background:var(--bg-panel);height:240px;padding:12px;padding:var(--space-md) var(--space-xl);border-top:1px solid var(--border-primary);font-family:var(--font-mono,"IBM Plex Mono", monospace);font-size:var(--font-size-sm,12px);color:var(--text-primary,#eee);box-sizing:border-box;flex-direction:column;display:flex}.metrics__empty{color:var(--text-muted,#777);justify-content:center;align-items:center;height:100%;display:flex}.metrics__header{color:var(--text-primary,#eee);font-weight:700}.metrics__divider{color:var(--border-secondary,#444);white-space:nowrap;margin-bottom:8px;overflow:hidden}.metrics__row{justify-content:space-between;margin-bottom:4px;display:flex}.metrics__label{color:var(--text-secondary,#aaa)}.metrics__value{color:var(--text-primary,#eee);text-align:right}.ranking{background-color:var(--bg-primary,#0a0a0a);height:100%;font-family:var(--font-mono,"IBM Plex Mono", monospace);font-size:var(--font-size-sm,12px);color:var(--text-primary,#eee);box-sizing:border-box;flex-direction:column;display:flex;overflow:hidden}.ranking__header{background-color:var(--bg-panel,#121212);border-bottom:1px solid var(--border-secondary,#444);color:var(--text-secondary,#aaa);-webkit-user-select:none;user-select:none;padding:4px 8px;font-weight:700;display:flex}.ranking__row{cursor:pointer;border-bottom:1px solid var(--border-primary,#1e1e1e);padding:4px 8px;display:flex}.ranking__row:nth-child(2n){background-color:var(--bg-panel,#121212)}.ranking__row:hover{background-color:var(--bg-hover,#1e1e1e)}.ranking__row--selected{color:var(--accent-orange,#ff6b00);background-color:var(--bg-active,#222)!important}.ranking__col{white-space:nowrap;text-overflow:ellipsis;cursor:pointer;flex-shrink:0;overflow:hidden}.ranking__col--num{text-align:right;width:50px;padding-right:8px}.ranking__col--sector{flex:1;min-width:100px;padding-right:8px}.ranking__body{flex:1;overflow-y:auto}.ranking__body::-webkit-scrollbar{width:6px}.ranking__body::-webkit-scrollbar-track{background:var(--bg-primary,#0a0a0a)}.ranking__body::-webkit-scrollbar-thumb{background:var(--border-secondary,#444)}.app{grid-template-rows:var(--command-bar-height) 1fr var(--status-bar-height);background:var(--bg-primary);grid-template-columns:320px 1fr 260px;grid-template-areas:"command command command""left chart watchlist""status status status";width:100vw;height:100vh;display:grid;overflow:hidden}.app__command{grid-area:command}.app__left{border-right:1px solid var(--border-primary);flex-direction:column;grid-area:left;display:flex;overflow:hidden}.app__watchlist{border-left:1px solid var(--border-primary);flex-direction:column;grid-area:watchlist;display:flex;overflow:hidden}.app__chart{grid-area:chart;position:relative;overflow:hidden}.app__status{grid-area:status}@media (width<=900px){.app{grid-template-columns:1fr;grid-template-areas:"command""chart""status"}.app__left,.app__watchlist{display:none}}
```

```javascript
// File: dist\assets\index-GnJ0tZ3o.js
var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},c=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},l=(n,r,a)=>(a=n==null?{}:e(i(n)),c(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n));(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var u=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.portal`),r=Symbol.for(`react.fragment`),i=Symbol.for(`react.strict_mode`),a=Symbol.for(`react.profiler`),o=Symbol.for(`react.consumer`),s=Symbol.for(`react.context`),c=Symbol.for(`react.forward_ref`),l=Symbol.for(`react.suspense`),u=Symbol.for(`react.memo`),d=Symbol.for(`react.lazy`),f=Symbol.for(`react.activity`),p=Symbol.iterator;function m(e){return typeof e!=`object`||!e?null:(e=p&&e[p]||e[`@@iterator`],typeof e==`function`?e:null)}var h={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},g=Object.assign,_={};function v(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}v.prototype.isReactComponent={},v.prototype.setState=function(e,t){if(typeof e!=`object`&&typeof e!=`function`&&e!=null)throw Error(`takes an object of state variables to update or a function which returns an object of state variables.`);this.updater.enqueueSetState(this,e,t,`setState`)},v.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,`forceUpdate`)};function y(){}y.prototype=v.prototype;function b(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}var x=b.prototype=new y;x.constructor=b,g(x,v.prototype),x.isPureReactComponent=!0;var S=Array.isArray;function C(){}var w={H:null,A:null,T:null,S:null},ee=Object.prototype.hasOwnProperty;function T(e,n,r){var i=r.ref;return{$$typeof:t,type:e,key:n,ref:i===void 0?null:i,props:r}}function te(e,t){return T(e.type,t,e.props)}function E(e){return typeof e==`object`&&!!e&&e.$$typeof===t}function ne(e){var t={"=":`=0`,":":`=2`};return`$`+e.replace(/[=:]/g,function(e){return t[e]})}var re=/\/+/g;function ie(e,t){return typeof e==`object`&&e&&e.key!=null?ne(``+e.key):t.toString(36)}function ae(e){switch(e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason;default:switch(typeof e.status==`string`?e.then(C,C):(e.status=`pending`,e.then(function(t){e.status===`pending`&&(e.status=`fulfilled`,e.value=t)},function(t){e.status===`pending`&&(e.status=`rejected`,e.reason=t)})),e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason}}throw e}function oe(e,r,i,a,o){var s=typeof e;(s===`undefined`||s===`boolean`)&&(e=null);var c=!1;if(e===null)c=!0;else switch(s){case`bigint`:case`string`:case`number`:c=!0;break;case`object`:switch(e.$$typeof){case t:case n:c=!0;break;case d:return c=e._init,oe(c(e._payload),r,i,a,o)}}if(c)return o=o(e),c=a===``?`.`+ie(e,0):a,S(o)?(i=``,c!=null&&(i=c.replace(re,`$&/`)+`/`),oe(o,r,i,``,function(e){return e})):o!=null&&(E(o)&&(o=te(o,i+(o.key==null||e&&e.key===o.key?``:(``+o.key).replace(re,`$&/`)+`/`)+c)),r.push(o)),1;c=0;var l=a===``?`.`:a+`:`;if(S(e))for(var u=0;u<e.length;u++)a=e[u],s=l+ie(a,u),c+=oe(a,r,i,s,o);else if(u=m(e),typeof u==`function`)for(e=u.call(e),u=0;!(a=e.next()).done;)a=a.value,s=l+ie(a,u++),c+=oe(a,r,i,s,o);else if(s===`object`){if(typeof e.then==`function`)return oe(ae(e),r,i,a,o);throw r=String(e),Error(`Objects are not valid as a React child (found: `+(r===`[object Object]`?`object with keys {`+Object.keys(e).join(`, `)+`}`:r)+`). If you meant to render a collection of children, use an array instead.`)}return c}function se(e,t,n){if(e==null)return e;var r=[],i=0;return oe(e,r,``,``,function(e){return t.call(n,e,i++)}),r}function ce(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(t){(e._status===0||e._status===-1)&&(e._status=1,e._result=t)},function(t){(e._status===0||e._status===-1)&&(e._status=2,e._result=t)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var D=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},O={map:se,forEach:function(e,t,n){se(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return se(e,function(){t++}),t},toArray:function(e){return se(e,function(e){return e})||[]},only:function(e){if(!E(e))throw Error(`React.Children.only expected to receive a single React element child.`);return e}};e.Activity=f,e.Children=O,e.Component=v,e.Fragment=r,e.Profiler=a,e.PureComponent=b,e.StrictMode=i,e.Suspense=l,e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=w,e.__COMPILER_RUNTIME={__proto__:null,c:function(e){return w.H.useMemoCache(e)}},e.cache=function(e){return function(){return e.apply(null,arguments)}},e.cacheSignal=function(){return null},e.cloneElement=function(e,t,n){if(e==null)throw Error(`The argument must be a React element, but you passed `+e+`.`);var r=g({},e.props),i=e.key;if(t!=null)for(a in t.key!==void 0&&(i=``+t.key),t)!ee.call(t,a)||a===`key`||a===`__self`||a===`__source`||a===`ref`&&t.ref===void 0||(r[a]=t[a]);var a=arguments.length-2;if(a===1)r.children=n;else if(1<a){for(var o=Array(a),s=0;s<a;s++)o[s]=arguments[s+2];r.children=o}return T(e.type,i,r)},e.createContext=function(e){return e={$$typeof:s,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:o,_context:e},e},e.createElement=function(e,t,n){var r,i={},a=null;if(t!=null)for(r in t.key!==void 0&&(a=``+t.key),t)ee.call(t,r)&&r!==`key`&&r!==`__self`&&r!==`__source`&&(i[r]=t[r]);var o=arguments.length-2;if(o===1)i.children=n;else if(1<o){for(var s=Array(o),c=0;c<o;c++)s[c]=arguments[c+2];i.children=s}if(e&&e.defaultProps)for(r in o=e.defaultProps,o)i[r]===void 0&&(i[r]=o[r]);return T(e,a,i)},e.createRef=function(){return{current:null}},e.forwardRef=function(e){return{$$typeof:c,render:e}},e.isValidElement=E,e.lazy=function(e){return{$$typeof:d,_payload:{_status:-1,_result:e},_init:ce}},e.memo=function(e,t){return{$$typeof:u,type:e,compare:t===void 0?null:t}},e.startTransition=function(e){var t=w.T,n={};w.T=n;try{var r=e(),i=w.S;i!==null&&i(n,r),typeof r==`object`&&r&&typeof r.then==`function`&&r.then(C,D)}catch(e){D(e)}finally{t!==null&&n.types!==null&&(t.types=n.types),w.T=t}},e.unstable_useCacheRefresh=function(){return w.H.useCacheRefresh()},e.use=function(e){return w.H.use(e)},e.useActionState=function(e,t,n){return w.H.useActionState(e,t,n)},e.useCallback=function(e,t){return w.H.useCallback(e,t)},e.useContext=function(e){return w.H.useContext(e)},e.useDebugValue=function(){},e.useDeferredValue=function(e,t){return w.H.useDeferredValue(e,t)},e.useEffect=function(e,t){return w.H.useEffect(e,t)},e.useEffectEvent=function(e){return w.H.useEffectEvent(e)},e.useId=function(){return w.H.useId()},e.useImperativeHandle=function(e,t,n){return w.H.useImperativeHandle(e,t,n)},e.useInsertionEffect=function(e,t){return w.H.useInsertionEffect(e,t)},e.useLayoutEffect=function(e,t){return w.H.useLayoutEffect(e,t)},e.useMemo=function(e,t){return w.H.useMemo(e,t)},e.useOptimistic=function(e,t){return w.H.useOptimistic(e,t)},e.useReducer=function(e,t,n){return w.H.useReducer(e,t,n)},e.useRef=function(e){return w.H.useRef(e)},e.useState=function(e){return w.H.useState(e)},e.useSyncExternalStore=function(e,t,n){return w.H.useSyncExternalStore(e,t,n)},e.useTransition=function(){return w.H.useTransition()},e.version=`19.2.6`})),d=o(((e,t)=>{t.exports=u()})),f=o((e=>{function t(e,t){var n=e.length;e.push(t);a:for(;0<n;){var r=n-1>>>1,a=e[r];if(0<i(a,t))e[r]=t,e[n]=a,n=r;else break a}}function n(e){return e.length===0?null:e[0]}function r(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;a:for(var r=0,a=e.length,o=a>>>1;r<o;){var s=2*(r+1)-1,c=e[s],l=s+1,u=e[l];if(0>i(c,n))l<a&&0>i(u,c)?(e[r]=u,e[l]=n,r=l):(e[r]=c,e[s]=n,r=s);else if(l<a&&0>i(u,n))e[r]=u,e[l]=n,r=l;else break a}}return t}function i(e,t){var n=e.sortIndex-t.sortIndex;return n===0?e.id-t.id:n}if(e.unstable_now=void 0,typeof performance==`object`&&typeof performance.now==`function`){var a=performance;e.unstable_now=function(){return a.now()}}else{var o=Date,s=o.now();e.unstable_now=function(){return o.now()-s}}var c=[],l=[],u=1,d=null,f=3,p=!1,m=!1,h=!1,g=!1,_=typeof setTimeout==`function`?setTimeout:null,v=typeof clearTimeout==`function`?clearTimeout:null,y=typeof setImmediate<`u`?setImmediate:null;function b(e){for(var i=n(l);i!==null;){if(i.callback===null)r(l);else if(i.startTime<=e)r(l),i.sortIndex=i.expirationTime,t(c,i);else break;i=n(l)}}function x(e){if(h=!1,b(e),!m)if(n(c)!==null)m=!0,S||(S=!0,E());else{var t=n(l);t!==null&&ie(x,t.startTime-e)}}var S=!1,C=-1,w=5,ee=-1;function T(){return g?!0:!(e.unstable_now()-ee<w)}function te(){if(g=!1,S){var t=e.unstable_now();ee=t;var i=!0;try{a:{m=!1,h&&(h=!1,v(C),C=-1),p=!0;var a=f;try{b:{for(b(t),d=n(c);d!==null&&!(d.expirationTime>t&&T());){var o=d.callback;if(typeof o==`function`){d.callback=null,f=d.priorityLevel;var s=o(d.expirationTime<=t);if(t=e.unstable_now(),typeof s==`function`){d.callback=s,b(t),i=!0;break b}d===n(c)&&r(c),b(t)}else r(c);d=n(c)}if(d!==null)i=!0;else{var u=n(l);u!==null&&ie(x,u.startTime-t),i=!1}}break a}finally{d=null,f=a,p=!1}i=void 0}}finally{i?E():S=!1}}}var E;if(typeof y==`function`)E=function(){y(te)};else if(typeof MessageChannel<`u`){var ne=new MessageChannel,re=ne.port2;ne.port1.onmessage=te,E=function(){re.postMessage(null)}}else E=function(){_(te,0)};function ie(t,n){C=_(function(){t(e.unstable_now())},n)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(e){e.callback=null},e.unstable_forceFrameRate=function(e){0>e||125<e?console.error(`forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`):w=0<e?Math.floor(1e3/e):5},e.unstable_getCurrentPriorityLevel=function(){return f},e.unstable_next=function(e){switch(f){case 1:case 2:case 3:var t=3;break;default:t=f}var n=f;f=t;try{return e()}finally{f=n}},e.unstable_requestPaint=function(){g=!0},e.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=f;f=e;try{return t()}finally{f=n}},e.unstable_scheduleCallback=function(r,i,a){var o=e.unstable_now();switch(typeof a==`object`&&a?(a=a.delay,a=typeof a==`number`&&0<a?o+a:o):a=o,r){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=a+s,r={id:u++,callback:i,priorityLevel:r,startTime:a,expirationTime:s,sortIndex:-1},a>o?(r.sortIndex=a,t(l,r),n(c)===null&&r===n(l)&&(h?(v(C),C=-1):h=!0,ie(x,a-o))):(r.sortIndex=s,t(c,r),m||p||(m=!0,S||(S=!0,E()))),r},e.unstable_shouldYield=T,e.unstable_wrapCallback=function(e){var t=f;return function(){var n=f;f=t;try{return e.apply(this,arguments)}finally{f=n}}}})),p=o(((e,t)=>{t.exports=f()})),m=o((e=>{var t=d();function n(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function r(){}var i={d:{f:r,r:function(){throw Error(n(522))},D:r,C:r,L:r,m:r,X:r,S:r,M:r},p:0,findDOMNode:null},a=Symbol.for(`react.portal`);function o(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:a,key:r==null?null:``+r,children:e,containerInfo:t,implementation:n}}var s=t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function c(e,t){if(e===`font`)return``;if(typeof t==`string`)return t===`use-credentials`?t:``}e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=i,e.createPortal=function(e,t){var r=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(n(299));return o(e,t,null,r)},e.flushSync=function(e){var t=s.T,n=i.p;try{if(s.T=null,i.p=2,e)return e()}finally{s.T=t,i.p=n,i.d.f()}},e.preconnect=function(e,t){typeof e==`string`&&(t?(t=t.crossOrigin,t=typeof t==`string`?t===`use-credentials`?t:``:void 0):t=null,i.d.C(e,t))},e.prefetchDNS=function(e){typeof e==`string`&&i.d.D(e)},e.preinit=function(e,t){if(typeof e==`string`&&t&&typeof t.as==`string`){var n=t.as,r=c(n,t.crossOrigin),a=typeof t.integrity==`string`?t.integrity:void 0,o=typeof t.fetchPriority==`string`?t.fetchPriority:void 0;n===`style`?i.d.S(e,typeof t.precedence==`string`?t.precedence:void 0,{crossOrigin:r,integrity:a,fetchPriority:o}):n===`script`&&i.d.X(e,{crossOrigin:r,integrity:a,fetchPriority:o,nonce:typeof t.nonce==`string`?t.nonce:void 0})}},e.preinitModule=function(e,t){if(typeof e==`string`)if(typeof t==`object`&&t){if(t.as==null||t.as===`script`){var n=c(t.as,t.crossOrigin);i.d.M(e,{crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0})}}else t??i.d.M(e)},e.preload=function(e,t){if(typeof e==`string`&&typeof t==`object`&&t&&typeof t.as==`string`){var n=t.as,r=c(n,t.crossOrigin);i.d.L(e,n,{crossOrigin:r,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,type:typeof t.type==`string`?t.type:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy==`string`?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet==`string`?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes==`string`?t.imageSizes:void 0,media:typeof t.media==`string`?t.media:void 0})}},e.preloadModule=function(e,t){if(typeof e==`string`)if(t){var n=c(t.as,t.crossOrigin);i.d.m(e,{as:typeof t.as==`string`&&t.as!==`script`?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0})}else i.d.m(e)},e.requestFormReset=function(e){i.d.r(e)},e.unstable_batchedUpdates=function(e,t){return e(t)},e.useFormState=function(e,t,n){return s.H.useFormState(e,t,n)},e.useFormStatus=function(){return s.H.useHostTransitionStatus()},e.version=`19.2.6`})),h=o(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=m()})),g=o((e=>{var t=p(),n=d(),r=h();function i(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function a(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function o(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function s(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function c(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function l(e){if(o(e)!==e)throw Error(i(188))}function u(e){var t=e.alternate;if(!t){if(t=o(e),t===null)throw Error(i(188));return t===e?e:null}for(var n=e,r=t;;){var a=n.return;if(a===null)break;var s=a.alternate;if(s===null){if(r=a.return,r!==null){n=r;continue}break}if(a.child===s.child){for(s=a.child;s;){if(s===n)return l(a),e;if(s===r)return l(a),t;s=s.sibling}throw Error(i(188))}if(n.return!==r.return)n=a,r=s;else{for(var c=!1,u=a.child;u;){if(u===n){c=!0,n=a,r=s;break}if(u===r){c=!0,r=a,n=s;break}u=u.sibling}if(!c){for(u=s.child;u;){if(u===n){c=!0,n=s,r=a;break}if(u===r){c=!0,r=s,n=a;break}u=u.sibling}if(!c)throw Error(i(189))}}if(n.alternate!==r)throw Error(i(190))}if(n.tag!==3)throw Error(i(188));return n.stateNode.current===n?e:t}function f(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=f(e),t!==null)return t;e=e.sibling}return null}var m=Object.assign,g=Symbol.for(`react.element`),_=Symbol.for(`react.transitional.element`),v=Symbol.for(`react.portal`),y=Symbol.for(`react.fragment`),b=Symbol.for(`react.strict_mode`),x=Symbol.for(`react.profiler`),S=Symbol.for(`react.consumer`),C=Symbol.for(`react.context`),w=Symbol.for(`react.forward_ref`),ee=Symbol.for(`react.suspense`),T=Symbol.for(`react.suspense_list`),te=Symbol.for(`react.memo`),E=Symbol.for(`react.lazy`),ne=Symbol.for(`react.activity`),re=Symbol.for(`react.memo_cache_sentinel`),ie=Symbol.iterator;function ae(e){return typeof e!=`object`||!e?null:(e=ie&&e[ie]||e[`@@iterator`],typeof e==`function`?e:null)}var oe=Symbol.for(`react.client.reference`);function se(e){if(e==null)return null;if(typeof e==`function`)return e.$$typeof===oe?null:e.displayName||e.name||null;if(typeof e==`string`)return e;switch(e){case y:return`Fragment`;case x:return`Profiler`;case b:return`StrictMode`;case ee:return`Suspense`;case T:return`SuspenseList`;case ne:return`Activity`}if(typeof e==`object`)switch(e.$$typeof){case v:return`Portal`;case C:return e.displayName||`Context`;case S:return(e._context.displayName||`Context`)+`.Consumer`;case w:var t=e.render;return e=e.displayName,e||=(e=t.displayName||t.name||``,e===``?`ForwardRef`:`ForwardRef(`+e+`)`),e;case te:return t=e.displayName||null,t===null?se(e.type)||`Memo`:t;case E:t=e._payload,e=e._init;try{return se(e(t))}catch{}}return null}var ce=Array.isArray,D=n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,O=r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,le={pending:!1,data:null,method:null,action:null},ue=[],de=-1;function fe(e){return{current:e}}function k(e){0>de||(e.current=ue[de],ue[de]=null,de--)}function A(e,t){de++,ue[de]=e.current,e.current=t}var pe=fe(null),me=fe(null),he=fe(null),ge=fe(null);function _e(e,t){switch(A(he,t),A(me,e),A(pe,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?Vd(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=Vd(t),e=Hd(t,e);else switch(e){case`svg`:e=1;break;case`math`:e=2;break;default:e=0}}k(pe),A(pe,e)}function ve(){k(pe),k(me),k(he)}function ye(e){e.memoizedState!==null&&A(ge,e);var t=pe.current,n=Hd(t,e.type);t!==n&&(A(me,e),A(pe,n))}function be(e){me.current===e&&(k(pe),k(me)),ge.current===e&&(k(ge),Qf._currentValue=le)}var xe,Se;function Ce(e){if(xe===void 0)try{throw Error()}catch(e){var t=e.stack.trim().match(/\n( *(at )?)/);xe=t&&t[1]||``,Se=-1<e.stack.indexOf(`
    at`)?` (<anonymous>)`:-1<e.stack.indexOf(`@`)?`@unknown:0:0`:``}return`
`+xe+e+Se}var we=!1;function Te(e,t){if(!e||we)return``;we=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var r={DetermineComponentFrameRoot:function(){try{if(t){var n=function(){throw Error()};if(Object.defineProperty(n.prototype,`props`,{set:function(){throw Error()}}),typeof Reflect==`object`&&Reflect.construct){try{Reflect.construct(n,[])}catch(e){var r=e}Reflect.construct(e,[],n)}else{try{n.call()}catch(e){r=e}e.call(n.prototype)}}else{try{throw Error()}catch(e){r=e}(n=e())&&typeof n.catch==`function`&&n.catch(function(){})}}catch(e){if(e&&r&&typeof e.stack==`string`)return[e.stack,r.stack]}return[null,null]}};r.DetermineComponentFrameRoot.displayName=`DetermineComponentFrameRoot`;var i=Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot,`name`);i&&i.configurable&&Object.defineProperty(r.DetermineComponentFrameRoot,`name`,{value:`DetermineComponentFrameRoot`});var a=r.DetermineComponentFrameRoot(),o=a[0],s=a[1];if(o&&s){var c=o.split(`
`),l=s.split(`
`);for(i=r=0;r<c.length&&!c[r].includes(`DetermineComponentFrameRoot`);)r++;for(;i<l.length&&!l[i].includes(`DetermineComponentFrameRoot`);)i++;if(r===c.length||i===l.length)for(r=c.length-1,i=l.length-1;1<=r&&0<=i&&c[r]!==l[i];)i--;for(;1<=r&&0<=i;r--,i--)if(c[r]!==l[i]){if(r!==1||i!==1)do if(r--,i--,0>i||c[r]!==l[i]){var u=`
`+c[r].replace(` at new `,` at `);return e.displayName&&u.includes(`<anonymous>`)&&(u=u.replace(`<anonymous>`,e.displayName)),u}while(1<=r&&0<=i);break}}}finally{we=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:``)?Ce(n):``}function Ee(e,t){switch(e.tag){case 26:case 27:case 5:return Ce(e.type);case 16:return Ce(`Lazy`);case 13:return e.child!==t&&t!==null?Ce(`Suspense Fallback`):Ce(`Suspense`);case 19:return Ce(`SuspenseList`);case 0:case 15:return Te(e.type,!1);case 11:return Te(e.type.render,!1);case 1:return Te(e.type,!0);case 31:return Ce(`Activity`);default:return``}}function De(e){try{var t=``,n=null;do t+=Ee(e,n),n=e,e=e.return;while(e);return t}catch(e){return`
Error generating stack: `+e.message+`
`+e.stack}}var Oe=Object.prototype.hasOwnProperty,ke=t.unstable_scheduleCallback,Ae=t.unstable_cancelCallback,je=t.unstable_shouldYield,Me=t.unstable_requestPaint,Ne=t.unstable_now,Pe=t.unstable_getCurrentPriorityLevel,Fe=t.unstable_ImmediatePriority,Ie=t.unstable_UserBlockingPriority,Le=t.unstable_NormalPriority,Re=t.unstable_LowPriority,ze=t.unstable_IdlePriority,Be=t.log,Ve=t.unstable_setDisableYieldValue,He=null,Ue=null;function We(e){if(typeof Be==`function`&&Ve(e),Ue&&typeof Ue.setStrictMode==`function`)try{Ue.setStrictMode(He,e)}catch{}}var Ge=Math.clz32?Math.clz32:Je,Ke=Math.log,qe=Math.LN2;function Je(e){return e>>>=0,e===0?32:31-(Ke(e)/qe|0)|0}var Ye=256,Xe=262144,Ze=4194304;function Qe(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&261888;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function $e(e,t,n){var r=e.pendingLanes;if(r===0)return 0;var i=0,a=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var s=r&134217727;return s===0?(s=r&~a,s===0?o===0?n||(n=r&~e,n!==0&&(i=Qe(n))):i=Qe(o):i=Qe(s)):(r=s&~a,r===0?(o&=s,o===0?n||(n=s&~e,n!==0&&(i=Qe(n))):i=Qe(o)):i=Qe(r)),i===0?0:t!==0&&t!==i&&(t&a)===0&&(a=i&-i,n=t&-t,a>=n||a===32&&n&4194048)?t:i}function et(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function tt(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function nt(){var e=Ze;return Ze<<=1,!(Ze&62914560)&&(Ze=4194304),e}function rt(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function it(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function at(e,t,n,r,i,a){var o=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var s=e.entanglements,c=e.expirationTimes,l=e.hiddenUpdates;for(n=o&~n;0<n;){var u=31-Ge(n),d=1<<u;s[u]=0,c[u]=-1;var f=l[u];if(f!==null)for(l[u]=null,u=0;u<f.length;u++){var p=f[u];p!==null&&(p.lane&=-536870913)}n&=~d}r!==0&&ot(e,r,0),a!==0&&i===0&&e.tag!==0&&(e.suspendedLanes|=a&~(o&~t))}function ot(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var r=31-Ge(t);e.entangledLanes|=t,e.entanglements[r]=e.entanglements[r]|1073741824|n&261930}function st(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ge(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}function ct(e,t){var n=t&-t;return n=n&42?1:lt(n),(n&(e.suspendedLanes|t))===0?n:0}function lt(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function ut(e){return e&=-e,2<e?8<e?e&134217727?32:268435456:8:2}function dt(){var e=O.p;return e===0?(e=window.event,e===void 0?32:mp(e.type)):e}function ft(e,t){var n=O.p;try{return O.p=e,t()}finally{O.p=n}}var pt=Math.random().toString(36).slice(2),mt=`__reactFiber$`+pt,ht=`__reactProps$`+pt,gt=`__reactContainer$`+pt,j=`__reactEvents$`+pt,_t=`__reactListeners$`+pt,vt=`__reactHandles$`+pt,yt=`__reactResources$`+pt,bt=`__reactMarker$`+pt;function xt(e){delete e[mt],delete e[ht],delete e[j],delete e[_t],delete e[vt]}function St(e){var t=e[mt];if(t)return t;for(var n=e.parentNode;n;){if(t=n[gt]||n[mt]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=df(e);e!==null;){if(n=e[mt])return n;e=df(e)}return t}e=n,n=e.parentNode}return null}function Ct(e){if(e=e[mt]||e[gt]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function wt(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(i(33))}function Tt(e){var t=e[yt];return t||=e[yt]={hoistableStyles:new Map,hoistableScripts:new Map},t}function Et(e){e[bt]=!0}var Dt=new Set,Ot={};function kt(e,t){At(e,t),At(e+`Capture`,t)}function At(e,t){for(Ot[e]=t,e=0;e<t.length;e++)Dt.add(t[e])}var jt=RegExp(`^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`),Mt={},Nt={};function Pt(e){return Oe.call(Nt,e)?!0:Oe.call(Mt,e)?!1:jt.test(e)?Nt[e]=!0:(Mt[e]=!0,!1)}function Ft(e,t,n){if(Pt(t))if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:e.removeAttribute(t);return;case`boolean`:var r=t.toLowerCase().slice(0,5);if(r!==`data-`&&r!==`aria-`){e.removeAttribute(t);return}}e.setAttribute(t,``+n)}}function It(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(t);return}e.setAttribute(t,``+n)}}function Lt(e,t,n,r){if(r===null)e.removeAttribute(n);else{switch(typeof r){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(n);return}e.setAttributeNS(t,n,``+r)}}function M(e){switch(typeof e){case`bigint`:case`boolean`:case`number`:case`string`:case`undefined`:return e;case`object`:return e;default:return``}}function Rt(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()===`input`&&(t===`checkbox`||t===`radio`)}function zt(e,t,n){var r=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&r!==void 0&&typeof r.get==`function`&&typeof r.set==`function`){var i=r.get,a=r.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(e){n=``+e,a.call(this,e)}}),Object.defineProperty(e,t,{enumerable:r.enumerable}),{getValue:function(){return n},setValue:function(e){n=``+e},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Bt(e){if(!e._valueTracker){var t=Rt(e)?`checked`:`value`;e._valueTracker=zt(e,t,``+e[t])}}function Vt(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r=``;return e&&(r=Rt(e)?e.checked?`true`:`false`:e.value),e=r,e===n?!1:(t.setValue(e),!0)}function Ht(e){if(e||=typeof document<`u`?document:void 0,e===void 0)return null;try{return e.activeElement||e.body}catch{return e.body}}var Ut=/[\n"\\]/g;function Wt(e){return e.replace(Ut,function(e){return`\\`+e.charCodeAt(0).toString(16)+` `})}function Gt(e,t,n,r,i,a,o,s){e.name=``,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`?e.type=o:e.removeAttribute(`type`),t==null?o!==`submit`&&o!==`reset`||e.removeAttribute(`value`):o===`number`?(t===0&&e.value===``||e.value!=t)&&(e.value=``+M(t)):e.value!==``+M(t)&&(e.value=``+M(t)),t==null?n==null?r!=null&&e.removeAttribute(`value`):qt(e,o,M(n)):qt(e,o,M(t)),i==null&&a!=null&&(e.defaultChecked=!!a),i!=null&&(e.checked=i&&typeof i!=`function`&&typeof i!=`symbol`),s!=null&&typeof s!=`function`&&typeof s!=`symbol`&&typeof s!=`boolean`?e.name=``+M(s):e.removeAttribute(`name`)}function Kt(e,t,n,r,i,a,o,s){if(a!=null&&typeof a!=`function`&&typeof a!=`symbol`&&typeof a!=`boolean`&&(e.type=a),t!=null||n!=null){if(!(a!==`submit`&&a!==`reset`||t!=null)){Bt(e);return}n=n==null?``:``+M(n),t=t==null?n:``+M(t),s||t===e.value||(e.value=t),e.defaultValue=t}r??=i,r=typeof r!=`function`&&typeof r!=`symbol`&&!!r,e.checked=s?e.checked:!!r,e.defaultChecked=!!r,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`&&(e.name=o),Bt(e)}function qt(e,t,n){t===`number`&&Ht(e.ownerDocument)===e||e.defaultValue===``+n||(e.defaultValue=``+n)}function Jt(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t[`$`+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty(`$`+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=``+M(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function Yt(e,t,n){if(t!=null&&(t=``+M(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n==null?``:``+M(n)}function Xt(e,t,n,r){if(t==null){if(r!=null){if(n!=null)throw Error(i(92));if(ce(r)){if(1<r.length)throw Error(i(93));r=r[0]}n=r}n??=``,t=n}n=M(t),e.defaultValue=n,r=e.textContent,r===n&&r!==``&&r!==null&&(e.value=r),Bt(e)}function Zt(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var Qt=new Set(`animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(` `));function $t(e,t,n){var r=t.indexOf(`--`)===0;n==null||typeof n==`boolean`||n===``?r?e.setProperty(t,``):t===`float`?e.cssFloat=``:e[t]=``:r?e.setProperty(t,n):typeof n!=`number`||n===0||Qt.has(t)?t===`float`?e.cssFloat=n:e[t]=(``+n).trim():e[t]=n+`px`}function en(e,t,n){if(t!=null&&typeof t!=`object`)throw Error(i(62));if(e=e.style,n!=null){for(var r in n)!n.hasOwnProperty(r)||t!=null&&t.hasOwnProperty(r)||(r.indexOf(`--`)===0?e.setProperty(r,``):r===`float`?e.cssFloat=``:e[r]=``);for(var a in t)r=t[a],t.hasOwnProperty(a)&&n[a]!==r&&$t(e,a,r)}else for(var o in t)t.hasOwnProperty(o)&&$t(e,o,t[o])}function tn(e){if(e.indexOf(`-`)===-1)return!1;switch(e){case`annotation-xml`:case`color-profile`:case`font-face`:case`font-face-src`:case`font-face-uri`:case`font-face-format`:case`font-face-name`:case`missing-glyph`:return!1;default:return!0}}var nn=new Map([[`acceptCharset`,`accept-charset`],[`htmlFor`,`for`],[`httpEquiv`,`http-equiv`],[`crossOrigin`,`crossorigin`],[`accentHeight`,`accent-height`],[`alignmentBaseline`,`alignment-baseline`],[`arabicForm`,`arabic-form`],[`baselineShift`,`baseline-shift`],[`capHeight`,`cap-height`],[`clipPath`,`clip-path`],[`clipRule`,`clip-rule`],[`colorInterpolation`,`color-interpolation`],[`colorInterpolationFilters`,`color-interpolation-filters`],[`colorProfile`,`color-profile`],[`colorRendering`,`color-rendering`],[`dominantBaseline`,`dominant-baseline`],[`enableBackground`,`enable-background`],[`fillOpacity`,`fill-opacity`],[`fillRule`,`fill-rule`],[`floodColor`,`flood-color`],[`floodOpacity`,`flood-opacity`],[`fontFamily`,`font-family`],[`fontSize`,`font-size`],[`fontSizeAdjust`,`font-size-adjust`],[`fontStretch`,`font-stretch`],[`fontStyle`,`font-style`],[`fontVariant`,`font-variant`],[`fontWeight`,`font-weight`],[`glyphName`,`glyph-name`],[`glyphOrientationHorizontal`,`glyph-orientation-horizontal`],[`glyphOrientationVertical`,`glyph-orientation-vertical`],[`horizAdvX`,`horiz-adv-x`],[`horizOriginX`,`horiz-origin-x`],[`imageRendering`,`image-rendering`],[`letterSpacing`,`letter-spacing`],[`lightingColor`,`lighting-color`],[`markerEnd`,`marker-end`],[`markerMid`,`marker-mid`],[`markerStart`,`marker-start`],[`overlinePosition`,`overline-position`],[`overlineThickness`,`overline-thickness`],[`paintOrder`,`paint-order`],[`panose-1`,`panose-1`],[`pointerEvents`,`pointer-events`],[`renderingIntent`,`rendering-intent`],[`shapeRendering`,`shape-rendering`],[`stopColor`,`stop-color`],[`stopOpacity`,`stop-opacity`],[`strikethroughPosition`,`strikethrough-position`],[`strikethroughThickness`,`strikethrough-thickness`],[`strokeDasharray`,`stroke-dasharray`],[`strokeDashoffset`,`stroke-dashoffset`],[`strokeLinecap`,`stroke-linecap`],[`strokeLinejoin`,`stroke-linejoin`],[`strokeMiterlimit`,`stroke-miterlimit`],[`strokeOpacity`,`stroke-opacity`],[`strokeWidth`,`stroke-width`],[`textAnchor`,`text-anchor`],[`textDecoration`,`text-decoration`],[`textRendering`,`text-rendering`],[`transformOrigin`,`transform-origin`],[`underlinePosition`,`underline-position`],[`underlineThickness`,`underline-thickness`],[`unicodeBidi`,`unicode-bidi`],[`unicodeRange`,`unicode-range`],[`unitsPerEm`,`units-per-em`],[`vAlphabetic`,`v-alphabetic`],[`vHanging`,`v-hanging`],[`vIdeographic`,`v-ideographic`],[`vMathematical`,`v-mathematical`],[`vectorEffect`,`vector-effect`],[`vertAdvY`,`vert-adv-y`],[`vertOriginX`,`vert-origin-x`],[`vertOriginY`,`vert-origin-y`],[`wordSpacing`,`word-spacing`],[`writingMode`,`writing-mode`],[`xmlnsXlink`,`xmlns:xlink`],[`xHeight`,`x-height`]]),rn=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function an(e){return rn.test(``+e)?`javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`:e}function on(){}var sn=null;function cn(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var ln=null,un=null;function dn(e){var t=Ct(e);if(t&&(e=t.stateNode)){var n=e[ht]||null;a:switch(e=t.stateNode,t.type){case`input`:if(Gt(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type===`radio`&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll(`input[name="`+Wt(``+t)+`"][type="radio"]`),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var a=r[ht]||null;if(!a)throw Error(i(90));Gt(r,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name)}}for(t=0;t<n.length;t++)r=n[t],r.form===e.form&&Vt(r)}break a;case`textarea`:Yt(e,n.value,n.defaultValue);break a;case`select`:t=n.value,t!=null&&Jt(e,!!n.multiple,t,!1)}}}var fn=!1;function pn(e,t,n){if(fn)return e(t,n);fn=!0;try{return e(t)}finally{if(fn=!1,(ln!==null||un!==null)&&(bu(),ln&&(t=ln,e=un,un=ln=null,dn(t),e)))for(t=0;t<e.length;t++)dn(e[t])}}function mn(e,t){var n=e.stateNode;if(n===null)return null;var r=n[ht]||null;if(r===null)return null;n=r[t];a:switch(t){case`onClick`:case`onClickCapture`:case`onDoubleClick`:case`onDoubleClickCapture`:case`onMouseDown`:case`onMouseDownCapture`:case`onMouseMove`:case`onMouseMoveCapture`:case`onMouseUp`:case`onMouseUpCapture`:case`onMouseEnter`:(r=!r.disabled)||(e=e.type,r=!(e===`button`||e===`input`||e===`select`||e===`textarea`)),e=!r;break a;default:e=!1}if(e)return null;if(n&&typeof n!=`function`)throw Error(i(231,t,typeof n));return n}var hn=!(typeof window>`u`||window.document===void 0||window.document.createElement===void 0),gn=!1;if(hn)try{var _n={};Object.defineProperty(_n,`passive`,{get:function(){gn=!0}}),window.addEventListener(`test`,_n,_n),window.removeEventListener(`test`,_n,_n)}catch{gn=!1}var vn=null,yn=null,bn=null;function xn(){if(bn)return bn;var e,t=yn,n=t.length,r,i=`value`in vn?vn.value:vn.textContent,a=i.length;for(e=0;e<n&&t[e]===i[e];e++);var o=n-e;for(r=1;r<=o&&t[n-r]===i[a-r];r++);return bn=i.slice(e,1<r?1-r:void 0)}function Sn(e){var t=e.keyCode;return`charCode`in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Cn(){return!0}function wn(){return!1}function Tn(e){function t(t,n,r,i,a){for(var o in this._reactName=t,this._targetInst=r,this.type=n,this.nativeEvent=i,this.target=a,this.currentTarget=null,e)e.hasOwnProperty(o)&&(t=e[o],this[o]=t?t(i):i[o]);return this.isDefaultPrevented=(i.defaultPrevented==null?!1===i.returnValue:i.defaultPrevented)?Cn:wn,this.isPropagationStopped=wn,this}return m(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var e=this.nativeEvent;e&&(e.preventDefault?e.preventDefault():typeof e.returnValue!=`unknown`&&(e.returnValue=!1),this.isDefaultPrevented=Cn)},stopPropagation:function(){var e=this.nativeEvent;e&&(e.stopPropagation?e.stopPropagation():typeof e.cancelBubble!=`unknown`&&(e.cancelBubble=!0),this.isPropagationStopped=Cn)},persist:function(){},isPersistent:Cn}),t}var En={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Dn=Tn(En),On=m({},En,{view:0,detail:0}),kn=Tn(On),An,jn,Mn,Nn=m({},On,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Wn,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return`movementX`in e?e.movementX:(e!==Mn&&(Mn&&e.type===`mousemove`?(An=e.screenX-Mn.screenX,jn=e.screenY-Mn.screenY):jn=An=0,Mn=e),An)},movementY:function(e){return`movementY`in e?e.movementY:jn}}),Pn=Tn(Nn),Fn=Tn(m({},Nn,{dataTransfer:0})),In=Tn(m({},On,{relatedTarget:0})),Ln=Tn(m({},En,{animationName:0,elapsedTime:0,pseudoElement:0})),Rn=Tn(m({},En,{clipboardData:function(e){return`clipboardData`in e?e.clipboardData:window.clipboardData}})),zn=Tn(m({},En,{data:0})),Bn={Esc:`Escape`,Spacebar:` `,Left:`ArrowLeft`,Up:`ArrowUp`,Right:`ArrowRight`,Down:`ArrowDown`,Del:`Delete`,Win:`OS`,Menu:`ContextMenu`,Apps:`ContextMenu`,Scroll:`ScrollLock`,MozPrintableKey:`Unidentified`},Vn={8:`Backspace`,9:`Tab`,12:`Clear`,13:`Enter`,16:`Shift`,17:`Control`,18:`Alt`,19:`Pause`,20:`CapsLock`,27:`Escape`,32:` `,33:`PageUp`,34:`PageDown`,35:`End`,36:`Home`,37:`ArrowLeft`,38:`ArrowUp`,39:`ArrowRight`,40:`ArrowDown`,45:`Insert`,46:`Delete`,112:`F1`,113:`F2`,114:`F3`,115:`F4`,116:`F5`,117:`F6`,118:`F7`,119:`F8`,120:`F9`,121:`F10`,122:`F11`,123:`F12`,144:`NumLock`,145:`ScrollLock`,224:`Meta`},Hn={Alt:`altKey`,Control:`ctrlKey`,Meta:`metaKey`,Shift:`shiftKey`};function Un(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Hn[e])?!!t[e]:!1}function Wn(){return Un}var Gn=Tn(m({},On,{key:function(e){if(e.key){var t=Bn[e.key]||e.key;if(t!==`Unidentified`)return t}return e.type===`keypress`?(e=Sn(e),e===13?`Enter`:String.fromCharCode(e)):e.type===`keydown`||e.type===`keyup`?Vn[e.keyCode]||`Unidentified`:``},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Wn,charCode:function(e){return e.type===`keypress`?Sn(e):0},keyCode:function(e){return e.type===`keydown`||e.type===`keyup`?e.keyCode:0},which:function(e){return e.type===`keypress`?Sn(e):e.type===`keydown`||e.type===`keyup`?e.keyCode:0}})),Kn=Tn(m({},Nn,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0})),qn=Tn(m({},On,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Wn})),Jn=Tn(m({},En,{propertyName:0,elapsedTime:0,pseudoElement:0})),Yn=Tn(m({},Nn,{deltaX:function(e){return`deltaX`in e?e.deltaX:`wheelDeltaX`in e?-e.wheelDeltaX:0},deltaY:function(e){return`deltaY`in e?e.deltaY:`wheelDeltaY`in e?-e.wheelDeltaY:`wheelDelta`in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0})),Xn=Tn(m({},En,{newState:0,oldState:0})),Zn=[9,13,27,32],Qn=hn&&`CompositionEvent`in window,$n=null;hn&&`documentMode`in document&&($n=document.documentMode);var er=hn&&`TextEvent`in window&&!$n,tr=hn&&(!Qn||$n&&8<$n&&11>=$n),nr=` `,rr=!1;function ir(e,t){switch(e){case`keyup`:return Zn.indexOf(t.keyCode)!==-1;case`keydown`:return t.keyCode!==229;case`keypress`:case`mousedown`:case`focusout`:return!0;default:return!1}}function ar(e){return e=e.detail,typeof e==`object`&&`data`in e?e.data:null}var or=!1;function sr(e,t){switch(e){case`compositionend`:return ar(t);case`keypress`:return t.which===32?(rr=!0,nr):null;case`textInput`:return e=t.data,e===nr&&rr?null:e;default:return null}}function cr(e,t){if(or)return e===`compositionend`||!Qn&&ir(e,t)?(e=xn(),bn=yn=vn=null,or=!1,e):null;switch(e){case`paste`:return null;case`keypress`:if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case`compositionend`:return tr&&t.locale!==`ko`?null:t.data;default:return null}}var lr={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function ur(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t===`input`?!!lr[e.type]:t===`textarea`}function dr(e,t,n,r){ln?un?un.push(r):un=[r]:ln=r,t=Ed(t,`onChange`),0<t.length&&(n=new Dn(`onChange`,`change`,null,n,r),e.push({event:n,listeners:t}))}var N=null,fr=null;function pr(e){yd(e,0)}function mr(e){if(Vt(wt(e)))return e}function hr(e,t){if(e===`change`)return t}var gr=!1;if(hn){var _r;if(hn){var vr=`oninput`in document;if(!vr){var yr=document.createElement(`div`);yr.setAttribute(`oninput`,`return;`),vr=typeof yr.oninput==`function`}_r=vr}else _r=!1;gr=_r&&(!document.documentMode||9<document.documentMode)}function br(){N&&(N.detachEvent(`onpropertychange`,xr),fr=N=null)}function xr(e){if(e.propertyName===`value`&&mr(fr)){var t=[];dr(t,fr,e,cn(e)),pn(pr,t)}}function Sr(e,t,n){e===`focusin`?(br(),N=t,fr=n,N.attachEvent(`onpropertychange`,xr)):e===`focusout`&&br()}function Cr(e){if(e===`selectionchange`||e===`keyup`||e===`keydown`)return mr(fr)}function P(e,t){if(e===`click`)return mr(t)}function wr(e,t){if(e===`input`||e===`change`)return mr(t)}function Tr(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var Er=typeof Object.is==`function`?Object.is:Tr;function Dr(e,t){if(Er(e,t))return!0;if(typeof e!=`object`||!e||typeof t!=`object`||!t)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!Oe.call(t,i)||!Er(e[i],t[i]))return!1}return!0}function Or(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function kr(e,t){var n=Or(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}a:{for(;n;){if(n.nextSibling){n=n.nextSibling;break a}n=n.parentNode}n=void 0}n=Or(n)}}function Ar(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Ar(e,t.parentNode):`contains`in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function jr(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Ht(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href==`string`}catch{n=!1}if(n)e=t.contentWindow;else break;t=Ht(e.document)}return t}function Mr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t===`input`&&(e.type===`text`||e.type===`search`||e.type===`tel`||e.type===`url`||e.type===`password`)||t===`textarea`||e.contentEditable===`true`)}var F=hn&&`documentMode`in document&&11>=document.documentMode,Nr=null,I=null,Pr=null,Fr=!1;function Ir(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Fr||Nr==null||Nr!==Ht(r)||(r=Nr,`selectionStart`in r&&Mr(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),Pr&&Dr(Pr,r)||(Pr=r,r=Ed(I,`onSelect`),0<r.length&&(t=new Dn(`onSelect`,`select`,null,t,n),e.push({event:t,listeners:r}),t.target=Nr)))}function Lr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n[`Webkit`+e]=`webkit`+t,n[`Moz`+e]=`moz`+t,n}var Rr={animationend:Lr(`Animation`,`AnimationEnd`),animationiteration:Lr(`Animation`,`AnimationIteration`),animationstart:Lr(`Animation`,`AnimationStart`),transitionrun:Lr(`Transition`,`TransitionRun`),transitionstart:Lr(`Transition`,`TransitionStart`),transitioncancel:Lr(`Transition`,`TransitionCancel`),transitionend:Lr(`Transition`,`TransitionEnd`)},zr={},Br={};hn&&(Br=document.createElement(`div`).style,`AnimationEvent`in window||(delete Rr.animationend.animation,delete Rr.animationiteration.animation,delete Rr.animationstart.animation),`TransitionEvent`in window||delete Rr.transitionend.transition);function Vr(e){if(zr[e])return zr[e];if(!Rr[e])return e;var t=Rr[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Br)return zr[e]=t[n];return e}var Hr=Vr(`animationend`),Ur=Vr(`animationiteration`),Wr=Vr(`animationstart`),Gr=Vr(`transitionrun`),Kr=Vr(`transitionstart`),qr=Vr(`transitioncancel`),Jr=Vr(`transitionend`),Yr=new Map,Xr=`abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(` `);Xr.push(`scrollEnd`);function Zr(e,t){Yr.set(e,t),kt(t,[e])}var Qr=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},$r=[],ei=0,ti=0;function ni(){for(var e=ei,t=ti=ei=0;t<e;){var n=$r[t];$r[t++]=null;var r=$r[t];$r[t++]=null;var i=$r[t];$r[t++]=null;var a=$r[t];if($r[t++]=null,r!==null&&i!==null){var o=r.pending;o===null?i.next=i:(i.next=o.next,o.next=i),r.pending=i}a!==0&&oi(n,i,a)}}function ri(e,t,n,r){$r[ei++]=e,$r[ei++]=t,$r[ei++]=n,$r[ei++]=r,ti|=r,e.lanes|=r,e=e.alternate,e!==null&&(e.lanes|=r)}function ii(e,t,n,r){return ri(e,t,n,r),si(e)}function ai(e,t){return ri(e,null,null,t),si(e)}function oi(e,t,n){e.lanes|=n;var r=e.alternate;r!==null&&(r.lanes|=n);for(var i=!1,a=e.return;a!==null;)a.childLanes|=n,r=a.alternate,r!==null&&(r.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(i=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,i&&t!==null&&(i=31-Ge(n),e=a.hiddenUpdates,r=e[i],r===null?e[i]=[t]:r.push(t),t.lane=n|536870912),a):null}function si(e){if(50<fu)throw fu=0,pu=null,Error(i(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var ci={};function li(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function ui(e,t,n,r){return new li(e,t,n,r)}function di(e){return e=e.prototype,!(!e||!e.isReactComponent)}function fi(e,t){var n=e.alternate;return n===null?(n=ui(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&65011712,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function pi(e,t){e.flags&=65011714;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function mi(e,t,n,r,a,o){var s=0;if(r=e,typeof e==`function`)di(e)&&(s=1);else if(typeof e==`string`)s=Uf(e,n,pe.current)?26:e===`html`||e===`head`||e===`body`?27:5;else a:switch(e){case ne:return e=ui(31,n,t,a),e.elementType=ne,e.lanes=o,e;case y:return hi(n.children,a,o,t);case b:s=8,a|=24;break;case x:return e=ui(12,n,t,a|2),e.elementType=x,e.lanes=o,e;case ee:return e=ui(13,n,t,a),e.elementType=ee,e.lanes=o,e;case T:return e=ui(19,n,t,a),e.elementType=T,e.lanes=o,e;default:if(typeof e==`object`&&e)switch(e.$$typeof){case C:s=10;break a;case S:s=9;break a;case w:s=11;break a;case te:s=14;break a;case E:s=16,r=null;break a}s=29,n=Error(i(130,e===null?`null`:typeof e,``)),r=null}return t=ui(s,n,t,a),t.elementType=e,t.type=r,t.lanes=o,t}function hi(e,t,n,r){return e=ui(7,e,r,t),e.lanes=n,e}function gi(e,t,n){return e=ui(6,e,null,t),e.lanes=n,e}function _i(e){var t=ui(18,null,null,0);return t.stateNode=e,t}function vi(e,t,n){return t=ui(4,e.children===null?[]:e.children,e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var yi=new WeakMap;function bi(e,t){if(typeof e==`object`&&e){var n=yi.get(e);return n===void 0?(t={value:e,source:t,stack:De(t)},yi.set(e,t),t):n}return{value:e,source:t,stack:De(t)}}var xi=[],Si=0,Ci=null,wi=0,Ti=[],Ei=0,Di=null,Oi=1,ki=``;function Ai(e,t){xi[Si++]=wi,xi[Si++]=Ci,Ci=e,wi=t}function ji(e,t,n){Ti[Ei++]=Oi,Ti[Ei++]=ki,Ti[Ei++]=Di,Di=e;var r=Oi;e=ki;var i=32-Ge(r)-1;r&=~(1<<i),n+=1;var a=32-Ge(t)+i;if(30<a){var o=i-i%5;a=(r&(1<<o)-1).toString(32),r>>=o,i-=o,Oi=1<<32-Ge(t)+i|n<<i|r,ki=a+e}else Oi=1<<a|n<<i|r,ki=e}function Mi(e){e.return!==null&&(Ai(e,1),ji(e,1,0))}function Ni(e){for(;e===Ci;)Ci=xi[--Si],xi[Si]=null,wi=xi[--Si],xi[Si]=null;for(;e===Di;)Di=Ti[--Ei],Ti[Ei]=null,ki=Ti[--Ei],Ti[Ei]=null,Oi=Ti[--Ei],Ti[Ei]=null}function Pi(e,t){Ti[Ei++]=Oi,Ti[Ei++]=ki,Ti[Ei++]=Di,Oi=t.id,ki=t.overflow,Di=e}var Fi=null,L=null,R=!1,Ii=null,Li=!1,Ri=Error(i(519));function zi(e){throw Gi(bi(Error(i(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?`text`:`HTML`,``)),e)),Ri}function Bi(e){var t=e.stateNode,n=e.type,r=e.memoizedProps;switch(t[mt]=e,t[ht]=r,n){case`dialog`:Q(`cancel`,t),Q(`close`,t);break;case`iframe`:case`object`:case`embed`:Q(`load`,t);break;case`video`:case`audio`:for(n=0;n<_d.length;n++)Q(_d[n],t);break;case`source`:Q(`error`,t);break;case`img`:case`image`:case`link`:Q(`error`,t),Q(`load`,t);break;case`details`:Q(`toggle`,t);break;case`input`:Q(`invalid`,t),Kt(t,r.value,r.defaultValue,r.checked,r.defaultChecked,r.type,r.name,!0);break;case`select`:Q(`invalid`,t);break;case`textarea`:Q(`invalid`,t),Xt(t,r.value,r.defaultValue,r.children)}n=r.children,typeof n!=`string`&&typeof n!=`number`&&typeof n!=`bigint`||t.textContent===``+n||!0===r.suppressHydrationWarning||Md(t.textContent,n)?(r.popover!=null&&(Q(`beforetoggle`,t),Q(`toggle`,t)),r.onScroll!=null&&Q(`scroll`,t),r.onScrollEnd!=null&&Q(`scrollend`,t),r.onClick!=null&&(t.onclick=on),t=!0):t=!1,t||zi(e,!0)}function Vi(e){for(Fi=e.return;Fi;)switch(Fi.tag){case 5:case 31:case 13:Li=!1;return;case 27:case 3:Li=!0;return;default:Fi=Fi.return}}function Hi(e){if(e!==Fi)return!1;if(!R)return Vi(e),R=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=!(n!==`form`&&n!==`button`)||Ud(e.type,e.memoizedProps)),n=!n),n&&L&&zi(e),Vi(e),t===13){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));L=uf(e)}else if(t===31){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));L=uf(e)}else t===27?(t=L,Zd(e.type)?(e=lf,lf=null,L=e):L=t):L=Fi?cf(e.stateNode.nextSibling):null;return!0}function Ui(){L=Fi=null,R=!1}function Wi(){var e=Ii;return e!==null&&(Ql===null?Ql=e:Ql.push.apply(Ql,e),Ii=null),e}function Gi(e){Ii===null?Ii=[e]:Ii.push(e)}var Ki=fe(null),qi=null,Ji=null;function Yi(e,t,n){A(Ki,t._currentValue),t._currentValue=n}function Xi(e){e._currentValue=Ki.current,k(Ki)}function Zi(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)===t?r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t):(e.childLanes|=t,r!==null&&(r.childLanes|=t)),e===n)break;e=e.return}}function Qi(e,t,n,r){var a=e.child;for(a!==null&&(a.return=e);a!==null;){var o=a.dependencies;if(o!==null){var s=a.child;o=o.firstContext;a:for(;o!==null;){var c=o;o=a;for(var l=0;l<t.length;l++)if(c.context===t[l]){o.lanes|=n,c=o.alternate,c!==null&&(c.lanes|=n),Zi(o.return,n,e),r||(s=null);break a}o=c.next}}else if(a.tag===18){if(s=a.return,s===null)throw Error(i(341));s.lanes|=n,o=s.alternate,o!==null&&(o.lanes|=n),Zi(s,n,e),s=null}else s=a.child;if(s!==null)s.return=a;else for(s=a;s!==null;){if(s===e){s=null;break}if(a=s.sibling,a!==null){a.return=s.return,s=a;break}s=s.return}a=s}}function $i(e,t,n,r){e=null;for(var a=t,o=!1;a!==null;){if(!o){if(a.flags&524288)o=!0;else if(a.flags&262144)break}if(a.tag===10){var s=a.alternate;if(s===null)throw Error(i(387));if(s=s.memoizedProps,s!==null){var c=a.type;Er(a.pendingProps.value,s.value)||(e===null?e=[c]:e.push(c))}}else if(a===ge.current){if(s=a.alternate,s===null)throw Error(i(387));s.memoizedState.memoizedState!==a.memoizedState.memoizedState&&(e===null?e=[Qf]:e.push(Qf))}a=a.return}e!==null&&Qi(t,e,n,r),t.flags|=262144}function ea(e){for(e=e.firstContext;e!==null;){if(!Er(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function ta(e){qi=e,Ji=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function na(e){return ia(qi,e)}function ra(e,t){return qi===null&&ta(e),ia(e,t)}function ia(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},Ji===null){if(e===null)throw Error(i(308));Ji=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else Ji=Ji.next=t;return n}var aa=typeof AbortController<`u`?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(t,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(e){return e()})}},oa=t.unstable_scheduleCallback,sa=t.unstable_NormalPriority,ca={$$typeof:C,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function la(){return{controller:new aa,data:new Map,refCount:0}}function ua(e){e.refCount--,e.refCount===0&&oa(sa,function(){e.controller.abort()})}var da=null,fa=0,pa=0,ma=null;function ha(e,t){if(da===null){var n=da=[];fa=0,pa=dd(),ma={status:`pending`,value:void 0,then:function(e){n.push(e)}}}return fa++,t.then(ga,ga),t}function ga(){if(--fa===0&&da!==null){ma!==null&&(ma.status=`fulfilled`);var e=da;da=null,pa=0,ma=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function _a(e,t){var n=[],r={status:`pending`,value:null,reason:null,then:function(e){n.push(e)}};return e.then(function(){r.status=`fulfilled`,r.value=t;for(var e=0;e<n.length;e++)(0,n[e])(t)},function(e){for(r.status=`rejected`,r.reason=e,e=0;e<n.length;e++)(0,n[e])(void 0)}),r}var va=D.S;D.S=function(e,t){tu=Ne(),typeof t==`object`&&t&&typeof t.then==`function`&&ha(e,t),va!==null&&va(e,t)};var ya=fe(null);function ba(){var e=ya.current;return e===null?K.pooledCache:e}function xa(e,t){t===null?A(ya,ya.current):A(ya,t.pool)}function Sa(){var e=ba();return e===null?null:{parent:ca._currentValue,pool:e}}var Ca=Error(i(460)),wa=Error(i(474)),Ta=Error(i(542)),Ea={then:function(){}};function Da(e){return e=e.status,e===`fulfilled`||e===`rejected`}function Oa(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(on,on),t=n),t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ma(e),e;default:if(typeof t.status==`string`)t.then(on,on);else{if(e=K,e!==null&&100<e.shellSuspendCounter)throw Error(i(482));e=t,e.status=`pending`,e.then(function(e){if(t.status===`pending`){var n=t;n.status=`fulfilled`,n.value=e}},function(e){if(t.status===`pending`){var n=t;n.status=`rejected`,n.reason=e}})}switch(t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ma(e),e}throw Aa=t,Ca}}function ka(e){try{var t=e._init;return t(e._payload)}catch(e){throw typeof e==`object`&&e&&typeof e.then==`function`?(Aa=e,Ca):e}}var Aa=null;function ja(){if(Aa===null)throw Error(i(459));var e=Aa;return Aa=null,e}function Ma(e){if(e===Ca||e===Ta)throw Error(i(483))}var Na=null,Pa=0;function Fa(e){var t=Pa;return Pa+=1,Na===null&&(Na=[]),Oa(Na,e,t)}function Ia(e,t){t=t.props.ref,e.ref=t===void 0?null:t}function La(e,t){throw t.$$typeof===g?Error(i(525)):(e=Object.prototype.toString.call(t),Error(i(31,e===`[object Object]`?`object with keys {`+Object.keys(t).join(`, `)+`}`:e)))}function Ra(e){function t(t,n){if(e){var r=t.deletions;r===null?(t.deletions=[n],t.flags|=16):r.push(n)}}function n(n,r){if(!e)return null;for(;r!==null;)t(n,r),r=r.sibling;return null}function r(e){for(var t=new Map;e!==null;)e.key===null?t.set(e.index,e):t.set(e.key,e),e=e.sibling;return t}function a(e,t){return e=fi(e,t),e.index=0,e.sibling=null,e}function o(t,n,r){return t.index=r,e?(r=t.alternate,r===null?(t.flags|=67108866,n):(r=r.index,r<n?(t.flags|=67108866,n):r)):(t.flags|=1048576,n)}function s(t){return e&&t.alternate===null&&(t.flags|=67108866),t}function c(e,t,n,r){return t===null||t.tag!==6?(t=gi(n,e.mode,r),t.return=e,t):(t=a(t,n),t.return=e,t)}function l(e,t,n,r){var i=n.type;return i===y?d(e,t,n.props.children,r,n.key):t!==null&&(t.elementType===i||typeof i==`object`&&i&&i.$$typeof===E&&ka(i)===t.type)?(t=a(t,n.props),Ia(t,n),t.return=e,t):(t=mi(n.type,n.key,n.props,null,e.mode,r),Ia(t,n),t.return=e,t)}function u(e,t,n,r){return t===null||t.tag!==4||t.stateNode.containerInfo!==n.containerInfo||t.stateNode.implementation!==n.implementation?(t=vi(n,e.mode,r),t.return=e,t):(t=a(t,n.children||[]),t.return=e,t)}function d(e,t,n,r,i){return t===null||t.tag!==7?(t=hi(n,e.mode,r,i),t.return=e,t):(t=a(t,n),t.return=e,t)}function f(e,t,n){if(typeof t==`string`&&t!==``||typeof t==`number`||typeof t==`bigint`)return t=gi(``+t,e.mode,n),t.return=e,t;if(typeof t==`object`&&t){switch(t.$$typeof){case _:return n=mi(t.type,t.key,t.props,null,e.mode,n),Ia(n,t),n.return=e,n;case v:return t=vi(t,e.mode,n),t.return=e,t;case E:return t=ka(t),f(e,t,n)}if(ce(t)||ae(t))return t=hi(t,e.mode,n,null),t.return=e,t;if(typeof t.then==`function`)return f(e,Fa(t),n);if(t.$$typeof===C)return f(e,ra(e,t),n);La(e,t)}return null}function p(e,t,n,r){var i=t===null?null:t.key;if(typeof n==`string`&&n!==``||typeof n==`number`||typeof n==`bigint`)return i===null?c(e,t,``+n,r):null;if(typeof n==`object`&&n){switch(n.$$typeof){case _:return n.key===i?l(e,t,n,r):null;case v:return n.key===i?u(e,t,n,r):null;case E:return n=ka(n),p(e,t,n,r)}if(ce(n)||ae(n))return i===null?d(e,t,n,r,null):null;if(typeof n.then==`function`)return p(e,t,Fa(n),r);if(n.$$typeof===C)return p(e,t,ra(e,n),r);La(e,n)}return null}function m(e,t,n,r,i){if(typeof r==`string`&&r!==``||typeof r==`number`||typeof r==`bigint`)return e=e.get(n)||null,c(t,e,``+r,i);if(typeof r==`object`&&r){switch(r.$$typeof){case _:return e=e.get(r.key===null?n:r.key)||null,l(t,e,r,i);case v:return e=e.get(r.key===null?n:r.key)||null,u(t,e,r,i);case E:return r=ka(r),m(e,t,n,r,i)}if(ce(r)||ae(r))return e=e.get(n)||null,d(t,e,r,i,null);if(typeof r.then==`function`)return m(e,t,n,Fa(r),i);if(r.$$typeof===C)return m(e,t,n,ra(t,r),i);La(t,r)}return null}function h(i,a,s,c){for(var l=null,u=null,d=a,h=a=0,g=null;d!==null&&h<s.length;h++){d.index>h?(g=d,d=null):g=d.sibling;var _=p(i,d,s[h],c);if(_===null){d===null&&(d=g);break}e&&d&&_.alternate===null&&t(i,d),a=o(_,a,h),u===null?l=_:u.sibling=_,u=_,d=g}if(h===s.length)return n(i,d),R&&Ai(i,h),l;if(d===null){for(;h<s.length;h++)d=f(i,s[h],c),d!==null&&(a=o(d,a,h),u===null?l=d:u.sibling=d,u=d);return R&&Ai(i,h),l}for(d=r(d);h<s.length;h++)g=m(d,i,h,s[h],c),g!==null&&(e&&g.alternate!==null&&d.delete(g.key===null?h:g.key),a=o(g,a,h),u===null?l=g:u.sibling=g,u=g);return e&&d.forEach(function(e){return t(i,e)}),R&&Ai(i,h),l}function g(a,s,c,l){if(c==null)throw Error(i(151));for(var u=null,d=null,h=s,g=s=0,_=null,v=c.next();h!==null&&!v.done;g++,v=c.next()){h.index>g?(_=h,h=null):_=h.sibling;var y=p(a,h,v.value,l);if(y===null){h===null&&(h=_);break}e&&h&&y.alternate===null&&t(a,h),s=o(y,s,g),d===null?u=y:d.sibling=y,d=y,h=_}if(v.done)return n(a,h),R&&Ai(a,g),u;if(h===null){for(;!v.done;g++,v=c.next())v=f(a,v.value,l),v!==null&&(s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return R&&Ai(a,g),u}for(h=r(h);!v.done;g++,v=c.next())v=m(h,a,g,v.value,l),v!==null&&(e&&v.alternate!==null&&h.delete(v.key===null?g:v.key),s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return e&&h.forEach(function(e){return t(a,e)}),R&&Ai(a,g),u}function b(e,r,o,c){if(typeof o==`object`&&o&&o.type===y&&o.key===null&&(o=o.props.children),typeof o==`object`&&o){switch(o.$$typeof){case _:a:{for(var l=o.key;r!==null;){if(r.key===l){if(l=o.type,l===y){if(r.tag===7){n(e,r.sibling),c=a(r,o.props.children),c.return=e,e=c;break a}}else if(r.elementType===l||typeof l==`object`&&l&&l.$$typeof===E&&ka(l)===r.type){n(e,r.sibling),c=a(r,o.props),Ia(c,o),c.return=e,e=c;break a}n(e,r);break}else t(e,r);r=r.sibling}o.type===y?(c=hi(o.props.children,e.mode,c,o.key),c.return=e,e=c):(c=mi(o.type,o.key,o.props,null,e.mode,c),Ia(c,o),c.return=e,e=c)}return s(e);case v:a:{for(l=o.key;r!==null;){if(r.key===l)if(r.tag===4&&r.stateNode.containerInfo===o.containerInfo&&r.stateNode.implementation===o.implementation){n(e,r.sibling),c=a(r,o.children||[]),c.return=e,e=c;break a}else{n(e,r);break}else t(e,r);r=r.sibling}c=vi(o,e.mode,c),c.return=e,e=c}return s(e);case E:return o=ka(o),b(e,r,o,c)}if(ce(o))return h(e,r,o,c);if(ae(o)){if(l=ae(o),typeof l!=`function`)throw Error(i(150));return o=l.call(o),g(e,r,o,c)}if(typeof o.then==`function`)return b(e,r,Fa(o),c);if(o.$$typeof===C)return b(e,r,ra(e,o),c);La(e,o)}return typeof o==`string`&&o!==``||typeof o==`number`||typeof o==`bigint`?(o=``+o,r!==null&&r.tag===6?(n(e,r.sibling),c=a(r,o),c.return=e,e=c):(n(e,r),c=gi(o,e.mode,c),c.return=e,e=c),s(e)):n(e,r)}return function(e,t,n,r){try{Pa=0;var i=b(e,t,n,r);return Na=null,i}catch(t){if(t===Ca||t===Ta)throw t;var a=ui(29,t,null,e.mode);return a.lanes=r,a.return=e,a}}}var za=Ra(!0),Ba=Ra(!1),Va=!1;function Ha(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function Ua(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function Wa(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function Ga(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,G&2){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,t=si(e),oi(e,null,n),t}return ri(e,r,t,n),si(e)}function Ka(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,n&4194048)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,st(e,n)}}function qa(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var o={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?i=a=o:a=a.next=o,n=n.next}while(n!==null);a===null?i=a=t:a=a.next=t}else i=a=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:a,shared:r.shared,callbacks:r.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var Ja=!1;function Ya(){if(Ja){var e=ma;if(e!==null)throw e}}function Xa(e,t,n,r){Ja=!1;var i=e.updateQueue;Va=!1;var a=i.firstBaseUpdate,o=i.lastBaseUpdate,s=i.shared.pending;if(s!==null){i.shared.pending=null;var c=s,l=c.next;c.next=null,o===null?a=l:o.next=l,o=c;var u=e.alternate;u!==null&&(u=u.updateQueue,s=u.lastBaseUpdate,s!==o&&(s===null?u.firstBaseUpdate=l:s.next=l,u.lastBaseUpdate=c))}if(a!==null){var d=i.baseState;o=0,u=l=c=null,s=a;do{var f=s.lane&-536870913,p=f!==s.lane;if(p?(J&f)===f:(r&f)===f){f!==0&&f===pa&&(Ja=!0),u!==null&&(u=u.next={lane:0,tag:s.tag,payload:s.payload,callback:null,next:null});a:{var h=e,g=s;f=t;var _=n;switch(g.tag){case 1:if(h=g.payload,typeof h==`function`){d=h.call(_,d,f);break a}d=h;break a;case 3:h.flags=h.flags&-65537|128;case 0:if(h=g.payload,f=typeof h==`function`?h.call(_,d,f):h,f==null)break a;d=m({},d,f);break a;case 2:Va=!0}}f=s.callback,f!==null&&(e.flags|=64,p&&(e.flags|=8192),p=i.callbacks,p===null?i.callbacks=[f]:p.push(f))}else p={lane:f,tag:s.tag,payload:s.payload,callback:s.callback,next:null},u===null?(l=u=p,c=d):u=u.next=p,o|=f;if(s=s.next,s===null){if(s=i.shared.pending,s===null)break;p=s,s=p.next,p.next=null,i.lastBaseUpdate=p,i.shared.pending=null}}while(1);u===null&&(c=d),i.baseState=c,i.firstBaseUpdate=l,i.lastBaseUpdate=u,a===null&&(i.shared.lanes=0),Kl|=o,e.lanes=o,e.memoizedState=d}}function Za(e,t){if(typeof e!=`function`)throw Error(i(191,e));e.call(t)}function Qa(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)Za(n[e],t)}var $a=fe(null),eo=fe(0);function to(e,t){e=Wl,A(eo,e),A($a,t),Wl=e|t.baseLanes}function no(){A(eo,Wl),A($a,$a.current)}function ro(){Wl=eo.current,k($a),k(eo)}var io=fe(null),ao=null;function oo(e){var t=e.alternate;A(fo,fo.current&1),A(io,e),ao===null&&(t===null||$a.current!==null||t.memoizedState!==null)&&(ao=e)}function so(e){A(fo,fo.current),A(io,e),ao===null&&(ao=e)}function co(e){e.tag===22?(A(fo,fo.current),A(io,e),ao===null&&(ao=e)):lo(e)}function lo(){A(fo,fo.current),A(io,io.current)}function uo(e){k(io),ao===e&&(ao=null),k(fo)}var fo=fe(0);function po(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||af(n)||of(n)))return t}else if(t.tag===19&&(t.memoizedProps.revealOrder===`forwards`||t.memoizedProps.revealOrder===`backwards`||t.memoizedProps.revealOrder===`unstable_legacy-backwards`||t.memoizedProps.revealOrder===`together`)){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var mo=0,z=null,B=null,V=null,ho=!1,go=!1,_o=!1,vo=0,yo=0,bo=null,xo=0;function So(){throw Error(i(321))}function Co(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Er(e[n],t[n]))return!1;return!0}function wo(e,t,n,r,i,a){return mo=a,z=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,D.H=e===null||e.memoizedState===null?Bs:Vs,_o=!1,a=n(r,i),_o=!1,go&&(a=Eo(t,n,r,i)),To(e),a}function To(e){D.H=zs;var t=B!==null&&B.next!==null;if(mo=0,V=B=z=null,ho=!1,yo=0,bo=null,t)throw Error(i(300));e===null||ic||(e=e.dependencies,e!==null&&ea(e)&&(ic=!0))}function Eo(e,t,n,r){z=e;var a=0;do{if(go&&(bo=null),yo=0,go=!1,25<=a)throw Error(i(301));if(a+=1,V=B=null,e.updateQueue!=null){var o=e.updateQueue;o.lastEffect=null,o.events=null,o.stores=null,o.memoCache!=null&&(o.memoCache.index=0)}D.H=Hs,o=t(n,r)}while(go);return o}function Do(){var e=D.H,t=e.useState()[0];return t=typeof t.then==`function`?No(t):t,e=e.useState()[0],(B===null?null:B.memoizedState)!==e&&(z.flags|=1024),t}function Oo(){var e=vo!==0;return vo=0,e}function ko(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Ao(e){if(ho){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}ho=!1}mo=0,V=B=z=null,go=!1,yo=vo=0,bo=null}function jo(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return V===null?z.memoizedState=V=e:V=V.next=e,V}function H(){if(B===null){var e=z.alternate;e=e===null?null:e.memoizedState}else e=B.next;var t=V===null?z.memoizedState:V.next;if(t!==null)V=t,B=e;else{if(e===null)throw z.alternate===null?Error(i(467)):Error(i(310));B=e,e={memoizedState:B.memoizedState,baseState:B.baseState,baseQueue:B.baseQueue,queue:B.queue,next:null},V===null?z.memoizedState=V=e:V=V.next=e}return V}function Mo(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function No(e){var t=yo;return yo+=1,bo===null&&(bo=[]),e=Oa(bo,e,t),t=z,(V===null?t.memoizedState:V.next)===null&&(t=t.alternate,D.H=t===null||t.memoizedState===null?Bs:Vs),e}function Po(e){if(typeof e==`object`&&e){if(typeof e.then==`function`)return No(e);if(e.$$typeof===C)return na(e)}throw Error(i(438,String(e)))}function Fo(e){var t=null,n=z.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var r=z.alternate;r!==null&&(r=r.updateQueue,r!==null&&(r=r.memoCache,r!=null&&(t={data:r.data.map(function(e){return e.slice()}),index:0})))}if(t??={data:[],index:0},n===null&&(n=Mo(),z.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),r=0;r<e;r++)n[r]=re;return t.index++,n}function Io(e,t){return typeof t==`function`?t(e):t}function Lo(e){return Ro(H(),B,e)}function Ro(e,t,n){var r=e.queue;if(r===null)throw Error(i(311));r.lastRenderedReducer=n;var a=e.baseQueue,o=r.pending;if(o!==null){if(a!==null){var s=a.next;a.next=o.next,o.next=s}t.baseQueue=a=o,r.pending=null}if(o=e.baseState,a===null)e.memoizedState=o;else{t=a.next;var c=s=null,l=null,u=t,d=!1;do{var f=u.lane&-536870913;if(f===u.lane?(mo&f)===f:(J&f)===f){var p=u.revertLane;if(p===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null}),f===pa&&(d=!0);else if((mo&p)===p){u=u.next,p===pa&&(d=!0);continue}else f={lane:0,revertLane:u.revertLane,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=f,s=o):l=l.next=f,z.lanes|=p,Kl|=p;f=u.action,_o&&n(o,f),o=u.hasEagerState?u.eagerState:n(o,f)}else p={lane:f,revertLane:u.revertLane,gesture:u.gesture,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=p,s=o):l=l.next=p,z.lanes|=f,Kl|=f;u=u.next}while(u!==null&&u!==t);if(l===null?s=o:l.next=c,!Er(o,e.memoizedState)&&(ic=!0,d&&(n=ma,n!==null)))throw n;e.memoizedState=o,e.baseState=s,e.baseQueue=l,r.lastRenderedState=o}return a===null&&(r.lanes=0),[e.memoizedState,r.dispatch]}function zo(e){var t=H(),n=t.queue;if(n===null)throw Error(i(311));n.lastRenderedReducer=e;var r=n.dispatch,a=n.pending,o=t.memoizedState;if(a!==null){n.pending=null;var s=a=a.next;do o=e(o,s.action),s=s.next;while(s!==a);Er(o,t.memoizedState)||(ic=!0),t.memoizedState=o,t.baseQueue===null&&(t.baseState=o),n.lastRenderedState=o}return[o,r]}function Bo(e,t,n){var r=z,a=H(),o=R;if(o){if(n===void 0)throw Error(i(407));n=n()}else n=t();var s=!Er((B||a).memoizedState,n);if(s&&(a.memoizedState=n,ic=!0),a=a.queue,ds(Uo.bind(null,r,a,e),[e]),a.getSnapshot!==t||s||V!==null&&V.memoizedState.tag&1){if(r.flags|=2048,os(9,{destroy:void 0},Ho.bind(null,r,a,n,t),null),K===null)throw Error(i(349));o||mo&127||Vo(r,t,n)}return n}function Vo(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=z.updateQueue,t===null?(t=Mo(),z.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Ho(e,t,n,r){t.value=n,t.getSnapshot=r,Wo(t)&&Go(e)}function Uo(e,t,n){return n(function(){Wo(t)&&Go(e)})}function Wo(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Er(e,n)}catch{return!0}}function Go(e){var t=ai(e,2);t!==null&&gu(t,e,2)}function Ko(e){var t=jo();if(typeof e==`function`){var n=e;if(e=n(),_o){We(!0);try{n()}finally{We(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Io,lastRenderedState:e},t}function qo(e,t,n,r){return e.baseState=n,Ro(e,B,typeof r==`function`?r:Io)}function Jo(e,t,n,r,a){if(Is(e))throw Error(i(485));if(e=t.action,e!==null){var o={payload:a,action:e,next:null,isTransition:!0,status:`pending`,value:null,reason:null,listeners:[],then:function(e){o.listeners.push(e)}};D.T===null?o.isTransition=!1:n(!0),r(o),n=t.pending,n===null?(o.next=t.pending=o,Yo(t,o)):(o.next=n.next,t.pending=n.next=o)}}function Yo(e,t){var n=t.action,r=t.payload,i=e.state;if(t.isTransition){var a=D.T,o={};D.T=o;try{var s=n(i,r),c=D.S;c!==null&&c(o,s),Xo(e,t,s)}catch(n){Qo(e,t,n)}finally{a!==null&&o.types!==null&&(a.types=o.types),D.T=a}}else try{a=n(i,r),Xo(e,t,a)}catch(n){Qo(e,t,n)}}function Xo(e,t,n){typeof n==`object`&&n&&typeof n.then==`function`?n.then(function(n){Zo(e,t,n)},function(n){return Qo(e,t,n)}):Zo(e,t,n)}function Zo(e,t,n){t.status=`fulfilled`,t.value=n,$o(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,Yo(e,n)))}function Qo(e,t,n){var r=e.pending;if(e.pending=null,r!==null){r=r.next;do t.status=`rejected`,t.reason=n,$o(t),t=t.next;while(t!==r)}e.action=null}function $o(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function es(e,t){return t}function ts(e,t){if(R){var n=K.formState;if(n!==null){a:{var r=z;if(R){if(L){b:{for(var i=L,a=Li;i.nodeType!==8;){if(!a){i=null;break b}if(i=cf(i.nextSibling),i===null){i=null;break b}}a=i.data,i=a===`F!`||a===`F`?i:null}if(i){L=cf(i.nextSibling),r=i.data===`F!`;break a}}zi(r)}r=!1}r&&(t=n[0])}}return n=jo(),n.memoizedState=n.baseState=t,r={pending:null,lanes:0,dispatch:null,lastRenderedReducer:es,lastRenderedState:t},n.queue=r,n=Ns.bind(null,z,r),r.dispatch=n,r=Ko(!1),a=Fs.bind(null,z,!1,r.queue),r=jo(),i={state:t,dispatch:null,action:e,pending:null},r.queue=i,n=Jo.bind(null,z,i,a,n),i.dispatch=n,r.memoizedState=e,[t,n,!1]}function ns(e){return rs(H(),B,e)}function rs(e,t,n){if(t=Ro(e,t,es)[0],e=Lo(Io)[0],typeof t==`object`&&t&&typeof t.then==`function`)try{var r=No(t)}catch(e){throw e===Ca?Ta:e}else r=t;t=H();var i=t.queue,a=i.dispatch;return n!==t.memoizedState&&(z.flags|=2048,os(9,{destroy:void 0},is.bind(null,i,n),null)),[r,a,e]}function is(e,t){e.action=t}function as(e){var t=H(),n=B;if(n!==null)return rs(t,n,e);H(),t=t.memoizedState,n=H();var r=n.queue.dispatch;return n.memoizedState=e,[t,r,!1]}function os(e,t,n,r){return e={tag:e,create:n,deps:r,inst:t,next:null},t=z.updateQueue,t===null&&(t=Mo(),z.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e),e}function ss(){return H().memoizedState}function cs(e,t,n,r){var i=jo();z.flags|=e,i.memoizedState=os(1|t,{destroy:void 0},n,r===void 0?null:r)}function ls(e,t,n,r){var i=H();r=r===void 0?null:r;var a=i.memoizedState.inst;B!==null&&r!==null&&Co(r,B.memoizedState.deps)?i.memoizedState=os(t,a,n,r):(z.flags|=e,i.memoizedState=os(1|t,a,n,r))}function us(e,t){cs(8390656,8,e,t)}function ds(e,t){ls(2048,8,e,t)}function fs(e){z.flags|=4;var t=z.updateQueue;if(t===null)t=Mo(),z.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function ps(e){var t=H().memoizedState;return fs({ref:t,nextImpl:e}),function(){if(G&2)throw Error(i(440));return t.impl.apply(void 0,arguments)}}function ms(e,t){return ls(4,2,e,t)}function hs(e,t){return ls(4,4,e,t)}function gs(e,t){if(typeof t==`function`){e=e();var n=t(e);return function(){typeof n==`function`?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function _s(e,t,n){n=n==null?null:n.concat([e]),ls(4,4,gs.bind(null,t,e),n)}function vs(){}function ys(e,t){var n=H();t=t===void 0?null:t;var r=n.memoizedState;return t!==null&&Co(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function bs(e,t){var n=H();t=t===void 0?null:t;var r=n.memoizedState;if(t!==null&&Co(t,r[1]))return r[0];if(r=e(),_o){We(!0);try{e()}finally{We(!1)}}return n.memoizedState=[r,t],r}function xs(e,t,n){return n===void 0||mo&1073741824&&!(J&261930)?e.memoizedState=t:(e.memoizedState=n,e=hu(),z.lanes|=e,Kl|=e,n)}function Ss(e,t,n,r){return Er(n,t)?n:$a.current===null?!(mo&42)||mo&1073741824&&!(J&261930)?(ic=!0,e.memoizedState=n):(e=hu(),z.lanes|=e,Kl|=e,t):(e=xs(e,n,r),Er(e,t)||(ic=!0),e)}function Cs(e,t,n,r,i){var a=O.p;O.p=a!==0&&8>a?a:8;var o=D.T,s={};D.T=s,Fs(e,!1,t,n);try{var c=i(),l=D.S;l!==null&&l(s,c),typeof c==`object`&&c&&typeof c.then==`function`?Ps(e,t,_a(c,r),mu(e)):Ps(e,t,r,mu(e))}catch(n){Ps(e,t,{then:function(){},status:`rejected`,reason:n},mu())}finally{O.p=a,o!==null&&s.types!==null&&(o.types=s.types),D.T=o}}function ws(){}function Ts(e,t,n,r){if(e.tag!==5)throw Error(i(476));var a=Es(e).queue;Cs(e,a,t,le,n===null?ws:function(){return Ds(e),n(r)})}function Es(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:le,baseState:le,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Io,lastRenderedState:le},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Io,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function Ds(e){var t=Es(e);t.next===null&&(t=e.alternate.memoizedState),Ps(e,t.next.queue,{},mu())}function Os(){return na(Qf)}function ks(){return H().memoizedState}function As(){return H().memoizedState}function js(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=mu();e=Wa(n);var r=Ga(t,e,n);r!==null&&(gu(r,t,n),Ka(r,t,n)),t={cache:la()},e.payload=t;return}t=t.return}}function Ms(e,t,n){var r=mu();n={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Is(e)?Ls(t,n):(n=ii(e,t,n,r),n!==null&&(gu(n,e,r),Rs(n,t,r)))}function Ns(e,t,n){Ps(e,t,n,mu())}function Ps(e,t,n,r){var i={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Is(e))Ls(t,i);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var o=t.lastRenderedState,s=a(o,n);if(i.hasEagerState=!0,i.eagerState=s,Er(s,o))return ri(e,t,i,0),K===null&&ni(),!1}catch{}if(n=ii(e,t,i,r),n!==null)return gu(n,e,r),Rs(n,t,r),!0}return!1}function Fs(e,t,n,r){if(r={lane:2,revertLane:dd(),gesture:null,action:r,hasEagerState:!1,eagerState:null,next:null},Is(e)){if(t)throw Error(i(479))}else t=ii(e,n,r,2),t!==null&&gu(t,e,2)}function Is(e){var t=e.alternate;return e===z||t!==null&&t===z}function Ls(e,t){go=ho=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Rs(e,t,n){if(n&4194048){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,st(e,n)}}var zs={readContext:na,use:Po,useCallback:So,useContext:So,useEffect:So,useImperativeHandle:So,useLayoutEffect:So,useInsertionEffect:So,useMemo:So,useReducer:So,useRef:So,useState:So,useDebugValue:So,useDeferredValue:So,useTransition:So,useSyncExternalStore:So,useId:So,useHostTransitionStatus:So,useFormState:So,useActionState:So,useOptimistic:So,useMemoCache:So,useCacheRefresh:So};zs.useEffectEvent=So;var Bs={readContext:na,use:Po,useCallback:function(e,t){return jo().memoizedState=[e,t===void 0?null:t],e},useContext:na,useEffect:us,useImperativeHandle:function(e,t,n){n=n==null?null:n.concat([e]),cs(4194308,4,gs.bind(null,t,e),n)},useLayoutEffect:function(e,t){return cs(4194308,4,e,t)},useInsertionEffect:function(e,t){cs(4,2,e,t)},useMemo:function(e,t){var n=jo();t=t===void 0?null:t;var r=e();if(_o){We(!0);try{e()}finally{We(!1)}}return n.memoizedState=[r,t],r},useReducer:function(e,t,n){var r=jo();if(n!==void 0){var i=n(t);if(_o){We(!0);try{n(t)}finally{We(!1)}}}else i=t;return r.memoizedState=r.baseState=i,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:i},r.queue=e,e=e.dispatch=Ms.bind(null,z,e),[r.memoizedState,e]},useRef:function(e){var t=jo();return e={current:e},t.memoizedState=e},useState:function(e){e=Ko(e);var t=e.queue,n=Ns.bind(null,z,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:vs,useDeferredValue:function(e,t){return xs(jo(),e,t)},useTransition:function(){var e=Ko(!1);return e=Cs.bind(null,z,e.queue,!0,!1),jo().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var r=z,a=jo();if(R){if(n===void 0)throw Error(i(407));n=n()}else{if(n=t(),K===null)throw Error(i(349));J&127||Vo(r,t,n)}a.memoizedState=n;var o={value:n,getSnapshot:t};return a.queue=o,us(Uo.bind(null,r,o,e),[e]),r.flags|=2048,os(9,{destroy:void 0},Ho.bind(null,r,o,n,t),null),n},useId:function(){var e=jo(),t=K.identifierPrefix;if(R){var n=ki,r=Oi;n=(r&~(1<<32-Ge(r)-1)).toString(32)+n,t=`_`+t+`R_`+n,n=vo++,0<n&&(t+=`H`+n.toString(32)),t+=`_`}else n=xo++,t=`_`+t+`r_`+n.toString(32)+`_`;return e.memoizedState=t},useHostTransitionStatus:Os,useFormState:ts,useActionState:ts,useOptimistic:function(e){var t=jo();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=Fs.bind(null,z,!0,n),n.dispatch=t,[e,t]},useMemoCache:Fo,useCacheRefresh:function(){return jo().memoizedState=js.bind(null,z)},useEffectEvent:function(e){var t=jo(),n={impl:e};return t.memoizedState=n,function(){if(G&2)throw Error(i(440));return n.impl.apply(void 0,arguments)}}},Vs={readContext:na,use:Po,useCallback:ys,useContext:na,useEffect:ds,useImperativeHandle:_s,useInsertionEffect:ms,useLayoutEffect:hs,useMemo:bs,useReducer:Lo,useRef:ss,useState:function(){return Lo(Io)},useDebugValue:vs,useDeferredValue:function(e,t){return Ss(H(),B.memoizedState,e,t)},useTransition:function(){var e=Lo(Io)[0],t=H().memoizedState;return[typeof e==`boolean`?e:No(e),t]},useSyncExternalStore:Bo,useId:ks,useHostTransitionStatus:Os,useFormState:ns,useActionState:ns,useOptimistic:function(e,t){return qo(H(),B,e,t)},useMemoCache:Fo,useCacheRefresh:As};Vs.useEffectEvent=ps;var Hs={readContext:na,use:Po,useCallback:ys,useContext:na,useEffect:ds,useImperativeHandle:_s,useInsertionEffect:ms,useLayoutEffect:hs,useMemo:bs,useReducer:zo,useRef:ss,useState:function(){return zo(Io)},useDebugValue:vs,useDeferredValue:function(e,t){var n=H();return B===null?xs(n,e,t):Ss(n,B.memoizedState,e,t)},useTransition:function(){var e=zo(Io)[0],t=H().memoizedState;return[typeof e==`boolean`?e:No(e),t]},useSyncExternalStore:Bo,useId:ks,useHostTransitionStatus:Os,useFormState:as,useActionState:as,useOptimistic:function(e,t){var n=H();return B===null?(n.baseState=e,[e,n.queue.dispatch]):qo(n,B,e,t)},useMemoCache:Fo,useCacheRefresh:As};Hs.useEffectEvent=ps;function Us(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:m({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Ws={enqueueSetState:function(e,t,n){e=e._reactInternals;var r=mu(),i=Wa(r);i.payload=t,n!=null&&(i.callback=n),t=Ga(e,i,r),t!==null&&(gu(t,e,r),Ka(t,e,r))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=mu(),i=Wa(r);i.tag=1,i.payload=t,n!=null&&(i.callback=n),t=Ga(e,i,r),t!==null&&(gu(t,e,r),Ka(t,e,r))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=mu(),r=Wa(n);r.tag=2,t!=null&&(r.callback=t),t=Ga(e,r,n),t!==null&&(gu(t,e,n),Ka(t,e,n))}};function Gs(e,t,n,r,i,a,o){return e=e.stateNode,typeof e.shouldComponentUpdate==`function`?e.shouldComponentUpdate(r,a,o):t.prototype&&t.prototype.isPureReactComponent?!Dr(n,r)||!Dr(i,a):!0}function Ks(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps==`function`&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps==`function`&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Ws.enqueueReplaceState(t,t.state,null)}function qs(e,t){var n=t;if(`ref`in t)for(var r in n={},t)r!==`ref`&&(n[r]=t[r]);if(e=e.defaultProps)for(var i in n===t&&(n=m({},n)),e)n[i]===void 0&&(n[i]=e[i]);return n}function Js(e){Qr(e)}function Ys(e){console.error(e)}function Xs(e){Qr(e)}function Zs(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(e){setTimeout(function(){throw e})}}function Qs(e,t,n){try{var r=e.onCaughtError;r(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(e){setTimeout(function(){throw e})}}function $s(e,t,n){return n=Wa(n),n.tag=3,n.payload={element:null},n.callback=function(){Zs(e,t)},n}function ec(e){return e=Wa(e),e.tag=3,e}function tc(e,t,n,r){var i=n.type.getDerivedStateFromError;if(typeof i==`function`){var a=r.value;e.payload=function(){return i(a)},e.callback=function(){Qs(t,n,r)}}var o=n.stateNode;o!==null&&typeof o.componentDidCatch==`function`&&(e.callback=function(){Qs(t,n,r),typeof i!=`function`&&(iu===null?iu=new Set([this]):iu.add(this));var e=r.stack;this.componentDidCatch(r.value,{componentStack:e===null?``:e})})}function nc(e,t,n,r,a){if(n.flags|=32768,typeof r==`object`&&r&&typeof r.then==`function`){if(t=n.alternate,t!==null&&$i(t,n,a,!0),n=io.current,n!==null){switch(n.tag){case 31:case 13:return ao===null?Du():n.alternate===null&&Gl===0&&(Gl=3),n.flags&=-257,n.flags|=65536,n.lanes=a,r===Ea?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([r]):t.add(r),Gu(e,r,a)),!1;case 22:return n.flags|=65536,r===Ea?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([r])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([r]):n.add(r)),Gu(e,r,a)),!1}throw Error(i(435,n.tag))}return Gu(e,r,a),Du(),!1}if(R)return t=io.current,t===null?(r!==Ri&&(t=Error(i(423),{cause:r}),Gi(bi(t,n))),e=e.current.alternate,e.flags|=65536,a&=-a,e.lanes|=a,r=bi(r,n),a=$s(e.stateNode,r,a),qa(e,a),Gl!==4&&(Gl=2)):(!(t.flags&65536)&&(t.flags|=256),t.flags|=65536,t.lanes=a,r!==Ri&&(e=Error(i(422),{cause:r}),Gi(bi(e,n)))),!1;var o=Error(i(520),{cause:r});if(o=bi(o,n),Zl===null?Zl=[o]:Zl.push(o),Gl!==4&&(Gl=2),t===null)return!0;r=bi(r,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=a&-a,n.lanes|=e,e=$s(n.stateNode,r,e),qa(n,e),!1;case 1:if(t=n.type,o=n.stateNode,!(n.flags&128)&&(typeof t.getDerivedStateFromError==`function`||o!==null&&typeof o.componentDidCatch==`function`&&(iu===null||!iu.has(o))))return n.flags|=65536,a&=-a,n.lanes|=a,a=ec(a),tc(a,e,n,r),qa(n,a),!1}n=n.return}while(n!==null);return!1}var rc=Error(i(461)),ic=!1;function ac(e,t,n,r){t.child=e===null?Ba(t,null,n,r):za(t,e.child,n,r)}function oc(e,t,n,r,i){n=n.render;var a=t.ref;if(`ref`in r){var o={};for(var s in r)s!==`ref`&&(o[s]=r[s])}else o=r;return ta(t),r=wo(e,t,n,o,a,i),s=Oo(),e!==null&&!ic?(ko(e,t,i),Ac(e,t,i)):(R&&s&&Mi(t),t.flags|=1,ac(e,t,r,i),t.child)}function sc(e,t,n,r,i){if(e===null){var a=n.type;return typeof a==`function`&&!di(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,cc(e,t,a,r,i)):(e=mi(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!jc(e,i)){var o=a.memoizedProps;if(n=n.compare,n=n===null?Dr:n,n(o,r)&&e.ref===t.ref)return Ac(e,t,i)}return t.flags|=1,e=fi(a,r),e.ref=t.ref,e.return=t,t.child=e}function cc(e,t,n,r,i){if(e!==null){var a=e.memoizedProps;if(Dr(a,r)&&e.ref===t.ref)if(ic=!1,t.pendingProps=r=a,jc(e,i))e.flags&131072&&(ic=!0);else return t.lanes=e.lanes,Ac(e,t,i)}return gc(e,t,n,r,i)}function lc(e,t,n,r){var i=r.children,a=e===null?null:e.memoizedState;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),r.mode===`hidden`){if(t.flags&128){if(a=a===null?n:a.baseLanes|n,e!==null){for(r=t.child=e.child,i=0;r!==null;)i=i|r.lanes|r.childLanes,r=r.sibling;r=i&~a}else r=0,t.child=null;return dc(e,t,a,n,r)}if(n&536870912)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&xa(t,a===null?null:a.cachePool),a===null?no():to(t,a),co(t);else return r=t.lanes=536870912,dc(e,t,a===null?n:a.baseLanes|n,n,r)}else a===null?(e!==null&&xa(t,null),no(),lo(t)):(xa(t,a.cachePool),to(t,a),lo(t),t.memoizedState=null);return ac(e,t,i,n),t.child}function uc(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function dc(e,t,n,r,i){var a=ba();return a=a===null?null:{parent:ca._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&xa(t,null),no(),co(t),e!==null&&$i(e,t,r,!0),t.childLanes=i,null}function fc(e,t){return t=Tc({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function pc(e,t,n){return za(t,e.child,null,n),e=fc(t,t.pendingProps),e.flags|=2,uo(t),t.memoizedState=null,e}function mc(e,t,n){var r=t.pendingProps,a=(t.flags&128)!=0;if(t.flags&=-129,e===null){if(R){if(r.mode===`hidden`)return e=fc(t,r),t.lanes=536870912,uc(null,e);if(so(t),(e=L)?(e=rf(e,Li),e=e!==null&&e.data===`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Di===null?null:{id:Oi,overflow:ki},retryLane:536870912,hydrationErrors:null},n=_i(e),n.return=t,t.child=n,Fi=t,L=null)):e=null,e===null)throw zi(t);return t.lanes=536870912,null}return fc(t,r)}var o=e.memoizedState;if(o!==null){var s=o.dehydrated;if(so(t),a)if(t.flags&256)t.flags&=-257,t=pc(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(i(558));else if(ic||$i(e,t,n,!1),a=(n&e.childLanes)!==0,ic||a){if(r=K,r!==null&&(s=ct(r,n),s!==0&&s!==o.retryLane))throw o.retryLane=s,ai(e,s),gu(r,e,s),rc;Du(),t=pc(e,t,n)}else e=o.treeContext,L=cf(s.nextSibling),Fi=t,R=!0,Ii=null,Li=!1,e!==null&&Pi(t,e),t=fc(t,r),t.flags|=4096;return t}return e=fi(e.child,{mode:r.mode,children:r.children}),e.ref=t.ref,t.child=e,e.return=t,e}function hc(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!=`function`&&typeof n!=`object`)throw Error(i(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function gc(e,t,n,r,i){return ta(t),n=wo(e,t,n,r,void 0,i),r=Oo(),e!==null&&!ic?(ko(e,t,i),Ac(e,t,i)):(R&&r&&Mi(t),t.flags|=1,ac(e,t,n,i),t.child)}function _c(e,t,n,r,i,a){return ta(t),t.updateQueue=null,n=Eo(t,r,n,i),To(e),r=Oo(),e!==null&&!ic?(ko(e,t,a),Ac(e,t,a)):(R&&r&&Mi(t),t.flags|=1,ac(e,t,n,a),t.child)}function vc(e,t,n,r,i){if(ta(t),t.stateNode===null){var a=ci,o=n.contextType;typeof o==`object`&&o&&(a=na(o)),a=new n(r,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=Ws,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=r,a.state=t.memoizedState,a.refs={},Ha(t),o=n.contextType,a.context=typeof o==`object`&&o?na(o):ci,a.state=t.memoizedState,o=n.getDerivedStateFromProps,typeof o==`function`&&(Us(t,n,o,r),a.state=t.memoizedState),typeof n.getDerivedStateFromProps==`function`||typeof a.getSnapshotBeforeUpdate==`function`||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(o=a.state,typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount(),o!==a.state&&Ws.enqueueReplaceState(a,a.state,null),Xa(t,r,a,i),Ya(),a.state=t.memoizedState),typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!0}else if(e===null){a=t.stateNode;var s=t.memoizedProps,c=qs(n,s);a.props=c;var l=a.context,u=n.contextType;o=ci,typeof u==`object`&&u&&(o=na(u));var d=n.getDerivedStateFromProps;u=typeof d==`function`||typeof a.getSnapshotBeforeUpdate==`function`,s=t.pendingProps!==s,u||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(s||l!==o)&&Ks(t,a,r,o),Va=!1;var f=t.memoizedState;a.state=f,Xa(t,r,a,i),Ya(),l=t.memoizedState,s||f!==l||Va?(typeof d==`function`&&(Us(t,n,d,r),l=t.memoizedState),(c=Va||Gs(t,n,c,r,f,l,o))?(u||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount==`function`&&(t.flags|=4194308)):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=l),a.props=r,a.state=l,a.context=o,r=c):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!1)}else{a=t.stateNode,Ua(e,t),o=t.memoizedProps,u=qs(n,o),a.props=u,d=t.pendingProps,f=a.context,l=n.contextType,c=ci,typeof l==`object`&&l&&(c=na(l)),s=n.getDerivedStateFromProps,(l=typeof s==`function`||typeof a.getSnapshotBeforeUpdate==`function`)||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(o!==d||f!==c)&&Ks(t,a,r,c),Va=!1,f=t.memoizedState,a.state=f,Xa(t,r,a,i),Ya();var p=t.memoizedState;o!==d||f!==p||Va||e!==null&&e.dependencies!==null&&ea(e.dependencies)?(typeof s==`function`&&(Us(t,n,s,r),p=t.memoizedState),(u=Va||Gs(t,n,u,r,f,p,c)||e!==null&&e.dependencies!==null&&ea(e.dependencies))?(l||typeof a.UNSAFE_componentWillUpdate!=`function`&&typeof a.componentWillUpdate!=`function`||(typeof a.componentWillUpdate==`function`&&a.componentWillUpdate(r,p,c),typeof a.UNSAFE_componentWillUpdate==`function`&&a.UNSAFE_componentWillUpdate(r,p,c)),typeof a.componentDidUpdate==`function`&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate==`function`&&(t.flags|=1024)):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=p),a.props=r,a.state=p,a.context=c,r=u):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),r=!1)}return a=r,hc(e,t),r=(t.flags&128)!=0,a||r?(a=t.stateNode,n=r&&typeof n.getDerivedStateFromError!=`function`?null:a.render(),t.flags|=1,e!==null&&r?(t.child=za(t,e.child,null,i),t.child=za(t,null,n,i)):ac(e,t,n,i),t.memoizedState=a.state,e=t.child):e=Ac(e,t,i),e}function yc(e,t,n,r){return Ui(),t.flags|=256,ac(e,t,n,r),t.child}var bc={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function xc(e){return{baseLanes:e,cachePool:Sa()}}function Sc(e,t,n){return e=e===null?0:e.childLanes&~n,t&&(e|=Yl),e}function Cc(e,t,n){var r=t.pendingProps,a=!1,o=(t.flags&128)!=0,s;if((s=o)||(s=e!==null&&e.memoizedState===null?!1:(fo.current&2)!=0),s&&(a=!0,t.flags&=-129),s=(t.flags&32)!=0,t.flags&=-33,e===null){if(R){if(a?oo(t):lo(t),(e=L)?(e=rf(e,Li),e=e!==null&&e.data!==`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Di===null?null:{id:Oi,overflow:ki},retryLane:536870912,hydrationErrors:null},n=_i(e),n.return=t,t.child=n,Fi=t,L=null)):e=null,e===null)throw zi(t);return of(e)?t.lanes=32:t.lanes=536870912,null}var c=r.children;return r=r.fallback,a?(lo(t),a=t.mode,c=Tc({mode:`hidden`,children:c},a),r=hi(r,a,n,null),c.return=t,r.return=t,c.sibling=r,t.child=c,r=t.child,r.memoizedState=xc(n),r.childLanes=Sc(e,s,n),t.memoizedState=bc,uc(null,r)):(oo(t),wc(t,c))}var l=e.memoizedState;if(l!==null&&(c=l.dehydrated,c!==null)){if(o)t.flags&256?(oo(t),t.flags&=-257,t=Ec(e,t,n)):t.memoizedState===null?(lo(t),c=r.fallback,a=t.mode,r=Tc({mode:`visible`,children:r.children},a),c=hi(c,a,n,null),c.flags|=2,r.return=t,c.return=t,r.sibling=c,t.child=r,za(t,e.child,null,n),r=t.child,r.memoizedState=xc(n),r.childLanes=Sc(e,s,n),t.memoizedState=bc,t=uc(null,r)):(lo(t),t.child=e.child,t.flags|=128,t=null);else if(oo(t),of(c)){if(s=c.nextSibling&&c.nextSibling.dataset,s)var u=s.dgst;s=u,r=Error(i(419)),r.stack=``,r.digest=s,Gi({value:r,source:null,stack:null}),t=Ec(e,t,n)}else if(ic||$i(e,t,n,!1),s=(n&e.childLanes)!==0,ic||s){if(s=K,s!==null&&(r=ct(s,n),r!==0&&r!==l.retryLane))throw l.retryLane=r,ai(e,r),gu(s,e,r),rc;af(c)||Du(),t=Ec(e,t,n)}else af(c)?(t.flags|=192,t.child=e.child,t=null):(e=l.treeContext,L=cf(c.nextSibling),Fi=t,R=!0,Ii=null,Li=!1,e!==null&&Pi(t,e),t=wc(t,r.children),t.flags|=4096);return t}return a?(lo(t),c=r.fallback,a=t.mode,l=e.child,u=l.sibling,r=fi(l,{mode:`hidden`,children:r.children}),r.subtreeFlags=l.subtreeFlags&65011712,u===null?(c=hi(c,a,n,null),c.flags|=2):c=fi(u,c),c.return=t,r.return=t,r.sibling=c,t.child=r,uc(null,r),r=t.child,c=e.child.memoizedState,c===null?c=xc(n):(a=c.cachePool,a===null?a=Sa():(l=ca._currentValue,a=a.parent===l?a:{parent:l,pool:l}),c={baseLanes:c.baseLanes|n,cachePool:a}),r.memoizedState=c,r.childLanes=Sc(e,s,n),t.memoizedState=bc,uc(e.child,r)):(oo(t),n=e.child,e=n.sibling,n=fi(n,{mode:`visible`,children:r.children}),n.return=t,n.sibling=null,e!==null&&(s=t.deletions,s===null?(t.deletions=[e],t.flags|=16):s.push(e)),t.child=n,t.memoizedState=null,n)}function wc(e,t){return t=Tc({mode:`visible`,children:t},e.mode),t.return=e,e.child=t}function Tc(e,t){return e=ui(22,e,null,t),e.lanes=0,e}function Ec(e,t,n){return za(t,e.child,null,n),e=wc(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Dc(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),Zi(e.return,t,n)}function Oc(e,t,n,r,i,a){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i,treeForkCount:a}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=i,o.treeForkCount=a)}function kc(e,t,n){var r=t.pendingProps,i=r.revealOrder,a=r.tail;r=r.children;var o=fo.current,s=(o&2)!=0;if(s?(o=o&1|2,t.flags|=128):o&=1,A(fo,o),ac(e,t,r,n),r=R?wi:0,!s&&e!==null&&e.flags&128)a:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Dc(e,n,t);else if(e.tag===19)Dc(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break a;for(;e.sibling===null;){if(e.return===null||e.return===t)break a;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(i){case`forwards`:for(n=t.child,i=null;n!==null;)e=n.alternate,e!==null&&po(e)===null&&(i=n),n=n.sibling;n=i,n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),Oc(t,!1,i,n,a,r);break;case`backwards`:case`unstable_legacy-backwards`:for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&po(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}Oc(t,!0,n,null,a,r);break;case`together`:Oc(t,!1,null,null,void 0,r);break;default:t.memoizedState=null}return t.child}function Ac(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Kl|=t.lanes,(n&t.childLanes)===0)if(e!==null){if($i(e,t,n,!1),(n&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(i(153));if(t.child!==null){for(e=t.child,n=fi(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=fi(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function jc(e,t){return(e.lanes&t)===0?(e=e.dependencies,!!(e!==null&&ea(e))):!0}function Mc(e,t,n){switch(t.tag){case 3:_e(t,t.stateNode.containerInfo),Yi(t,ca,e.memoizedState.cache),Ui();break;case 27:case 5:ye(t);break;case 4:_e(t,t.stateNode.containerInfo);break;case 10:Yi(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,so(t),null;break;case 13:var r=t.memoizedState;if(r!==null)return r.dehydrated===null?(n&t.child.childLanes)===0?(oo(t),e=Ac(e,t,n),e===null?null:e.sibling):Cc(e,t,n):(oo(t),t.flags|=128,null);oo(t);break;case 19:var i=(e.flags&128)!=0;if(r=(n&t.childLanes)!==0,r||=($i(e,t,n,!1),(n&t.childLanes)!==0),i){if(r)return kc(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),A(fo,fo.current),r)break;return null;case 22:return t.lanes=0,lc(e,t,n,t.pendingProps);case 24:Yi(t,ca,e.memoizedState.cache)}return Ac(e,t,n)}function Nc(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps)ic=!0;else{if(!jc(e,n)&&!(t.flags&128))return ic=!1,Mc(e,t,n);ic=!!(e.flags&131072)}else ic=!1,R&&t.flags&1048576&&ji(t,wi,t.index);switch(t.lanes=0,t.tag){case 16:a:{var r=t.pendingProps;if(e=ka(t.elementType),t.type=e,typeof e==`function`)di(e)?(r=qs(e,r),t.tag=1,t=vc(null,t,e,r,n)):(t.tag=0,t=gc(null,t,e,r,n));else{if(e!=null){var a=e.$$typeof;if(a===w){t.tag=11,t=oc(null,t,e,r,n);break a}else if(a===te){t.tag=14,t=sc(null,t,e,r,n);break a}}throw t=se(e)||e,Error(i(306,t,``))}}return t;case 0:return gc(e,t,t.type,t.pendingProps,n);case 1:return r=t.type,a=qs(r,t.pendingProps),vc(e,t,r,a,n);case 3:a:{if(_e(t,t.stateNode.containerInfo),e===null)throw Error(i(387));r=t.pendingProps;var o=t.memoizedState;a=o.element,Ua(e,t),Xa(t,r,null,n);var s=t.memoizedState;if(r=s.cache,Yi(t,ca,r),r!==o.cache&&Qi(t,[ca],n,!0),Ya(),r=s.element,o.isDehydrated)if(o={element:r,isDehydrated:!1,cache:s.cache},t.updateQueue.baseState=o,t.memoizedState=o,t.flags&256){t=yc(e,t,r,n);break a}else if(r!==a){a=bi(Error(i(424)),t),Gi(a),t=yc(e,t,r,n);break a}else{switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName===`HTML`?e.ownerDocument.body:e}for(L=cf(e.firstChild),Fi=t,R=!0,Ii=null,Li=!0,n=Ba(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling}else{if(Ui(),r===a){t=Ac(e,t,n);break a}ac(e,t,r,n)}t=t.child}return t;case 26:return hc(e,t),e===null?(n=kf(t.type,null,t.pendingProps,null))?t.memoizedState=n:R||(n=t.type,e=t.pendingProps,r=Bd(he.current).createElement(n),r[mt]=t,r[ht]=e,Pd(r,n,e),Et(r),t.stateNode=r):t.memoizedState=kf(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return ye(t),e===null&&R&&(r=t.stateNode=ff(t.type,t.pendingProps,he.current),Fi=t,Li=!0,a=L,Zd(t.type)?(lf=a,L=cf(r.firstChild)):L=a),ac(e,t,t.pendingProps.children,n),hc(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&R&&((a=r=L)&&(r=tf(r,t.type,t.pendingProps,Li),r===null?a=!1:(t.stateNode=r,Fi=t,L=cf(r.firstChild),Li=!1,a=!0)),a||zi(t)),ye(t),a=t.type,o=t.pendingProps,s=e===null?null:e.memoizedProps,r=o.children,Ud(a,o)?r=null:s!==null&&Ud(a,s)&&(t.flags|=32),t.memoizedState!==null&&(a=wo(e,t,Do,null,null,n),Qf._currentValue=a),hc(e,t),ac(e,t,r,n),t.child;case 6:return e===null&&R&&((e=n=L)&&(n=nf(n,t.pendingProps,Li),n===null?e=!1:(t.stateNode=n,Fi=t,L=null,e=!0)),e||zi(t)),null;case 13:return Cc(e,t,n);case 4:return _e(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=za(t,null,r,n):ac(e,t,r,n),t.child;case 11:return oc(e,t,t.type,t.pendingProps,n);case 7:return ac(e,t,t.pendingProps,n),t.child;case 8:return ac(e,t,t.pendingProps.children,n),t.child;case 12:return ac(e,t,t.pendingProps.children,n),t.child;case 10:return r=t.pendingProps,Yi(t,t.type,r.value),ac(e,t,r.children,n),t.child;case 9:return a=t.type._context,r=t.pendingProps.children,ta(t),a=na(a),r=r(a),t.flags|=1,ac(e,t,r,n),t.child;case 14:return sc(e,t,t.type,t.pendingProps,n);case 15:return cc(e,t,t.type,t.pendingProps,n);case 19:return kc(e,t,n);case 31:return mc(e,t,n);case 22:return lc(e,t,n,t.pendingProps);case 24:return ta(t),r=na(ca),e===null?(a=ba(),a===null&&(a=K,o=la(),a.pooledCache=o,o.refCount++,o!==null&&(a.pooledCacheLanes|=n),a=o),t.memoizedState={parent:r,cache:a},Ha(t),Yi(t,ca,a)):((e.lanes&n)!==0&&(Ua(e,t),Xa(t,null,null,n),Ya()),a=e.memoizedState,o=t.memoizedState,a.parent===r?(r=o.cache,Yi(t,ca,r),r!==a.cache&&Qi(t,[ca],n,!0)):(a={parent:r,cache:r},t.memoizedState=a,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=a),Yi(t,ca,r))),ac(e,t,t.pendingProps.children,n),t.child;case 29:throw t.pendingProps}throw Error(i(156,t.tag))}function Pc(e){e.flags|=4}function Fc(e,t,n,r,i){if((t=(e.mode&32)!=0)&&(t=!1),t){if(e.flags|=16777216,(i&335544128)===i)if(e.stateNode.complete)e.flags|=8192;else if(wu())e.flags|=8192;else throw Aa=Ea,wa}else e.flags&=-16777217}function Ic(e,t){if(t.type!==`stylesheet`||t.state.loading&4)e.flags&=-16777217;else if(e.flags|=16777216,!Wf(t))if(wu())e.flags|=8192;else throw Aa=Ea,wa}function Lc(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag===22?536870912:nt(),e.lanes|=t,Xl|=t)}function Rc(e,t){if(!R)switch(e.tailMode){case`hidden`:t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case`collapsed`:n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function U(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&65011712,r|=i.flags&65011712,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function zc(e,t,n){var r=t.pendingProps;switch(Ni(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return U(t),null;case 1:return U(t),null;case 3:return n=t.stateNode,r=null,e!==null&&(r=e.memoizedState.cache),t.memoizedState.cache!==r&&(t.flags|=2048),Xi(ca),ve(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(Hi(t)?Pc(t):e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Wi())),U(t),null;case 26:var a=t.type,o=t.memoizedState;return e===null?(Pc(t),o===null?(U(t),Fc(t,a,null,r,n)):(U(t),Ic(t,o))):o?o===e.memoizedState?(U(t),t.flags&=-16777217):(Pc(t),U(t),Ic(t,o)):(e=e.memoizedProps,e!==r&&Pc(t),U(t),Fc(t,a,e,r,n)),null;case 27:if(be(t),n=he.current,a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Pc(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return U(t),null}e=pe.current,Hi(t)?Bi(t,e):(e=ff(a,r,n),t.stateNode=e,Pc(t))}return U(t),null;case 5:if(be(t),a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Pc(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return U(t),null}if(o=pe.current,Hi(t))Bi(t,o);else{var s=Bd(he.current);switch(o){case 1:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case 2:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;default:switch(a){case`svg`:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case`math`:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;case`script`:o=s.createElement(`div`),o.innerHTML=`<script><\/script>`,o=o.removeChild(o.firstChild);break;case`select`:o=typeof r.is==`string`?s.createElement(`select`,{is:r.is}):s.createElement(`select`),r.multiple?o.multiple=!0:r.size&&(o.size=r.size);break;default:o=typeof r.is==`string`?s.createElement(a,{is:r.is}):s.createElement(a)}}o[mt]=t,o[ht]=r;a:for(s=t.child;s!==null;){if(s.tag===5||s.tag===6)o.appendChild(s.stateNode);else if(s.tag!==4&&s.tag!==27&&s.child!==null){s.child.return=s,s=s.child;continue}if(s===t)break a;for(;s.sibling===null;){if(s.return===null||s.return===t)break a;s=s.return}s.sibling.return=s.return,s=s.sibling}t.stateNode=o;a:switch(Pd(o,a,r),a){case`button`:case`input`:case`select`:case`textarea`:r=!!r.autoFocus;break a;case`img`:r=!0;break a;default:r=!1}r&&Pc(t)}}return U(t),Fc(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==r&&Pc(t);else{if(typeof r!=`string`&&t.stateNode===null)throw Error(i(166));if(e=he.current,Hi(t)){if(e=t.stateNode,n=t.memoizedProps,r=null,a=Fi,a!==null)switch(a.tag){case 27:case 5:r=a.memoizedProps}e[mt]=t,e=!!(e.nodeValue===n||r!==null&&!0===r.suppressHydrationWarning||Md(e.nodeValue,n)),e||zi(t,!0)}else e=Bd(e).createTextNode(r),e[mt]=t,t.stateNode=e}return U(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(r=Hi(t),n!==null){if(e===null){if(!r)throw Error(i(318));if(e=t.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(557));e[mt]=t}else Ui(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;U(t),e=!1}else n=Wi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(uo(t),t):(uo(t),null);if(t.flags&128)throw Error(i(558))}return U(t),null;case 13:if(r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(a=Hi(t),r!==null&&r.dehydrated!==null){if(e===null){if(!a)throw Error(i(318));if(a=t.memoizedState,a=a===null?null:a.dehydrated,!a)throw Error(i(317));a[mt]=t}else Ui(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;U(t),a=!1}else a=Wi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=a),a=!0;if(!a)return t.flags&256?(uo(t),t):(uo(t),null)}return uo(t),t.flags&128?(t.lanes=n,t):(n=r!==null,e=e!==null&&e.memoizedState!==null,n&&(r=t.child,a=null,r.alternate!==null&&r.alternate.memoizedState!==null&&r.alternate.memoizedState.cachePool!==null&&(a=r.alternate.memoizedState.cachePool.pool),o=null,r.memoizedState!==null&&r.memoizedState.cachePool!==null&&(o=r.memoizedState.cachePool.pool),o!==a&&(r.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),Lc(t,t.updateQueue),U(t),null);case 4:return ve(),e===null&&Sd(t.stateNode.containerInfo),U(t),null;case 10:return Xi(t.type),U(t),null;case 19:if(k(fo),r=t.memoizedState,r===null)return U(t),null;if(a=(t.flags&128)!=0,o=r.rendering,o===null)if(a)Rc(r,!1);else{if(Gl!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(o=po(e),o!==null){for(t.flags|=128,Rc(r,!1),e=o.updateQueue,t.updateQueue=e,Lc(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)pi(n,e),n=n.sibling;return A(fo,fo.current&1|2),R&&Ai(t,r.treeForkCount),t.child}e=e.sibling}r.tail!==null&&Ne()>nu&&(t.flags|=128,a=!0,Rc(r,!1),t.lanes=4194304)}else{if(!a)if(e=po(o),e!==null){if(t.flags|=128,a=!0,e=e.updateQueue,t.updateQueue=e,Lc(t,e),Rc(r,!0),r.tail===null&&r.tailMode===`hidden`&&!o.alternate&&!R)return U(t),null}else 2*Ne()-r.renderingStartTime>nu&&n!==536870912&&(t.flags|=128,a=!0,Rc(r,!1),t.lanes=4194304);r.isBackwards?(o.sibling=t.child,t.child=o):(e=r.last,e===null?t.child=o:e.sibling=o,r.last=o)}return r.tail===null?(U(t),null):(e=r.tail,r.rendering=e,r.tail=e.sibling,r.renderingStartTime=Ne(),e.sibling=null,n=fo.current,A(fo,a?n&1|2:n&1),R&&Ai(t,r.treeForkCount),e);case 22:case 23:return uo(t),ro(),r=t.memoizedState!==null,e===null?r&&(t.flags|=8192):e.memoizedState!==null!==r&&(t.flags|=8192),r?n&536870912&&!(t.flags&128)&&(U(t),t.subtreeFlags&6&&(t.flags|=8192)):U(t),n=t.updateQueue,n!==null&&Lc(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),r=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(r=t.memoizedState.cachePool.pool),r!==n&&(t.flags|=2048),e!==null&&k(ya),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),Xi(ca),U(t),null;case 25:return null;case 30:return null}throw Error(i(156,t.tag))}function Bc(e,t){switch(Ni(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return Xi(ca),ve(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return be(t),null;case 31:if(t.memoizedState!==null){if(uo(t),t.alternate===null)throw Error(i(340));Ui()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(uo(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(i(340));Ui()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return k(fo),null;case 4:return ve(),null;case 10:return Xi(t.type),null;case 22:case 23:return uo(t),ro(),e!==null&&k(ya),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return Xi(ca),null;case 25:return null;default:return null}}function Vc(e,t){switch(Ni(t),t.tag){case 3:Xi(ca),ve();break;case 26:case 27:case 5:be(t);break;case 4:ve();break;case 31:t.memoizedState!==null&&uo(t);break;case 13:uo(t);break;case 19:k(fo);break;case 10:Xi(t.type);break;case 22:case 23:uo(t),ro(),e!==null&&k(ya);break;case 24:Xi(ca)}}function Hc(e,t){try{var n=t.updateQueue,r=n===null?null:n.lastEffect;if(r!==null){var i=r.next;n=i;do{if((n.tag&e)===e){r=void 0;var a=n.create,o=n.inst;r=a(),o.destroy=r}n=n.next}while(n!==i)}}catch(e){Z(t,t.return,e)}}function Uc(e,t,n){try{var r=t.updateQueue,i=r===null?null:r.lastEffect;if(i!==null){var a=i.next;r=a;do{if((r.tag&e)===e){var o=r.inst,s=o.destroy;if(s!==void 0){o.destroy=void 0,i=t;var c=n,l=s;try{l()}catch(e){Z(i,c,e)}}}r=r.next}while(r!==a)}}catch(e){Z(t,t.return,e)}}function Wc(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{Qa(t,n)}catch(t){Z(e,e.return,t)}}}function Gc(e,t,n){n.props=qs(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(n){Z(e,t,n)}}function Kc(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var r=e.stateNode;break;case 30:r=e.stateNode;break;default:r=e.stateNode}typeof n==`function`?e.refCleanup=n(r):n.current=r}}catch(n){Z(e,t,n)}}function qc(e,t){var n=e.ref,r=e.refCleanup;if(n!==null)if(typeof r==`function`)try{r()}catch(n){Z(e,t,n)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n==`function`)try{n(null)}catch(n){Z(e,t,n)}else n.current=null}function Jc(e){var t=e.type,n=e.memoizedProps,r=e.stateNode;try{a:switch(t){case`button`:case`input`:case`select`:case`textarea`:n.autoFocus&&r.focus();break a;case`img`:n.src?r.src=n.src:n.srcSet&&(r.srcset=n.srcSet)}}catch(t){Z(e,e.return,t)}}function Yc(e,t,n){try{var r=e.stateNode;Fd(r,e.type,n,t),r[ht]=t}catch(t){Z(e,e.return,t)}}function Xc(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&Zd(e.type)||e.tag===4}function Zc(e){a:for(;;){for(;e.sibling===null;){if(e.return===null||Xc(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&Zd(e.type)||e.flags&2||e.child===null||e.tag===4)continue a;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Qc(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n).insertBefore(e,t):(t=n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n,t.appendChild(e),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=on));else if(r!==4&&(r===27&&Zd(e.type)&&(n=e.stateNode,t=null),e=e.child,e!==null))for(Qc(e,t,n),e=e.sibling;e!==null;)Qc(e,t,n),e=e.sibling}function $c(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(r===27&&Zd(e.type)&&(n=e.stateNode),e=e.child,e!==null))for($c(e,t,n),e=e.sibling;e!==null;)$c(e,t,n),e=e.sibling}function el(e){var t=e.stateNode,n=e.memoizedProps;try{for(var r=e.type,i=t.attributes;i.length;)t.removeAttributeNode(i[0]);Pd(t,r,n),t[mt]=e,t[ht]=n}catch(t){Z(e,e.return,t)}}var tl=!1,nl=!1,rl=!1,il=typeof WeakSet==`function`?WeakSet:Set,al=null;function ol(e,t){if(e=e.containerInfo,Rd=sp,e=jr(e),Mr(e)){if(`selectionStart`in e)var n={start:e.selectionStart,end:e.selectionEnd};else a:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var a=r.anchorOffset,o=r.focusNode;r=r.focusOffset;try{n.nodeType,o.nodeType}catch{n=null;break a}var s=0,c=-1,l=-1,u=0,d=0,f=e,p=null;b:for(;;){for(var m;f!==n||a!==0&&f.nodeType!==3||(c=s+a),f!==o||r!==0&&f.nodeType!==3||(l=s+r),f.nodeType===3&&(s+=f.nodeValue.length),(m=f.firstChild)!==null;)p=f,f=m;for(;;){if(f===e)break b;if(p===n&&++u===a&&(c=s),p===o&&++d===r&&(l=s),(m=f.nextSibling)!==null)break;f=p,p=f.parentNode}f=m}n=c===-1||l===-1?null:{start:c,end:l}}else n=null}n||={start:0,end:0}}else n=null;for(zd={focusedElem:e,selectionRange:n},sp=!1,al=t;al!==null;)if(t=al,e=t.child,t.subtreeFlags&1028&&e!==null)e.return=t,al=e;else for(;al!==null;){switch(t=al,o=t.alternate,e=t.flags,t.tag){case 0:if(e&4&&(e=t.updateQueue,e=e===null?null:e.events,e!==null))for(n=0;n<e.length;n++)a=e[n],a.ref.impl=a.nextImpl;break;case 11:case 15:break;case 1:if(e&1024&&o!==null){e=void 0,n=t,a=o.memoizedProps,o=o.memoizedState,r=n.stateNode;try{var h=qs(n.type,a);e=r.getSnapshotBeforeUpdate(h,o),r.__reactInternalSnapshotBeforeUpdate=e}catch(e){Z(n,n.return,e)}}break;case 3:if(e&1024){if(e=t.stateNode.containerInfo,n=e.nodeType,n===9)ef(e);else if(n===1)switch(e.nodeName){case`HEAD`:case`HTML`:case`BODY`:ef(e);break;default:e.textContent=``}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if(e&1024)throw Error(i(163))}if(e=t.sibling,e!==null){e.return=t.return,al=e;break}al=t.return}}function sl(e,t,n){var r=n.flags;switch(n.tag){case 0:case 11:case 15:xl(e,n),r&4&&Hc(5,n);break;case 1:if(xl(e,n),r&4)if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(e){Z(n,n.return,e)}else{var i=qs(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(i,t,e.__reactInternalSnapshotBeforeUpdate)}catch(e){Z(n,n.return,e)}}r&64&&Wc(n),r&512&&Kc(n,n.return);break;case 3:if(xl(e,n),r&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{Qa(e,t)}catch(e){Z(n,n.return,e)}}break;case 27:t===null&&r&4&&el(n);case 26:case 5:xl(e,n),t===null&&r&4&&Jc(n),r&512&&Kc(n,n.return);break;case 12:xl(e,n);break;case 31:xl(e,n),r&4&&fl(e,n);break;case 13:xl(e,n),r&4&&pl(e,n),r&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=Ju.bind(null,n),sf(e,n))));break;case 22:if(r=n.memoizedState!==null||tl,!r){t=t!==null&&t.memoizedState!==null||nl,i=tl;var a=nl;tl=r,(nl=t)&&!a?Cl(e,n,(n.subtreeFlags&8772)!=0):xl(e,n),tl=i,nl=a}break;case 30:break;default:xl(e,n)}}function cl(e){var t=e.alternate;t!==null&&(e.alternate=null,cl(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&xt(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var W=null,ll=!1;function ul(e,t,n){for(n=n.child;n!==null;)dl(e,t,n),n=n.sibling}function dl(e,t,n){if(Ue&&typeof Ue.onCommitFiberUnmount==`function`)try{Ue.onCommitFiberUnmount(He,n)}catch{}switch(n.tag){case 26:nl||qc(n,t),ul(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:nl||qc(n,t);var r=W,i=ll;Zd(n.type)&&(W=n.stateNode,ll=!1),ul(e,t,n),pf(n.stateNode),W=r,ll=i;break;case 5:nl||qc(n,t);case 6:if(r=W,i=ll,W=null,ul(e,t,n),W=r,ll=i,W!==null)if(ll)try{(W.nodeType===9?W.body:W.nodeName===`HTML`?W.ownerDocument.body:W).removeChild(n.stateNode)}catch(e){Z(n,t,e)}else try{W.removeChild(n.stateNode)}catch(e){Z(n,t,e)}break;case 18:W!==null&&(ll?(e=W,Qd(e.nodeType===9?e.body:e.nodeName===`HTML`?e.ownerDocument.body:e,n.stateNode),Np(e)):Qd(W,n.stateNode));break;case 4:r=W,i=ll,W=n.stateNode.containerInfo,ll=!0,ul(e,t,n),W=r,ll=i;break;case 0:case 11:case 14:case 15:Uc(2,n,t),nl||Uc(4,n,t),ul(e,t,n);break;case 1:nl||(qc(n,t),r=n.stateNode,typeof r.componentWillUnmount==`function`&&Gc(n,t,r)),ul(e,t,n);break;case 21:ul(e,t,n);break;case 22:nl=(r=nl)||n.memoizedState!==null,ul(e,t,n),nl=r;break;default:ul(e,t,n)}}function fl(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Np(e)}catch(e){Z(t,t.return,e)}}}function pl(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Np(e)}catch(e){Z(t,t.return,e)}}function ml(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new il),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new il),t;default:throw Error(i(435,e.tag))}}function hl(e,t){var n=ml(e);t.forEach(function(t){if(!n.has(t)){n.add(t);var r=Yu.bind(null,e,t);t.then(r,r)}})}function gl(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var a=n[r],o=e,s=t,c=s;a:for(;c!==null;){switch(c.tag){case 27:if(Zd(c.type)){W=c.stateNode,ll=!1;break a}break;case 5:W=c.stateNode,ll=!1;break a;case 3:case 4:W=c.stateNode.containerInfo,ll=!0;break a}c=c.return}if(W===null)throw Error(i(160));dl(o,s,a),W=null,ll=!1,o=a.alternate,o!==null&&(o.return=null),a.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)vl(t,e),t=t.sibling}var _l=null;function vl(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:gl(t,e),yl(e),r&4&&(Uc(3,e,e.return),Hc(3,e),Uc(5,e,e.return));break;case 1:gl(t,e),yl(e),r&512&&(nl||n===null||qc(n,n.return)),r&64&&tl&&(e=e.updateQueue,e!==null&&(r=e.callbacks,r!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?r:n.concat(r))));break;case 26:var a=_l;if(gl(t,e),yl(e),r&512&&(nl||n===null||qc(n,n.return)),r&4){var o=n===null?null:n.memoizedState;if(r=e.memoizedState,n===null)if(r===null)if(e.stateNode===null){a:{r=e.type,n=e.memoizedProps,a=a.ownerDocument||a;b:switch(r){case`title`:o=a.getElementsByTagName(`title`)[0],(!o||o[bt]||o[mt]||o.namespaceURI===`http://www.w3.org/2000/svg`||o.hasAttribute(`itemprop`))&&(o=a.createElement(r),a.head.insertBefore(o,a.querySelector(`head > title`))),Pd(o,r,n),o[mt]=e,Et(o),r=o;break a;case`link`:var s=Vf(`link`,`href`,a).get(r+(n.href||``));if(s){for(var c=0;c<s.length;c++)if(o=s[c],o.getAttribute(`href`)===(n.href==null||n.href===``?null:n.href)&&o.getAttribute(`rel`)===(n.rel==null?null:n.rel)&&o.getAttribute(`title`)===(n.title==null?null:n.title)&&o.getAttribute(`crossorigin`)===(n.crossOrigin==null?null:n.crossOrigin)){s.splice(c,1);break b}}o=a.createElement(r),Pd(o,r,n),a.head.appendChild(o);break;case`meta`:if(s=Vf(`meta`,`content`,a).get(r+(n.content||``))){for(c=0;c<s.length;c++)if(o=s[c],o.getAttribute(`content`)===(n.content==null?null:``+n.content)&&o.getAttribute(`name`)===(n.name==null?null:n.name)&&o.getAttribute(`property`)===(n.property==null?null:n.property)&&o.getAttribute(`http-equiv`)===(n.httpEquiv==null?null:n.httpEquiv)&&o.getAttribute(`charset`)===(n.charSet==null?null:n.charSet)){s.splice(c,1);break b}}o=a.createElement(r),Pd(o,r,n),a.head.appendChild(o);break;default:throw Error(i(468,r))}o[mt]=e,Et(o),r=o}e.stateNode=r}else Hf(a,e.type,e.stateNode);else e.stateNode=If(a,r,e.memoizedProps);else o===r?r===null&&e.stateNode!==null&&Yc(e,e.memoizedProps,n.memoizedProps):(o===null?n.stateNode!==null&&(n=n.stateNode,n.parentNode.removeChild(n)):o.count--,r===null?Hf(a,e.type,e.stateNode):If(a,r,e.memoizedProps))}break;case 27:gl(t,e),yl(e),r&512&&(nl||n===null||qc(n,n.return)),n!==null&&r&4&&Yc(e,e.memoizedProps,n.memoizedProps);break;case 5:if(gl(t,e),yl(e),r&512&&(nl||n===null||qc(n,n.return)),e.flags&32){a=e.stateNode;try{Zt(a,``)}catch(t){Z(e,e.return,t)}}r&4&&e.stateNode!=null&&(a=e.memoizedProps,Yc(e,a,n===null?a:n.memoizedProps)),r&1024&&(rl=!0);break;case 6:if(gl(t,e),yl(e),r&4){if(e.stateNode===null)throw Error(i(162));r=e.memoizedProps,n=e.stateNode;try{n.nodeValue=r}catch(t){Z(e,e.return,t)}}break;case 3:if(Bf=null,a=_l,_l=gf(t.containerInfo),gl(t,e),_l=a,yl(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{Np(t.containerInfo)}catch(t){Z(e,e.return,t)}rl&&(rl=!1,bl(e));break;case 4:r=_l,_l=gf(e.stateNode.containerInfo),gl(t,e),yl(e),_l=r;break;case 12:gl(t,e),yl(e);break;case 31:gl(t,e),yl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 13:gl(t,e),yl(e),e.child.flags&8192&&e.memoizedState!==null!=(n!==null&&n.memoizedState!==null)&&(eu=Ne()),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 22:a=e.memoizedState!==null;var l=n!==null&&n.memoizedState!==null,u=tl,d=nl;if(tl=u||a,nl=d||l,gl(t,e),nl=d,tl=u,yl(e),r&8192)a:for(t=e.stateNode,t._visibility=a?t._visibility&-2:t._visibility|1,a&&(n===null||l||tl||nl||Sl(e)),n=null,t=e;;){if(t.tag===5||t.tag===26){if(n===null){l=n=t;try{if(o=l.stateNode,a)s=o.style,typeof s.setProperty==`function`?s.setProperty(`display`,`none`,`important`):s.display=`none`;else{c=l.stateNode;var f=l.memoizedProps.style,p=f!=null&&f.hasOwnProperty(`display`)?f.display:null;c.style.display=p==null||typeof p==`boolean`?``:(``+p).trim()}}catch(e){Z(l,l.return,e)}}}else if(t.tag===6){if(n===null){l=t;try{l.stateNode.nodeValue=a?``:l.memoizedProps}catch(e){Z(l,l.return,e)}}}else if(t.tag===18){if(n===null){l=t;try{var m=l.stateNode;a?$d(m,!0):$d(l.stateNode,!1)}catch(e){Z(l,l.return,e)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break a;for(;t.sibling===null;){if(t.return===null||t.return===e)break a;n===t&&(n=null),t=t.return}n===t&&(n=null),t.sibling.return=t.return,t=t.sibling}r&4&&(r=e.updateQueue,r!==null&&(n=r.retryQueue,n!==null&&(r.retryQueue=null,hl(e,n))));break;case 19:gl(t,e),yl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 30:break;case 21:break;default:gl(t,e),yl(e)}}function yl(e){var t=e.flags;if(t&2){try{for(var n,r=e.return;r!==null;){if(Xc(r)){n=r;break}r=r.return}if(n==null)throw Error(i(160));switch(n.tag){case 27:var a=n.stateNode;$c(e,Zc(e),a);break;case 5:var o=n.stateNode;n.flags&32&&(Zt(o,``),n.flags&=-33),$c(e,Zc(e),o);break;case 3:case 4:var s=n.stateNode.containerInfo;Qc(e,Zc(e),s);break;default:throw Error(i(161))}}catch(t){Z(e,e.return,t)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function bl(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;bl(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function xl(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)sl(e,t.alternate,t),t=t.sibling}function Sl(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:Uc(4,t,t.return),Sl(t);break;case 1:qc(t,t.return);var n=t.stateNode;typeof n.componentWillUnmount==`function`&&Gc(t,t.return,n),Sl(t);break;case 27:pf(t.stateNode);case 26:case 5:qc(t,t.return),Sl(t);break;case 22:t.memoizedState===null&&Sl(t);break;case 30:Sl(t);break;default:Sl(t)}e=e.sibling}}function Cl(e,t,n){for(n&&=(t.subtreeFlags&8772)!=0,t=t.child;t!==null;){var r=t.alternate,i=e,a=t,o=a.flags;switch(a.tag){case 0:case 11:case 15:Cl(i,a,n),Hc(4,a);break;case 1:if(Cl(i,a,n),r=a,i=r.stateNode,typeof i.componentDidMount==`function`)try{i.componentDidMount()}catch(e){Z(r,r.return,e)}if(r=a,i=r.updateQueue,i!==null){var s=r.stateNode;try{var c=i.shared.hiddenCallbacks;if(c!==null)for(i.shared.hiddenCallbacks=null,i=0;i<c.length;i++)Za(c[i],s)}catch(e){Z(r,r.return,e)}}n&&o&64&&Wc(a),Kc(a,a.return);break;case 27:el(a);case 26:case 5:Cl(i,a,n),n&&r===null&&o&4&&Jc(a),Kc(a,a.return);break;case 12:Cl(i,a,n);break;case 31:Cl(i,a,n),n&&o&4&&fl(i,a);break;case 13:Cl(i,a,n),n&&o&4&&pl(i,a);break;case 22:a.memoizedState===null&&Cl(i,a,n),Kc(a,a.return);break;case 30:break;default:Cl(i,a,n)}t=t.sibling}}function wl(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&ua(n))}function Tl(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ua(e))}function El(e,t,n,r){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)Dl(e,t,n,r),t=t.sibling}function Dl(e,t,n,r){var i=t.flags;switch(t.tag){case 0:case 11:case 15:El(e,t,n,r),i&2048&&Hc(9,t);break;case 1:El(e,t,n,r);break;case 3:El(e,t,n,r),i&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ua(e)));break;case 12:if(i&2048){El(e,t,n,r),e=t.stateNode;try{var a=t.memoizedProps,o=a.id,s=a.onPostCommit;typeof s==`function`&&s(o,t.alternate===null?`mount`:`update`,e.passiveEffectDuration,-0)}catch(e){Z(t,t.return,e)}}else El(e,t,n,r);break;case 31:El(e,t,n,r);break;case 13:El(e,t,n,r);break;case 23:break;case 22:a=t.stateNode,o=t.alternate,t.memoizedState===null?a._visibility&2?El(e,t,n,r):(a._visibility|=2,Ol(e,t,n,r,(t.subtreeFlags&10256)!=0||!1)):a._visibility&2?El(e,t,n,r):kl(e,t),i&2048&&wl(o,t);break;case 24:El(e,t,n,r),i&2048&&Tl(t.alternate,t);break;default:El(e,t,n,r)}}function Ol(e,t,n,r,i){for(i&&=(t.subtreeFlags&10256)!=0||!1,t=t.child;t!==null;){var a=e,o=t,s=n,c=r,l=o.flags;switch(o.tag){case 0:case 11:case 15:Ol(a,o,s,c,i),Hc(8,o);break;case 23:break;case 22:var u=o.stateNode;o.memoizedState===null?(u._visibility|=2,Ol(a,o,s,c,i)):u._visibility&2?Ol(a,o,s,c,i):kl(a,o),i&&l&2048&&wl(o.alternate,o);break;case 24:Ol(a,o,s,c,i),i&&l&2048&&Tl(o.alternate,o);break;default:Ol(a,o,s,c,i)}t=t.sibling}}function kl(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,r=t,i=r.flags;switch(r.tag){case 22:kl(n,r),i&2048&&wl(r.alternate,r);break;case 24:kl(n,r),i&2048&&Tl(r.alternate,r);break;default:kl(n,r)}t=t.sibling}}var Al=8192;function jl(e,t,n){if(e.subtreeFlags&Al)for(e=e.child;e!==null;)Ml(e,t,n),e=e.sibling}function Ml(e,t,n){switch(e.tag){case 26:jl(e,t,n),e.flags&Al&&e.memoizedState!==null&&Gf(n,_l,e.memoizedState,e.memoizedProps);break;case 5:jl(e,t,n);break;case 3:case 4:var r=_l;_l=gf(e.stateNode.containerInfo),jl(e,t,n),_l=r;break;case 22:e.memoizedState===null&&(r=e.alternate,r!==null&&r.memoizedState!==null?(r=Al,Al=16777216,jl(e,t,n),Al=r):jl(e,t,n));break;default:jl(e,t,n)}}function Nl(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Pl(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];al=r,Ll(r,e)}Nl(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)Fl(e),e=e.sibling}function Fl(e){switch(e.tag){case 0:case 11:case 15:Pl(e),e.flags&2048&&Uc(9,e,e.return);break;case 3:Pl(e);break;case 12:Pl(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Il(e)):Pl(e);break;default:Pl(e)}}function Il(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];al=r,Ll(r,e)}Nl(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:Uc(8,t,t.return),Il(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Il(t));break;default:Il(t)}e=e.sibling}}function Ll(e,t){for(;al!==null;){var n=al;switch(n.tag){case 0:case 11:case 15:Uc(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var r=n.memoizedState.cachePool.pool;r!=null&&r.refCount++}break;case 24:ua(n.memoizedState.cache)}if(r=n.child,r!==null)r.return=n,al=r;else a:for(n=e;al!==null;){r=al;var i=r.sibling,a=r.return;if(cl(r),r===n){al=null;break a}if(i!==null){i.return=a,al=i;break a}al=a}}}var Rl={getCacheForType:function(e){var t=na(ca),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return na(ca).controller.signal}},zl=typeof WeakMap==`function`?WeakMap:Map,G=0,K=null,q=null,J=0,Y=0,Bl=null,Vl=!1,Hl=!1,Ul=!1,Wl=0,Gl=0,Kl=0,ql=0,Jl=0,Yl=0,Xl=0,Zl=null,Ql=null,$l=!1,eu=0,tu=0,nu=1/0,ru=null,iu=null,au=0,ou=null,su=null,cu=0,lu=0,uu=null,du=null,fu=0,pu=null;function mu(){return G&2&&J!==0?J&-J:D.T===null?dt():dd()}function hu(){if(Yl===0)if(!(J&536870912)||R){var e=Xe;Xe<<=1,!(Xe&3932160)&&(Xe=262144),Yl=e}else Yl=536870912;return e=io.current,e!==null&&(e.flags|=32),Yl}function gu(e,t,n){(e===K&&(Y===2||Y===9)||e.cancelPendingCommit!==null)&&(Su(e,0),X(e,J,Yl,!1)),it(e,n),(!(G&2)||e!==K)&&(e===K&&(!(G&2)&&(ql|=n),Gl===4&&X(e,J,Yl,!1)),rd(e))}function _u(e,t,n){if(G&6)throw Error(i(327));var r=!n&&(t&127)==0&&(t&e.expiredLanes)===0||et(e,t),a=r?Au(e,t):Ou(e,t,!0),o=r;do{if(a===0){Hl&&!r&&X(e,t,0,!1);break}else{if(n=e.current.alternate,o&&!yu(n)){a=Ou(e,t,!1),o=!1;continue}if(a===2){if(o=t,e.errorRecoveryDisabledLanes&o)var s=0;else s=e.pendingLanes&-536870913,s=s===0?s&536870912?536870912:0:s;if(s!==0){t=s;a:{var c=e;a=Zl;var l=c.current.memoizedState.isDehydrated;if(l&&(Su(c,s).flags|=256),s=Ou(c,s,!1),s!==2){if(Ul&&!l){c.errorRecoveryDisabledLanes|=o,ql|=o,a=4;break a}o=Ql,Ql=a,o!==null&&(Ql===null?Ql=o:Ql.push.apply(Ql,o))}a=s}if(o=!1,a!==2)continue}}if(a===1){Su(e,0),X(e,t,0,!0);break}a:{switch(r=e,o=a,o){case 0:case 1:throw Error(i(345));case 4:if((t&4194048)!==t)break;case 6:X(r,t,Yl,!Vl);break a;case 2:Ql=null;break;case 3:case 5:break;default:throw Error(i(329))}if((t&62914560)===t&&(a=eu+300-Ne(),10<a)){if(X(r,t,Yl,!Vl),$e(r,0,!0)!==0)break a;cu=t,r.timeoutHandle=Kd(vu.bind(null,r,n,Ql,ru,$l,t,Yl,ql,Xl,Vl,o,`Throttled`,-0,0),a);break a}vu(r,n,Ql,ru,$l,t,Yl,ql,Xl,Vl,o,null,-0,0)}}break}while(1);rd(e)}function vu(e,t,n,r,i,a,o,s,c,l,u,d,f,p){if(e.timeoutHandle=-1,d=t.subtreeFlags,d&8192||(d&16785408)==16785408){d={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:on},Ml(t,a,d);var m=(a&62914560)===a?eu-Ne():(a&4194048)===a?tu-Ne():0;if(m=qf(d,m),m!==null){cu=a,e.cancelPendingCommit=m(Lu.bind(null,e,t,a,n,r,i,o,s,c,u,d,null,f,p)),X(e,a,o,!l);return}}Lu(e,t,a,n,r,i,o,s,c)}function yu(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var r=0;r<n.length;r++){var i=n[r],a=i.getSnapshot;i=i.value;try{if(!Er(a(),i))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function X(e,t,n,r){t&=~Jl,t&=~ql,e.suspendedLanes|=t,e.pingedLanes&=~t,r&&(e.warmLanes|=t),r=e.expirationTimes;for(var i=t;0<i;){var a=31-Ge(i),o=1<<a;r[a]=-1,i&=~o}n!==0&&ot(e,n,t)}function bu(){return G&6?!0:(id(0,!1),!1)}function xu(){if(q!==null){if(Y===0)var e=q.return;else e=q,Ji=qi=null,Ao(e),Na=null,Pa=0,e=q;for(;e!==null;)Vc(e.alternate,e),e=e.return;q=null}}function Su(e,t){var n=e.timeoutHandle;n!==-1&&(e.timeoutHandle=-1,qd(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),cu=0,xu(),K=e,q=n=fi(e.current,null),J=t,Y=0,Bl=null,Vl=!1,Hl=et(e,t),Ul=!1,Xl=Yl=Jl=ql=Kl=Gl=0,Ql=Zl=null,$l=!1,t&8&&(t|=t&32);var r=e.entangledLanes;if(r!==0)for(e=e.entanglements,r&=t;0<r;){var i=31-Ge(r),a=1<<i;t|=e[i],r&=~a}return Wl=t,ni(),n}function Cu(e,t){z=null,D.H=zs,t===Ca||t===Ta?(t=ja(),Y=3):t===wa?(t=ja(),Y=4):Y=t===rc?8:typeof t==`object`&&t&&typeof t.then==`function`?6:1,Bl=t,q===null&&(Gl=1,Zs(e,bi(t,e.current)))}function wu(){var e=io.current;return e===null?!0:(J&4194048)===J?ao===null:(J&62914560)===J||J&536870912?e===ao:!1}function Tu(){var e=D.H;return D.H=zs,e===null?zs:e}function Eu(){var e=D.A;return D.A=Rl,e}function Du(){Gl=4,Vl||(J&4194048)!==J&&io.current!==null||(Hl=!0),!(Kl&134217727)&&!(ql&134217727)||K===null||X(K,J,Yl,!1)}function Ou(e,t,n){var r=G;G|=2;var i=Tu(),a=Eu();(K!==e||J!==t)&&(ru=null,Su(e,t)),t=!1;var o=Gl;a:do try{if(Y!==0&&q!==null){var s=q,c=Bl;switch(Y){case 8:xu(),o=6;break a;case 3:case 2:case 9:case 6:io.current===null&&(t=!0);var l=Y;if(Y=0,Bl=null,Pu(e,s,c,l),n&&Hl){o=0;break a}break;default:l=Y,Y=0,Bl=null,Pu(e,s,c,l)}}ku(),o=Gl;break}catch(t){Cu(e,t)}while(1);return t&&e.shellSuspendCounter++,Ji=qi=null,G=r,D.H=i,D.A=a,q===null&&(K=null,J=0,ni()),o}function ku(){for(;q!==null;)Mu(q)}function Au(e,t){var n=G;G|=2;var r=Tu(),a=Eu();K!==e||J!==t?(ru=null,nu=Ne()+500,Su(e,t)):Hl=et(e,t);a:do try{if(Y!==0&&q!==null){t=q;var o=Bl;b:switch(Y){case 1:Y=0,Bl=null,Pu(e,t,o,1);break;case 2:case 9:if(Da(o)){Y=0,Bl=null,Nu(t);break}t=function(){Y!==2&&Y!==9||K!==e||(Y=7),rd(e)},o.then(t,t);break a;case 3:Y=7;break a;case 4:Y=5;break a;case 7:Da(o)?(Y=0,Bl=null,Nu(t)):(Y=0,Bl=null,Pu(e,t,o,7));break;case 5:var s=null;switch(q.tag){case 26:s=q.memoizedState;case 5:case 27:var c=q;if(s?Wf(s):c.stateNode.complete){Y=0,Bl=null;var l=c.sibling;if(l!==null)q=l;else{var u=c.return;u===null?q=null:(q=u,Fu(u))}break b}}Y=0,Bl=null,Pu(e,t,o,5);break;case 6:Y=0,Bl=null,Pu(e,t,o,6);break;case 8:xu(),Gl=6;break a;default:throw Error(i(462))}}ju();break}catch(t){Cu(e,t)}while(1);return Ji=qi=null,D.H=r,D.A=a,G=n,q===null?(K=null,J=0,ni(),Gl):0}function ju(){for(;q!==null&&!je();)Mu(q)}function Mu(e){var t=Nc(e.alternate,e,Wl);e.memoizedProps=e.pendingProps,t===null?Fu(e):q=t}function Nu(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=_c(n,t,t.pendingProps,t.type,void 0,J);break;case 11:t=_c(n,t,t.pendingProps,t.type.render,t.ref,J);break;case 5:Ao(t);default:Vc(n,t),t=q=pi(t,Wl),t=Nc(n,t,Wl)}e.memoizedProps=e.pendingProps,t===null?Fu(e):q=t}function Pu(e,t,n,r){Ji=qi=null,Ao(t),Na=null,Pa=0;var i=t.return;try{if(nc(e,i,t,n,J)){Gl=1,Zs(e,bi(n,e.current)),q=null;return}}catch(t){if(i!==null)throw q=i,t;Gl=1,Zs(e,bi(n,e.current)),q=null;return}t.flags&32768?(R||r===1?e=!0:Hl||J&536870912?e=!1:(Vl=e=!0,(r===2||r===9||r===3||r===6)&&(r=io.current,r!==null&&r.tag===13&&(r.flags|=16384))),Iu(t,e)):Fu(t)}function Fu(e){var t=e;do{if(t.flags&32768){Iu(t,Vl);return}e=t.return;var n=zc(t.alternate,t,Wl);if(n!==null){q=n;return}if(t=t.sibling,t!==null){q=t;return}q=t=e}while(t!==null);Gl===0&&(Gl=5)}function Iu(e,t){do{var n=Bc(e.alternate,e);if(n!==null){n.flags&=32767,q=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){q=e;return}q=e=n}while(e!==null);Gl=6,q=null}function Lu(e,t,n,r,a,o,s,c,l){e.cancelPendingCommit=null;do Hu();while(au!==0);if(G&6)throw Error(i(327));if(t!==null){if(t===e.current)throw Error(i(177));if(o=t.lanes|t.childLanes,o|=ti,at(e,n,o,s,c,l),e===K&&(q=K=null,J=0),su=t,ou=e,cu=n,lu=o,uu=a,du=r,t.subtreeFlags&10256||t.flags&10256?(e.callbackNode=null,e.callbackPriority=0,Xu(Le,function(){return Uu(),null})):(e.callbackNode=null,e.callbackPriority=0),r=(t.flags&13878)!=0,t.subtreeFlags&13878||r){r=D.T,D.T=null,a=O.p,O.p=2,s=G,G|=4;try{ol(e,t,n)}finally{G=s,O.p=a,D.T=r}}au=1,Ru(),zu(),Bu()}}function Ru(){if(au===1){au=0;var e=ou,t=su,n=(t.flags&13878)!=0;if(t.subtreeFlags&13878||n){n=D.T,D.T=null;var r=O.p;O.p=2;var i=G;G|=4;try{vl(t,e);var a=zd,o=jr(e.containerInfo),s=a.focusedElem,c=a.selectionRange;if(o!==s&&s&&s.ownerDocument&&Ar(s.ownerDocument.documentElement,s)){if(c!==null&&Mr(s)){var l=c.start,u=c.end;if(u===void 0&&(u=l),`selectionStart`in s)s.selectionStart=l,s.selectionEnd=Math.min(u,s.value.length);else{var d=s.ownerDocument||document,f=d&&d.defaultView||window;if(f.getSelection){var p=f.getSelection(),m=s.textContent.length,h=Math.min(c.start,m),g=c.end===void 0?h:Math.min(c.end,m);!p.extend&&h>g&&(o=g,g=h,h=o);var _=kr(s,h),v=kr(s,g);if(_&&v&&(p.rangeCount!==1||p.anchorNode!==_.node||p.anchorOffset!==_.offset||p.focusNode!==v.node||p.focusOffset!==v.offset)){var y=d.createRange();y.setStart(_.node,_.offset),p.removeAllRanges(),h>g?(p.addRange(y),p.extend(v.node,v.offset)):(y.setEnd(v.node,v.offset),p.addRange(y))}}}}for(d=[],p=s;p=p.parentNode;)p.nodeType===1&&d.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof s.focus==`function`&&s.focus(),s=0;s<d.length;s++){var b=d[s];b.element.scrollLeft=b.left,b.element.scrollTop=b.top}}sp=!!Rd,zd=Rd=null}finally{G=i,O.p=r,D.T=n}}e.current=t,au=2}}function zu(){if(au===2){au=0;var e=ou,t=su,n=(t.flags&8772)!=0;if(t.subtreeFlags&8772||n){n=D.T,D.T=null;var r=O.p;O.p=2;var i=G;G|=4;try{sl(e,t.alternate,t)}finally{G=i,O.p=r,D.T=n}}au=3}}function Bu(){if(au===4||au===3){au=0,Me();var e=ou,t=su,n=cu,r=du;t.subtreeFlags&10256||t.flags&10256?au=5:(au=0,su=ou=null,Vu(e,e.pendingLanes));var i=e.pendingLanes;if(i===0&&(iu=null),ut(n),t=t.stateNode,Ue&&typeof Ue.onCommitFiberRoot==`function`)try{Ue.onCommitFiberRoot(He,t,void 0,(t.current.flags&128)==128)}catch{}if(r!==null){t=D.T,i=O.p,O.p=2,D.T=null;try{for(var a=e.onRecoverableError,o=0;o<r.length;o++){var s=r[o];a(s.value,{componentStack:s.stack})}}finally{D.T=t,O.p=i}}cu&3&&Hu(),rd(e),i=e.pendingLanes,n&261930&&i&42?e===pu?fu++:(fu=0,pu=e):fu=0,id(0,!1)}}function Vu(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,ua(t)))}function Hu(){return Ru(),zu(),Bu(),Uu()}function Uu(){if(au!==5)return!1;var e=ou,t=lu;lu=0;var n=ut(cu),r=D.T,a=O.p;try{O.p=32>n?32:n,D.T=null,n=uu,uu=null;var o=ou,s=cu;if(au=0,su=ou=null,cu=0,G&6)throw Error(i(331));var c=G;if(G|=4,Fl(o.current),Dl(o,o.current,s,n),G=c,id(0,!1),Ue&&typeof Ue.onPostCommitFiberRoot==`function`)try{Ue.onPostCommitFiberRoot(He,o)}catch{}return!0}finally{O.p=a,D.T=r,Vu(e,t)}}function Wu(e,t,n){t=bi(n,t),t=$s(e.stateNode,t,2),e=Ga(e,t,2),e!==null&&(it(e,2),rd(e))}function Z(e,t,n){if(e.tag===3)Wu(e,e,n);else for(;t!==null;){if(t.tag===3){Wu(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError==`function`||typeof r.componentDidCatch==`function`&&(iu===null||!iu.has(r))){e=bi(n,e),n=ec(2),r=Ga(t,n,2),r!==null&&(tc(n,r,t,e),it(r,2),rd(r));break}}t=t.return}}function Gu(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new zl;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(Ul=!0,i.add(n),e=Ku.bind(null,e,t,n),t.then(e,e))}function Ku(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,K===e&&(J&n)===n&&(Gl===4||Gl===3&&(J&62914560)===J&&300>Ne()-eu?!(G&2)&&Su(e,0):Jl|=n,Xl===J&&(Xl=0)),rd(e)}function qu(e,t){t===0&&(t=nt()),e=ai(e,t),e!==null&&(it(e,t),rd(e))}function Ju(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),qu(e,n)}function Yu(e,t){var n=0;switch(e.tag){case 31:case 13:var r=e.stateNode,a=e.memoizedState;a!==null&&(n=a.retryLane);break;case 19:r=e.stateNode;break;case 22:r=e.stateNode._retryCache;break;default:throw Error(i(314))}r!==null&&r.delete(t),qu(e,n)}function Xu(e,t){return ke(e,t)}var Zu=null,Qu=null,$u=!1,ed=!1,td=!1,nd=0;function rd(e){e!==Qu&&e.next===null&&(Qu===null?Zu=Qu=e:Qu=Qu.next=e),ed=!0,$u||($u=!0,ud())}function id(e,t){if(!td&&ed){td=!0;do for(var n=!1,r=Zu;r!==null;){if(!t)if(e!==0){var i=r.pendingLanes;if(i===0)var a=0;else{var o=r.suspendedLanes,s=r.pingedLanes;a=(1<<31-Ge(42|e)+1)-1,a&=i&~(o&~s),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,ld(r,a))}else a=J,a=$e(r,r===K?a:0,r.cancelPendingCommit!==null||r.timeoutHandle!==-1),!(a&3)||et(r,a)||(n=!0,ld(r,a));r=r.next}while(n);td=!1}}function ad(){od()}function od(){ed=$u=!1;var e=0;nd!==0&&Gd()&&(e=nd);for(var t=Ne(),n=null,r=Zu;r!==null;){var i=r.next,a=sd(r,t);a===0?(r.next=null,n===null?Zu=i:n.next=i,i===null&&(Qu=n)):(n=r,(e!==0||a&3)&&(ed=!0)),r=i}au!==0&&au!==5||id(e,!1),nd!==0&&(nd=0)}function sd(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var o=31-Ge(a),s=1<<o,c=i[o];c===-1?((s&n)===0||(s&r)!==0)&&(i[o]=tt(s,t)):c<=t&&(e.expiredLanes|=s),a&=~s}if(t=K,n=J,n=$e(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r=e.callbackNode,n===0||e===t&&(Y===2||Y===9)||e.cancelPendingCommit!==null)return r!==null&&r!==null&&Ae(r),e.callbackNode=null,e.callbackPriority=0;if(!(n&3)||et(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(r!==null&&Ae(r),ut(n)){case 2:case 8:n=Ie;break;case 32:n=Le;break;case 268435456:n=ze;break;default:n=Le}return r=cd.bind(null,e),n=ke(n,r),e.callbackPriority=t,e.callbackNode=n,t}return r!==null&&r!==null&&Ae(r),e.callbackPriority=2,e.callbackNode=null,2}function cd(e,t){if(au!==0&&au!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(Hu()&&e.callbackNode!==n)return null;var r=J;return r=$e(e,e===K?r:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r===0?null:(_u(e,r,t),sd(e,Ne()),e.callbackNode!=null&&e.callbackNode===n?cd.bind(null,e):null)}function ld(e,t){if(Hu())return null;_u(e,t,!0)}function ud(){Yd(function(){G&6?ke(Fe,ad):od()})}function dd(){if(nd===0){var e=pa;e===0&&(e=Ye,Ye<<=1,!(Ye&261888)&&(Ye=256)),nd=e}return nd}function fd(e){return e==null||typeof e==`symbol`||typeof e==`boolean`?null:typeof e==`function`?e:an(``+e)}function pd(e,t){var n=t.ownerDocument.createElement(`input`);return n.name=t.name,n.value=t.value,e.id&&n.setAttribute(`form`,e.id),t.parentNode.insertBefore(n,t),e=new FormData(e),n.parentNode.removeChild(n),e}function md(e,t,n,r,i){if(t===`submit`&&n&&n.stateNode===i){var a=fd((i[ht]||null).action),o=r.submitter;o&&(t=(t=o[ht]||null)?fd(t.formAction):o.getAttribute(`formAction`),t!==null&&(a=t,o=null));var s=new Dn(`action`,`action`,null,r,i);e.push({event:s,listeners:[{instance:null,listener:function(){if(r.defaultPrevented){if(nd!==0){var e=o?pd(i,o):new FormData(i);Ts(n,{pending:!0,data:e,method:i.method,action:a},null,e)}}else typeof a==`function`&&(s.preventDefault(),e=o?pd(i,o):new FormData(i),Ts(n,{pending:!0,data:e,method:i.method,action:a},a,e))},currentTarget:i}]})}}for(var hd=0;hd<Xr.length;hd++){var gd=Xr[hd];Zr(gd.toLowerCase(),`on`+(gd[0].toUpperCase()+gd.slice(1)))}Zr(Hr,`onAnimationEnd`),Zr(Ur,`onAnimationIteration`),Zr(Wr,`onAnimationStart`),Zr(`dblclick`,`onDoubleClick`),Zr(`focusin`,`onFocus`),Zr(`focusout`,`onBlur`),Zr(Gr,`onTransitionRun`),Zr(Kr,`onTransitionStart`),Zr(qr,`onTransitionCancel`),Zr(Jr,`onTransitionEnd`),At(`onMouseEnter`,[`mouseout`,`mouseover`]),At(`onMouseLeave`,[`mouseout`,`mouseover`]),At(`onPointerEnter`,[`pointerout`,`pointerover`]),At(`onPointerLeave`,[`pointerout`,`pointerover`]),kt(`onChange`,`change click focusin focusout input keydown keyup selectionchange`.split(` `)),kt(`onSelect`,`focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(` `)),kt(`onBeforeInput`,[`compositionend`,`keypress`,`textInput`,`paste`]),kt(`onCompositionEnd`,`compositionend focusout keydown keypress keyup mousedown`.split(` `)),kt(`onCompositionStart`,`compositionstart focusout keydown keypress keyup mousedown`.split(` `)),kt(`onCompositionUpdate`,`compositionupdate focusout keydown keypress keyup mousedown`.split(` `));var _d=`abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(` `),vd=new Set(`beforetoggle cancel close invalid load scroll scrollend toggle`.split(` `).concat(_d));function yd(e,t){t=(t&4)!=0;for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;a:{var a=void 0;if(t)for(var o=r.length-1;0<=o;o--){var s=r[o],c=s.instance,l=s.currentTarget;if(s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){Qr(e)}i.currentTarget=null,a=c}else for(o=0;o<r.length;o++){if(s=r[o],c=s.instance,l=s.currentTarget,s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){Qr(e)}i.currentTarget=null,a=c}}}}function Q(e,t){var n=t[j];n===void 0&&(n=t[j]=new Set);var r=e+`__bubble`;n.has(r)||(Cd(t,e,2,!1),n.add(r))}function bd(e,t,n){var r=0;t&&(r|=4),Cd(n,e,r,t)}var xd=`_reactListening`+Math.random().toString(36).slice(2);function Sd(e){if(!e[xd]){e[xd]=!0,Dt.forEach(function(t){t!==`selectionchange`&&(vd.has(t)||bd(t,!1,e),bd(t,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[xd]||(t[xd]=!0,bd(`selectionchange`,!1,t))}}function Cd(e,t,n,r){switch(mp(t)){case 2:var i=cp;break;case 8:i=lp;break;default:i=up}n=i.bind(null,t,n,e),i=void 0,!gn||t!==`touchstart`&&t!==`touchmove`&&t!==`wheel`||(i=!0),r?i===void 0?e.addEventListener(t,n,!0):e.addEventListener(t,n,{capture:!0,passive:i}):i===void 0?e.addEventListener(t,n,!1):e.addEventListener(t,n,{passive:i})}function wd(e,t,n,r,i){var a=r;if(!(t&1)&&!(t&2)&&r!==null)a:for(;;){if(r===null)return;var s=r.tag;if(s===3||s===4){var c=r.stateNode.containerInfo;if(c===i)break;if(s===4)for(s=r.return;s!==null;){var l=s.tag;if((l===3||l===4)&&s.stateNode.containerInfo===i)return;s=s.return}for(;c!==null;){if(s=St(c),s===null)return;if(l=s.tag,l===5||l===6||l===26||l===27){r=a=s;continue a}c=c.parentNode}}r=r.return}pn(function(){var r=a,i=cn(n),s=[];a:{var c=Yr.get(e);if(c!==void 0){var l=Dn,u=e;switch(e){case`keypress`:if(Sn(n)===0)break a;case`keydown`:case`keyup`:l=Gn;break;case`focusin`:u=`focus`,l=In;break;case`focusout`:u=`blur`,l=In;break;case`beforeblur`:case`afterblur`:l=In;break;case`click`:if(n.button===2)break a;case`auxclick`:case`dblclick`:case`mousedown`:case`mousemove`:case`mouseup`:case`mouseout`:case`mouseover`:case`contextmenu`:l=Pn;break;case`drag`:case`dragend`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`dragstart`:case`drop`:l=Fn;break;case`touchcancel`:case`touchend`:case`touchmove`:case`touchstart`:l=qn;break;case Hr:case Ur:case Wr:l=Ln;break;case Jr:l=Jn;break;case`scroll`:case`scrollend`:l=kn;break;case`wheel`:l=Yn;break;case`copy`:case`cut`:case`paste`:l=Rn;break;case`gotpointercapture`:case`lostpointercapture`:case`pointercancel`:case`pointerdown`:case`pointermove`:case`pointerout`:case`pointerover`:case`pointerup`:l=Kn;break;case`toggle`:case`beforetoggle`:l=Xn}var d=(t&4)!=0,f=!d&&(e===`scroll`||e===`scrollend`),p=d?c===null?null:c+`Capture`:c;d=[];for(var m=r,h;m!==null;){var g=m;if(h=g.stateNode,g=g.tag,g!==5&&g!==26&&g!==27||h===null||p===null||(g=mn(m,p),g!=null&&d.push(Td(m,g,h))),f)break;m=m.return}0<d.length&&(c=new l(c,u,null,n,i),s.push({event:c,listeners:d}))}}if(!(t&7)){a:{if(c=e===`mouseover`||e===`pointerover`,l=e===`mouseout`||e===`pointerout`,c&&n!==sn&&(u=n.relatedTarget||n.fromElement)&&(St(u)||u[gt]))break a;if((l||c)&&(c=i.window===i?i:(c=i.ownerDocument)?c.defaultView||c.parentWindow:window,l?(u=n.relatedTarget||n.toElement,l=r,u=u?St(u):null,u!==null&&(f=o(u),d=u.tag,u!==f||d!==5&&d!==27&&d!==6)&&(u=null)):(l=null,u=r),l!==u)){if(d=Pn,g=`onMouseLeave`,p=`onMouseEnter`,m=`mouse`,(e===`pointerout`||e===`pointerover`)&&(d=Kn,g=`onPointerLeave`,p=`onPointerEnter`,m=`pointer`),f=l==null?c:wt(l),h=u==null?c:wt(u),c=new d(g,m+`leave`,l,n,i),c.target=f,c.relatedTarget=h,g=null,St(i)===r&&(d=new d(p,m+`enter`,u,n,i),d.target=h,d.relatedTarget=f,g=d),f=g,l&&u)b:{for(d=Dd,p=l,m=u,h=0,g=p;g;g=d(g))h++;g=0;for(var _=m;_;_=d(_))g++;for(;0<h-g;)p=d(p),h--;for(;0<g-h;)m=d(m),g--;for(;h--;){if(p===m||m!==null&&p===m.alternate){d=p;break b}p=d(p),m=d(m)}d=null}else d=null;l!==null&&Od(s,c,l,d,!1),u!==null&&f!==null&&Od(s,f,u,d,!0)}}a:{if(c=r?wt(r):window,l=c.nodeName&&c.nodeName.toLowerCase(),l===`select`||l===`input`&&c.type===`file`)var v=hr;else if(ur(c))if(gr)v=wr;else{v=Cr;var y=Sr}else l=c.nodeName,!l||l.toLowerCase()!==`input`||c.type!==`checkbox`&&c.type!==`radio`?r&&tn(r.elementType)&&(v=hr):v=P;if(v&&=v(e,r)){dr(s,v,n,i);break a}y&&y(e,c,r),e===`focusout`&&r&&c.type===`number`&&r.memoizedProps.value!=null&&qt(c,`number`,c.value)}switch(y=r?wt(r):window,e){case`focusin`:(ur(y)||y.contentEditable===`true`)&&(Nr=y,I=r,Pr=null);break;case`focusout`:Pr=I=Nr=null;break;case`mousedown`:Fr=!0;break;case`contextmenu`:case`mouseup`:case`dragend`:Fr=!1,Ir(s,n,i);break;case`selectionchange`:if(F)break;case`keydown`:case`keyup`:Ir(s,n,i)}var b;if(Qn)b:{switch(e){case`compositionstart`:var x=`onCompositionStart`;break b;case`compositionend`:x=`onCompositionEnd`;break b;case`compositionupdate`:x=`onCompositionUpdate`;break b}x=void 0}else or?ir(e,n)&&(x=`onCompositionEnd`):e===`keydown`&&n.keyCode===229&&(x=`onCompositionStart`);x&&(tr&&n.locale!==`ko`&&(or||x!==`onCompositionStart`?x===`onCompositionEnd`&&or&&(b=xn()):(vn=i,yn=`value`in vn?vn.value:vn.textContent,or=!0)),y=Ed(r,x),0<y.length&&(x=new zn(x,e,null,n,i),s.push({event:x,listeners:y}),b?x.data=b:(b=ar(n),b!==null&&(x.data=b)))),(b=er?sr(e,n):cr(e,n))&&(x=Ed(r,`onBeforeInput`),0<x.length&&(y=new zn(`onBeforeInput`,`beforeinput`,null,n,i),s.push({event:y,listeners:x}),y.data=b)),md(s,e,r,n,i)}yd(s,t)})}function Td(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Ed(e,t){for(var n=t+`Capture`,r=[];e!==null;){var i=e,a=i.stateNode;if(i=i.tag,i!==5&&i!==26&&i!==27||a===null||(i=mn(e,n),i!=null&&r.unshift(Td(e,i,a)),i=mn(e,t),i!=null&&r.push(Td(e,i,a))),e.tag===3)return r;e=e.return}return[]}function Dd(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Od(e,t,n,r,i){for(var a=t._reactName,o=[];n!==null&&n!==r;){var s=n,c=s.alternate,l=s.stateNode;if(s=s.tag,c!==null&&c===r)break;s!==5&&s!==26&&s!==27||l===null||(c=l,i?(l=mn(n,a),l!=null&&o.unshift(Td(n,l,c))):i||(l=mn(n,a),l!=null&&o.push(Td(n,l,c)))),n=n.return}o.length!==0&&e.push({event:t,listeners:o})}var kd=/\r\n?/g,Ad=/\u0000|\uFFFD/g;function jd(e){return(typeof e==`string`?e:``+e).replace(kd,`
`).replace(Ad,``)}function Md(e,t){return t=jd(t),jd(e)===t}function $(e,t,n,r,a,o){switch(n){case`children`:typeof r==`string`?t===`body`||t===`textarea`&&r===``||Zt(e,r):(typeof r==`number`||typeof r==`bigint`)&&t!==`body`&&Zt(e,``+r);break;case`className`:It(e,`class`,r);break;case`tabIndex`:It(e,`tabindex`,r);break;case`dir`:case`role`:case`viewBox`:case`width`:case`height`:It(e,n,r);break;case`style`:en(e,r,o);break;case`data`:if(t!==`object`){It(e,`data`,r);break}case`src`:case`href`:if(r===``&&(t!==`a`||n!==`href`)){e.removeAttribute(n);break}if(r==null||typeof r==`function`||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=an(``+r),e.setAttribute(n,r);break;case`action`:case`formAction`:if(typeof r==`function`){e.setAttribute(n,`javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')`);break}else typeof o==`function`&&(n===`formAction`?(t!==`input`&&$(e,t,`name`,a.name,a,null),$(e,t,`formEncType`,a.formEncType,a,null),$(e,t,`formMethod`,a.formMethod,a,null),$(e,t,`formTarget`,a.formTarget,a,null)):($(e,t,`encType`,a.encType,a,null),$(e,t,`method`,a.method,a,null),$(e,t,`target`,a.target,a,null)));if(r==null||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=an(``+r),e.setAttribute(n,r);break;case`onClick`:r!=null&&(e.onclick=on);break;case`onScroll`:r!=null&&Q(`scroll`,e);break;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));e.innerHTML=n}}break;case`multiple`:e.multiple=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`muted`:e.muted=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`defaultValue`:case`defaultChecked`:case`innerHTML`:case`ref`:break;case`autoFocus`:break;case`xlinkHref`:if(r==null||typeof r==`function`||typeof r==`boolean`||typeof r==`symbol`){e.removeAttribute(`xlink:href`);break}n=an(``+r),e.setAttributeNS(`http://www.w3.org/1999/xlink`,`xlink:href`,n);break;case`contentEditable`:case`spellCheck`:case`draggable`:case`value`:case`autoReverse`:case`externalResourcesRequired`:case`focusable`:case`preserveAlpha`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``+r):e.removeAttribute(n);break;case`inert`:case`allowFullScreen`:case`async`:case`autoPlay`:case`controls`:case`default`:case`defer`:case`disabled`:case`disablePictureInPicture`:case`disableRemotePlayback`:case`formNoValidate`:case`hidden`:case`loop`:case`noModule`:case`noValidate`:case`open`:case`playsInline`:case`readOnly`:case`required`:case`reversed`:case`scoped`:case`seamless`:case`itemScope`:r&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``):e.removeAttribute(n);break;case`capture`:case`download`:!0===r?e.setAttribute(n,``):!1!==r&&r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,r):e.removeAttribute(n);break;case`cols`:case`rows`:case`size`:case`span`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`&&!isNaN(r)&&1<=r?e.setAttribute(n,r):e.removeAttribute(n);break;case`rowSpan`:case`start`:r==null||typeof r==`function`||typeof r==`symbol`||isNaN(r)?e.removeAttribute(n):e.setAttribute(n,r);break;case`popover`:Q(`beforetoggle`,e),Q(`toggle`,e),Ft(e,`popover`,r);break;case`xlinkActuate`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:actuate`,r);break;case`xlinkArcrole`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:arcrole`,r);break;case`xlinkRole`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:role`,r);break;case`xlinkShow`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:show`,r);break;case`xlinkTitle`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:title`,r);break;case`xlinkType`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:type`,r);break;case`xmlBase`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:base`,r);break;case`xmlLang`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:lang`,r);break;case`xmlSpace`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:space`,r);break;case`is`:Ft(e,`is`,r);break;case`innerText`:case`textContent`:break;default:(!(2<n.length)||n[0]!==`o`&&n[0]!==`O`||n[1]!==`n`&&n[1]!==`N`)&&(n=nn.get(n)||n,Ft(e,n,r))}}function Nd(e,t,n,r,a,o){switch(n){case`style`:en(e,r,o);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));e.innerHTML=n}}break;case`children`:typeof r==`string`?Zt(e,r):(typeof r==`number`||typeof r==`bigint`)&&Zt(e,``+r);break;case`onScroll`:r!=null&&Q(`scroll`,e);break;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);break;case`onClick`:r!=null&&(e.onclick=on);break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`innerHTML`:case`ref`:break;case`innerText`:case`textContent`:break;default:if(!Ot.hasOwnProperty(n))a:{if(n[0]===`o`&&n[1]===`n`&&(a=n.endsWith(`Capture`),t=n.slice(2,a?n.length-7:void 0),o=e[ht]||null,o=o==null?null:o[n],typeof o==`function`&&e.removeEventListener(t,o,a),typeof r==`function`)){typeof o!=`function`&&o!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(t,r,a);break a}n in e?e[n]=r:!0===r?e.setAttribute(n,``):Ft(e,n,r)}}}function Pd(e,t,n){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`img`:Q(`error`,e),Q(`load`,e);var r=!1,a=!1,o;for(o in n)if(n.hasOwnProperty(o)){var s=n[o];if(s!=null)switch(o){case`src`:r=!0;break;case`srcSet`:a=!0;break;case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:$(e,t,o,s,n,null)}}a&&$(e,t,`srcSet`,n.srcSet,n,null),r&&$(e,t,`src`,n.src,n,null);return;case`input`:Q(`invalid`,e);var c=o=s=a=null,l=null,u=null;for(r in n)if(n.hasOwnProperty(r)){var d=n[r];if(d!=null)switch(r){case`name`:a=d;break;case`type`:s=d;break;case`checked`:l=d;break;case`defaultChecked`:u=d;break;case`value`:o=d;break;case`defaultValue`:c=d;break;case`children`:case`dangerouslySetInnerHTML`:if(d!=null)throw Error(i(137,t));break;default:$(e,t,r,d,n,null)}}Kt(e,o,c,l,u,s,a,!1);return;case`select`:for(a in Q(`invalid`,e),r=s=o=null,n)if(n.hasOwnProperty(a)&&(c=n[a],c!=null))switch(a){case`value`:o=c;break;case`defaultValue`:s=c;break;case`multiple`:r=c;default:$(e,t,a,c,n,null)}t=o,n=s,e.multiple=!!r,t==null?n!=null&&Jt(e,!!r,n,!0):Jt(e,!!r,t,!1);return;case`textarea`:for(s in Q(`invalid`,e),o=a=r=null,n)if(n.hasOwnProperty(s)&&(c=n[s],c!=null))switch(s){case`value`:r=c;break;case`defaultValue`:a=c;break;case`children`:o=c;break;case`dangerouslySetInnerHTML`:if(c!=null)throw Error(i(91));break;default:$(e,t,s,c,n,null)}Xt(e,r,a,o);return;case`option`:for(l in n)if(n.hasOwnProperty(l)&&(r=n[l],r!=null))switch(l){case`selected`:e.selected=r&&typeof r!=`function`&&typeof r!=`symbol`;break;default:$(e,t,l,r,n,null)}return;case`dialog`:Q(`beforetoggle`,e),Q(`toggle`,e),Q(`cancel`,e),Q(`close`,e);break;case`iframe`:case`object`:Q(`load`,e);break;case`video`:case`audio`:for(r=0;r<_d.length;r++)Q(_d[r],e);break;case`image`:Q(`error`,e),Q(`load`,e);break;case`details`:Q(`toggle`,e);break;case`embed`:case`source`:case`link`:Q(`error`,e),Q(`load`,e);case`area`:case`base`:case`br`:case`col`:case`hr`:case`keygen`:case`meta`:case`param`:case`track`:case`wbr`:case`menuitem`:for(u in n)if(n.hasOwnProperty(u)&&(r=n[u],r!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:$(e,t,u,r,n,null)}return;default:if(tn(t)){for(d in n)n.hasOwnProperty(d)&&(r=n[d],r!==void 0&&Nd(e,t,d,r,n,void 0));return}}for(c in n)n.hasOwnProperty(c)&&(r=n[c],r!=null&&$(e,t,c,r,n,null))}function Fd(e,t,n,r){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`input`:var a=null,o=null,s=null,c=null,l=null,u=null,d=null;for(m in n){var f=n[m];if(n.hasOwnProperty(m)&&f!=null)switch(m){case`checked`:break;case`value`:break;case`defaultValue`:l=f;default:r.hasOwnProperty(m)||$(e,t,m,null,r,f)}}for(var p in r){var m=r[p];if(f=n[p],r.hasOwnProperty(p)&&(m!=null||f!=null))switch(p){case`type`:o=m;break;case`name`:a=m;break;case`checked`:u=m;break;case`defaultChecked`:d=m;break;case`value`:s=m;break;case`defaultValue`:c=m;break;case`children`:case`dangerouslySetInnerHTML`:if(m!=null)throw Error(i(137,t));break;default:m!==f&&$(e,t,p,m,r,f)}}Gt(e,s,c,l,u,d,o,a);return;case`select`:for(o in m=s=c=p=null,n)if(l=n[o],n.hasOwnProperty(o)&&l!=null)switch(o){case`value`:break;case`multiple`:m=l;default:r.hasOwnProperty(o)||$(e,t,o,null,r,l)}for(a in r)if(o=r[a],l=n[a],r.hasOwnProperty(a)&&(o!=null||l!=null))switch(a){case`value`:p=o;break;case`defaultValue`:c=o;break;case`multiple`:s=o;default:o!==l&&$(e,t,a,o,r,l)}t=c,n=s,r=m,p==null?!!r!=!!n&&(t==null?Jt(e,!!n,n?[]:``,!1):Jt(e,!!n,t,!0)):Jt(e,!!n,p,!1);return;case`textarea`:for(c in m=p=null,n)if(a=n[c],n.hasOwnProperty(c)&&a!=null&&!r.hasOwnProperty(c))switch(c){case`value`:break;case`children`:break;default:$(e,t,c,null,r,a)}for(s in r)if(a=r[s],o=n[s],r.hasOwnProperty(s)&&(a!=null||o!=null))switch(s){case`value`:p=a;break;case`defaultValue`:m=a;break;case`children`:break;case`dangerouslySetInnerHTML`:if(a!=null)throw Error(i(91));break;default:a!==o&&$(e,t,s,a,r,o)}Yt(e,p,m);return;case`option`:for(var h in n)if(p=n[h],n.hasOwnProperty(h)&&p!=null&&!r.hasOwnProperty(h))switch(h){case`selected`:e.selected=!1;break;default:$(e,t,h,null,r,p)}for(l in r)if(p=r[l],m=n[l],r.hasOwnProperty(l)&&p!==m&&(p!=null||m!=null))switch(l){case`selected`:e.selected=p&&typeof p!=`function`&&typeof p!=`symbol`;break;default:$(e,t,l,p,r,m)}return;case`img`:case`link`:case`area`:case`base`:case`br`:case`col`:case`embed`:case`hr`:case`keygen`:case`meta`:case`param`:case`source`:case`track`:case`wbr`:case`menuitem`:for(var g in n)p=n[g],n.hasOwnProperty(g)&&p!=null&&!r.hasOwnProperty(g)&&$(e,t,g,null,r,p);for(u in r)if(p=r[u],m=n[u],r.hasOwnProperty(u)&&p!==m&&(p!=null||m!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:if(p!=null)throw Error(i(137,t));break;default:$(e,t,u,p,r,m)}return;default:if(tn(t)){for(var _ in n)p=n[_],n.hasOwnProperty(_)&&p!==void 0&&!r.hasOwnProperty(_)&&Nd(e,t,_,void 0,r,p);for(d in r)p=r[d],m=n[d],!r.hasOwnProperty(d)||p===m||p===void 0&&m===void 0||Nd(e,t,d,p,r,m);return}}for(var v in n)p=n[v],n.hasOwnProperty(v)&&p!=null&&!r.hasOwnProperty(v)&&$(e,t,v,null,r,p);for(f in r)p=r[f],m=n[f],!r.hasOwnProperty(f)||p===m||p==null&&m==null||$(e,t,f,p,r,m)}function Id(e){switch(e){case`css`:case`script`:case`font`:case`img`:case`image`:case`input`:case`link`:return!0;default:return!1}}function Ld(){if(typeof performance.getEntriesByType==`function`){for(var e=0,t=0,n=performance.getEntriesByType(`resource`),r=0;r<n.length;r++){var i=n[r],a=i.transferSize,o=i.initiatorType,s=i.duration;if(a&&s&&Id(o)){for(o=0,s=i.responseEnd,r+=1;r<n.length;r++){var c=n[r],l=c.startTime;if(l>s)break;var u=c.transferSize,d=c.initiatorType;u&&Id(d)&&(c=c.responseEnd,o+=u*(c<s?1:(s-l)/(c-l)))}if(--r,t+=8*(a+o)/(i.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e==`number`)?e:5}var Rd=null,zd=null;function Bd(e){return e.nodeType===9?e:e.ownerDocument}function Vd(e){switch(e){case`http://www.w3.org/2000/svg`:return 1;case`http://www.w3.org/1998/Math/MathML`:return 2;default:return 0}}function Hd(e,t){if(e===0)switch(t){case`svg`:return 1;case`math`:return 2;default:return 0}return e===1&&t===`foreignObject`?0:e}function Ud(e,t){return e===`textarea`||e===`noscript`||typeof t.children==`string`||typeof t.children==`number`||typeof t.children==`bigint`||typeof t.dangerouslySetInnerHTML==`object`&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Wd=null;function Gd(){var e=window.event;return e&&e.type===`popstate`?e===Wd?!1:(Wd=e,!0):(Wd=null,!1)}var Kd=typeof setTimeout==`function`?setTimeout:void 0,qd=typeof clearTimeout==`function`?clearTimeout:void 0,Jd=typeof Promise==`function`?Promise:void 0,Yd=typeof queueMicrotask==`function`?queueMicrotask:Jd===void 0?Kd:function(e){return Jd.resolve(null).then(e).catch(Xd)};function Xd(e){setTimeout(function(){throw e})}function Zd(e){return e===`head`}function Qd(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8)if(n=i.data,n===`/$`||n===`/&`){if(r===0){e.removeChild(i),Np(t);return}r--}else if(n===`$`||n===`$?`||n===`$~`||n===`$!`||n===`&`)r++;else if(n===`html`)pf(e.ownerDocument.documentElement);else if(n===`head`){n=e.ownerDocument.head,pf(n);for(var a=n.firstChild;a;){var o=a.nextSibling,s=a.nodeName;a[bt]||s===`SCRIPT`||s===`STYLE`||s===`LINK`&&a.rel.toLowerCase()===`stylesheet`||n.removeChild(a),a=o}}else n===`body`&&pf(e.ownerDocument.body);n=i}while(n);Np(t)}function $d(e,t){var n=e;e=0;do{var r=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display=`none`):(n.style.display=n._stashedDisplay||``,n.getAttribute(`style`)===``&&n.removeAttribute(`style`)):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=``):n.nodeValue=n._stashedText||``),r&&r.nodeType===8)if(n=r.data,n===`/$`){if(e===0)break;e--}else n!==`$`&&n!==`$?`&&n!==`$~`&&n!==`$!`||e++;n=r}while(n)}function ef(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case`HTML`:case`HEAD`:case`BODY`:ef(n),xt(n);continue;case`SCRIPT`:case`STYLE`:continue;case`LINK`:if(n.rel.toLowerCase()===`stylesheet`)continue}e.removeChild(n)}}function tf(e,t,n,r){for(;e.nodeType===1;){var i=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!r&&(e.nodeName!==`INPUT`||e.type!==`hidden`))break}else if(!r)if(t===`input`&&e.type===`hidden`){var a=i.name==null?null:``+i.name;if(i.type===`hidden`&&e.getAttribute(`name`)===a)return e}else return e;else if(!e[bt])switch(t){case`meta`:if(!e.hasAttribute(`itemprop`))break;return e;case`link`:if(a=e.getAttribute(`rel`),a===`stylesheet`&&e.hasAttribute(`data-precedence`)||a!==i.rel||e.getAttribute(`href`)!==(i.href==null||i.href===``?null:i.href)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin)||e.getAttribute(`title`)!==(i.title==null?null:i.title))break;return e;case`style`:if(e.hasAttribute(`data-precedence`))break;return e;case`script`:if(a=e.getAttribute(`src`),(a!==(i.src==null?null:i.src)||e.getAttribute(`type`)!==(i.type==null?null:i.type)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin))&&a&&e.hasAttribute(`async`)&&!e.hasAttribute(`itemprop`))break;return e;default:return e}if(e=cf(e.nextSibling),e===null)break}return null}function nf(e,t,n){if(t===``)return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!n||(e=cf(e.nextSibling),e===null))return null;return e}function rf(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!t||(e=cf(e.nextSibling),e===null))return null;return e}function af(e){return e.data===`$?`||e.data===`$~`}function of(e){return e.data===`$!`||e.data===`$?`&&e.ownerDocument.readyState!==`loading`}function sf(e,t){var n=e.ownerDocument;if(e.data===`$~`)e._reactRetry=t;else if(e.data!==`$?`||n.readyState!==`loading`)t();else{var r=function(){t(),n.removeEventListener(`DOMContentLoaded`,r)};n.addEventListener(`DOMContentLoaded`,r),e._reactRetry=r}}function cf(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t===`$`||t===`$!`||t===`$?`||t===`$~`||t===`&`||t===`F!`||t===`F`)break;if(t===`/$`||t===`/&`)return null}}return e}var lf=null;function uf(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`/$`||n===`/&`){if(t===0)return cf(e.nextSibling);t--}else n!==`$`&&n!==`$!`&&n!==`$?`&&n!==`$~`&&n!==`&`||t++}e=e.nextSibling}return null}function df(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`$`||n===`$!`||n===`$?`||n===`$~`||n===`&`){if(t===0)return e;t--}else n!==`/$`&&n!==`/&`||t++}e=e.previousSibling}return null}function ff(e,t,n){switch(t=Bd(n),e){case`html`:if(e=t.documentElement,!e)throw Error(i(452));return e;case`head`:if(e=t.head,!e)throw Error(i(453));return e;case`body`:if(e=t.body,!e)throw Error(i(454));return e;default:throw Error(i(451))}}function pf(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);xt(e)}var mf=new Map,hf=new Set;function gf(e){return typeof e.getRootNode==`function`?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var _f=O.d;O.d={f:vf,r:yf,D:Sf,C:Cf,L:wf,m:Tf,X:Df,S:Ef,M:Of};function vf(){var e=_f.f(),t=bu();return e||t}function yf(e){var t=Ct(e);t!==null&&t.tag===5&&t.type===`form`?Ds(t):_f.r(e)}var bf=typeof document>`u`?null:document;function xf(e,t,n){var r=bf;if(r&&typeof t==`string`&&t){var i=Wt(t);i=`link[rel="`+e+`"][href="`+i+`"]`,typeof n==`string`&&(i+=`[crossorigin="`+n+`"]`),hf.has(i)||(hf.add(i),e={rel:e,crossOrigin:n,href:t},r.querySelector(i)===null&&(t=r.createElement(`link`),Pd(t,`link`,e),Et(t),r.head.appendChild(t)))}}function Sf(e){_f.D(e),xf(`dns-prefetch`,e,null)}function Cf(e,t){_f.C(e,t),xf(`preconnect`,e,t)}function wf(e,t,n){_f.L(e,t,n);var r=bf;if(r&&e&&t){var i=`link[rel="preload"][as="`+Wt(t)+`"]`;t===`image`&&n&&n.imageSrcSet?(i+=`[imagesrcset="`+Wt(n.imageSrcSet)+`"]`,typeof n.imageSizes==`string`&&(i+=`[imagesizes="`+Wt(n.imageSizes)+`"]`)):i+=`[href="`+Wt(e)+`"]`;var a=i;switch(t){case`style`:a=Af(e);break;case`script`:a=Pf(e)}mf.has(a)||(e=m({rel:`preload`,href:t===`image`&&n&&n.imageSrcSet?void 0:e,as:t},n),mf.set(a,e),r.querySelector(i)!==null||t===`style`&&r.querySelector(jf(a))||t===`script`&&r.querySelector(Ff(a))||(t=r.createElement(`link`),Pd(t,`link`,e),Et(t),r.head.appendChild(t)))}}function Tf(e,t){_f.m(e,t);var n=bf;if(n&&e){var r=t&&typeof t.as==`string`?t.as:`script`,i=`link[rel="modulepreload"][as="`+Wt(r)+`"][href="`+Wt(e)+`"]`,a=i;switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:a=Pf(e)}if(!mf.has(a)&&(e=m({rel:`modulepreload`,href:e},t),mf.set(a,e),n.querySelector(i)===null)){switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:if(n.querySelector(Ff(a)))return}r=n.createElement(`link`),Pd(r,`link`,e),Et(r),n.head.appendChild(r)}}}function Ef(e,t,n){_f.S(e,t,n);var r=bf;if(r&&e){var i=Tt(r).hoistableStyles,a=Af(e);t||=`default`;var o=i.get(a);if(!o){var s={loading:0,preload:null};if(o=r.querySelector(jf(a)))s.loading=5;else{e=m({rel:`stylesheet`,href:e,"data-precedence":t},n),(n=mf.get(a))&&Rf(e,n);var c=o=r.createElement(`link`);Et(c),Pd(c,`link`,e),c._p=new Promise(function(e,t){c.onload=e,c.onerror=t}),c.addEventListener(`load`,function(){s.loading|=1}),c.addEventListener(`error`,function(){s.loading|=2}),s.loading|=4,Lf(o,t,r)}o={type:`stylesheet`,instance:o,count:1,state:s},i.set(a,o)}}}function Df(e,t){_f.X(e,t);var n=bf;if(n&&e){var r=Tt(n).hoistableScripts,i=Pf(e),a=r.get(i);a||(a=n.querySelector(Ff(i)),a||(e=m({src:e,async:!0},t),(t=mf.get(i))&&zf(e,t),a=n.createElement(`script`),Et(a),Pd(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Of(e,t){_f.M(e,t);var n=bf;if(n&&e){var r=Tt(n).hoistableScripts,i=Pf(e),a=r.get(i);a||(a=n.querySelector(Ff(i)),a||(e=m({src:e,async:!0,type:`module`},t),(t=mf.get(i))&&zf(e,t),a=n.createElement(`script`),Et(a),Pd(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function kf(e,t,n,r){var a=(a=he.current)?gf(a):null;if(!a)throw Error(i(446));switch(e){case`meta`:case`title`:return null;case`style`:return typeof n.precedence==`string`&&typeof n.href==`string`?(t=Af(n.href),n=Tt(a).hoistableStyles,r=n.get(t),r||(r={type:`style`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};case`link`:if(n.rel===`stylesheet`&&typeof n.href==`string`&&typeof n.precedence==`string`){e=Af(n.href);var o=Tt(a).hoistableStyles,s=o.get(e);if(s||(a=a.ownerDocument||a,s={type:`stylesheet`,instance:null,count:0,state:{loading:0,preload:null}},o.set(e,s),(o=a.querySelector(jf(e)))&&!o._p&&(s.instance=o,s.state.loading=5),mf.has(e)||(n={rel:`preload`,as:`style`,href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},mf.set(e,n),o||Nf(a,e,n,s.state))),t&&r===null)throw Error(i(528,``));return s}if(t&&r!==null)throw Error(i(529,``));return null;case`script`:return t=n.async,n=n.src,typeof n==`string`&&t&&typeof t!=`function`&&typeof t!=`symbol`?(t=Pf(n),n=Tt(a).hoistableScripts,r=n.get(t),r||(r={type:`script`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};default:throw Error(i(444,e))}}function Af(e){return`href="`+Wt(e)+`"`}function jf(e){return`link[rel="stylesheet"][`+e+`]`}function Mf(e){return m({},e,{"data-precedence":e.precedence,precedence:null})}function Nf(e,t,n,r){e.querySelector(`link[rel="preload"][as="style"][`+t+`]`)?r.loading=1:(t=e.createElement(`link`),r.preload=t,t.addEventListener(`load`,function(){return r.loading|=1}),t.addEventListener(`error`,function(){return r.loading|=2}),Pd(t,`link`,n),Et(t),e.head.appendChild(t))}function Pf(e){return`[src="`+Wt(e)+`"]`}function Ff(e){return`script[async]`+e}function If(e,t,n){if(t.count++,t.instance===null)switch(t.type){case`style`:var r=e.querySelector(`style[data-href~="`+Wt(n.href)+`"]`);if(r)return t.instance=r,Et(r),r;var a=m({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return r=(e.ownerDocument||e).createElement(`style`),Et(r),Pd(r,`style`,a),Lf(r,n.precedence,e),t.instance=r;case`stylesheet`:a=Af(n.href);var o=e.querySelector(jf(a));if(o)return t.state.loading|=4,t.instance=o,Et(o),o;r=Mf(n),(a=mf.get(a))&&Rf(r,a),o=(e.ownerDocument||e).createElement(`link`),Et(o);var s=o;return s._p=new Promise(function(e,t){s.onload=e,s.onerror=t}),Pd(o,`link`,r),t.state.loading|=4,Lf(o,n.precedence,e),t.instance=o;case`script`:return o=Pf(n.src),(a=e.querySelector(Ff(o)))?(t.instance=a,Et(a),a):(r=n,(a=mf.get(o))&&(r=m({},n),zf(r,a)),e=e.ownerDocument||e,a=e.createElement(`script`),Et(a),Pd(a,`link`,r),e.head.appendChild(a),t.instance=a);case`void`:return null;default:throw Error(i(443,t.type))}else t.type===`stylesheet`&&!(t.state.loading&4)&&(r=t.instance,t.state.loading|=4,Lf(r,n.precedence,e));return t.instance}function Lf(e,t,n){for(var r=n.querySelectorAll(`link[rel="stylesheet"][data-precedence],style[data-precedence]`),i=r.length?r[r.length-1]:null,a=i,o=0;o<r.length;o++){var s=r[o];if(s.dataset.precedence===t)a=s;else if(a!==i)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function Rf(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.title??=t.title}function zf(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.integrity??=t.integrity}var Bf=null;function Vf(e,t,n){if(Bf===null){var r=new Map,i=Bf=new Map;i.set(n,r)}else i=Bf,r=i.get(n),r||(r=new Map,i.set(n,r));if(r.has(e))return r;for(r.set(e,null),n=n.getElementsByTagName(e),i=0;i<n.length;i++){var a=n[i];if(!(a[bt]||a[mt]||e===`link`&&a.getAttribute(`rel`)===`stylesheet`)&&a.namespaceURI!==`http://www.w3.org/2000/svg`){var o=a.getAttribute(t)||``;o=e+o;var s=r.get(o);s?s.push(a):r.set(o,[a])}}return r}function Hf(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t===`title`?e.querySelector(`head > title`):null)}function Uf(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case`meta`:case`title`:return!0;case`style`:if(typeof t.precedence!=`string`||typeof t.href!=`string`||t.href===``)break;return!0;case`link`:if(typeof t.rel!=`string`||typeof t.href!=`string`||t.href===``||t.onLoad||t.onError)break;switch(t.rel){case`stylesheet`:return e=t.disabled,typeof t.precedence==`string`&&e==null;default:return!0}case`script`:if(t.async&&typeof t.async!=`function`&&typeof t.async!=`symbol`&&!t.onLoad&&!t.onError&&t.src&&typeof t.src==`string`)return!0}return!1}function Wf(e){return!(e.type===`stylesheet`&&!(e.state.loading&3))}function Gf(e,t,n,r){if(n.type===`stylesheet`&&(typeof r.media!=`string`||!1!==matchMedia(r.media).matches)&&!(n.state.loading&4)){if(n.instance===null){var i=Af(r.href),a=t.querySelector(jf(i));if(a){t=a._p,typeof t==`object`&&t&&typeof t.then==`function`&&(e.count++,e=Jf.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,Et(a);return}a=t.ownerDocument||t,r=Mf(r),(i=mf.get(i))&&Rf(r,i),a=a.createElement(`link`),Et(a);var o=a;o._p=new Promise(function(e,t){o.onload=e,o.onerror=t}),Pd(a,`link`,r),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&!(n.state.loading&3)&&(e.count++,n=Jf.bind(e),t.addEventListener(`load`,n),t.addEventListener(`error`,n))}}var Kf=0;function qf(e,t){return e.stylesheets&&e.count===0&&Xf(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var r=setTimeout(function(){if(e.stylesheets&&Xf(e,e.stylesheets),e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}},6e4+t);0<e.imgBytes&&Kf===0&&(Kf=62500*Ld());var i=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&Xf(e,e.stylesheets),e.unsuspend)){var t=e.unsuspend;e.unsuspend=null,t()}},(e.imgBytes>Kf?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(r),clearTimeout(i)}}:null}function Jf(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)Xf(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var Yf=null;function Xf(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,Yf=new Map,t.forEach(Zf,e),Yf=null,Jf.call(e))}function Zf(e,t){if(!(t.state.loading&4)){var n=Yf.get(e);if(n)var r=n.get(null);else{n=new Map,Yf.set(e,n);for(var i=e.querySelectorAll(`link[data-precedence],style[data-precedence]`),a=0;a<i.length;a++){var o=i[a];(o.nodeName===`LINK`||o.getAttribute(`media`)!==`not all`)&&(n.set(o.dataset.precedence,o),r=o)}r&&n.set(null,r)}i=t.instance,o=i.getAttribute(`data-precedence`),a=n.get(o)||r,a===r&&n.set(null,i),n.set(o,i),this.count++,r=Jf.bind(this),i.addEventListener(`load`,r),i.addEventListener(`error`,r),a?a.parentNode.insertBefore(i,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(i,e.firstChild)),t.state.loading|=4}}var Qf={$$typeof:C,Provider:null,Consumer:null,_currentValue:le,_currentValue2:le,_threadCount:0};function $f(e,t,n,r,i,a,o,s,c){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=rt(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=rt(0),this.hiddenUpdates=rt(null),this.identifierPrefix=r,this.onUncaughtError=i,this.onCaughtError=a,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=c,this.incompleteTransitions=new Map}function ep(e,t,n,r,i,a,o,s,c,l,u,d){return e=new $f(e,t,n,o,c,l,u,d,s),t=1,!0===a&&(t|=24),a=ui(3,null,null,t),e.current=a,a.stateNode=e,t=la(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:r,isDehydrated:n,cache:t},Ha(a),e}function tp(e){return e?(e=ci,e):ci}function np(e,t,n,r,i,a){i=tp(i),r.context===null?r.context=i:r.pendingContext=i,r=Wa(t),r.payload={element:n},a=a===void 0?null:a,a!==null&&(r.callback=a),n=Ga(e,r,t),n!==null&&(gu(n,e,t),Ka(n,e,t))}function rp(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function ip(e,t){rp(e,t),(e=e.alternate)&&rp(e,t)}function ap(e){if(e.tag===13||e.tag===31){var t=ai(e,67108864);t!==null&&gu(t,e,67108864),ip(e,67108864)}}function op(e){if(e.tag===13||e.tag===31){var t=mu();t=lt(t);var n=ai(e,t);n!==null&&gu(n,e,t),ip(e,t)}}var sp=!0;function cp(e,t,n,r){var i=D.T;D.T=null;var a=O.p;try{O.p=2,up(e,t,n,r)}finally{O.p=a,D.T=i}}function lp(e,t,n,r){var i=D.T;D.T=null;var a=O.p;try{O.p=8,up(e,t,n,r)}finally{O.p=a,D.T=i}}function up(e,t,n,r){if(sp){var i=dp(r);if(i===null)wd(e,t,r,fp,n),Cp(e,r);else if(Tp(i,e,t,n,r))r.stopPropagation();else if(Cp(e,r),t&4&&-1<Sp.indexOf(e)){for(;i!==null;){var a=Ct(i);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var o=Qe(a.pendingLanes);if(o!==0){var s=a;for(s.pendingLanes|=2,s.entangledLanes|=2;o;){var c=1<<31-Ge(o);s.entanglements[1]|=c,o&=~c}rd(a),!(G&6)&&(nu=Ne()+500,id(0,!1))}}break;case 31:case 13:s=ai(a,2),s!==null&&gu(s,a,2),bu(),ip(a,2)}if(a=dp(r),a===null&&wd(e,t,r,fp,n),a===i)break;i=a}i!==null&&r.stopPropagation()}else wd(e,t,r,null,n)}}function dp(e){return e=cn(e),pp(e)}var fp=null;function pp(e){if(fp=null,e=St(e),e!==null){var t=o(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=s(t),e!==null)return e;e=null}else if(n===31){if(e=c(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return fp=e,null}function mp(e){switch(e){case`beforetoggle`:case`cancel`:case`click`:case`close`:case`contextmenu`:case`copy`:case`cut`:case`auxclick`:case`dblclick`:case`dragend`:case`dragstart`:case`drop`:case`focusin`:case`focusout`:case`input`:case`invalid`:case`keydown`:case`keypress`:case`keyup`:case`mousedown`:case`mouseup`:case`paste`:case`pause`:case`play`:case`pointercancel`:case`pointerdown`:case`pointerup`:case`ratechange`:case`reset`:case`resize`:case`seeked`:case`submit`:case`toggle`:case`touchcancel`:case`touchend`:case`touchstart`:case`volumechange`:case`change`:case`selectionchange`:case`textInput`:case`compositionstart`:case`compositionend`:case`compositionupdate`:case`beforeblur`:case`afterblur`:case`beforeinput`:case`blur`:case`fullscreenchange`:case`focus`:case`hashchange`:case`popstate`:case`select`:case`selectstart`:return 2;case`drag`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`mousemove`:case`mouseout`:case`mouseover`:case`pointermove`:case`pointerout`:case`pointerover`:case`scroll`:case`touchmove`:case`wheel`:case`mouseenter`:case`mouseleave`:case`pointerenter`:case`pointerleave`:return 8;case`message`:switch(Pe()){case Fe:return 2;case Ie:return 8;case Le:case Re:return 32;case ze:return 268435456;default:return 32}default:return 32}}var hp=!1,gp=null,_p=null,vp=null,yp=new Map,bp=new Map,xp=[],Sp=`mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(` `);function Cp(e,t){switch(e){case`focusin`:case`focusout`:gp=null;break;case`dragenter`:case`dragleave`:_p=null;break;case`mouseover`:case`mouseout`:vp=null;break;case`pointerover`:case`pointerout`:yp.delete(t.pointerId);break;case`gotpointercapture`:case`lostpointercapture`:bp.delete(t.pointerId)}}function wp(e,t,n,r,i,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:a,targetContainers:[i]},t!==null&&(t=Ct(t),t!==null&&ap(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Tp(e,t,n,r,i){switch(t){case`focusin`:return gp=wp(gp,e,t,n,r,i),!0;case`dragenter`:return _p=wp(_p,e,t,n,r,i),!0;case`mouseover`:return vp=wp(vp,e,t,n,r,i),!0;case`pointerover`:var a=i.pointerId;return yp.set(a,wp(yp.get(a)||null,e,t,n,r,i)),!0;case`gotpointercapture`:return a=i.pointerId,bp.set(a,wp(bp.get(a)||null,e,t,n,r,i)),!0}return!1}function Ep(e){var t=St(e.target);if(t!==null){var n=o(t);if(n!==null){if(t=n.tag,t===13){if(t=s(n),t!==null){e.blockedOn=t,ft(e.priority,function(){op(n)});return}}else if(t===31){if(t=c(n),t!==null){e.blockedOn=t,ft(e.priority,function(){op(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Dp(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=dp(e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);sn=r,n.target.dispatchEvent(r),sn=null}else return t=Ct(n),t!==null&&ap(t),e.blockedOn=n,!1;t.shift()}return!0}function Op(e,t,n){Dp(e)&&n.delete(t)}function kp(){hp=!1,gp!==null&&Dp(gp)&&(gp=null),_p!==null&&Dp(_p)&&(_p=null),vp!==null&&Dp(vp)&&(vp=null),yp.forEach(Op),bp.forEach(Op)}function Ap(e,n){e.blockedOn===n&&(e.blockedOn=null,hp||(hp=!0,t.unstable_scheduleCallback(t.unstable_NormalPriority,kp)))}var jp=null;function Mp(e){jp!==e&&(jp=e,t.unstable_scheduleCallback(t.unstable_NormalPriority,function(){jp===e&&(jp=null);for(var t=0;t<e.length;t+=3){var n=e[t],r=e[t+1],i=e[t+2];if(typeof r!=`function`){if(pp(r||n)===null)continue;break}var a=Ct(n);a!==null&&(e.splice(t,3),t-=3,Ts(a,{pending:!0,data:i,method:n.method,action:r},r,i))}}))}function Np(e){function t(t){return Ap(t,e)}gp!==null&&Ap(gp,e),_p!==null&&Ap(_p,e),vp!==null&&Ap(vp,e),yp.forEach(t),bp.forEach(t);for(var n=0;n<xp.length;n++){var r=xp[n];r.blockedOn===e&&(r.blockedOn=null)}for(;0<xp.length&&(n=xp[0],n.blockedOn===null);)Ep(n),n.blockedOn===null&&xp.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(r=0;r<n.length;r+=3){var i=n[r],a=n[r+1],o=i[ht]||null;if(typeof a==`function`)o||Mp(n);else if(o){var s=null;if(a&&a.hasAttribute(`formAction`)){if(i=a,o=a[ht]||null)s=o.formAction;else if(pp(i)!==null)continue}else s=o.action;typeof s==`function`?n[r+1]=s:(n.splice(r,3),r-=3),Mp(n)}}}function Pp(){function e(e){e.canIntercept&&e.info===`react-transition`&&e.intercept({handler:function(){return new Promise(function(e){return i=e})},focusReset:`manual`,scroll:`manual`})}function t(){i!==null&&(i(),i=null),r||setTimeout(n,20)}function n(){if(!r&&!navigation.transition){var e=navigation.currentEntry;e&&e.url!=null&&navigation.navigate(e.url,{state:e.getState(),info:`react-transition`,history:`replace`})}}if(typeof navigation==`object`){var r=!1,i=null;return navigation.addEventListener(`navigate`,e),navigation.addEventListener(`navigatesuccess`,t),navigation.addEventListener(`navigateerror`,t),setTimeout(n,100),function(){r=!0,navigation.removeEventListener(`navigate`,e),navigation.removeEventListener(`navigatesuccess`,t),navigation.removeEventListener(`navigateerror`,t),i!==null&&(i(),i=null)}}}function Fp(e){this._internalRoot=e}Ip.prototype.render=Fp.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(i(409));var n=t.current;np(n,mu(),e,t,null,null)},Ip.prototype.unmount=Fp.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;np(e.current,2,null,e,null,null),bu(),t[gt]=null}};function Ip(e){this._internalRoot=e}Ip.prototype.unstable_scheduleHydration=function(e){if(e){var t=dt();e={blockedOn:null,target:e,priority:t};for(var n=0;n<xp.length&&t!==0&&t<xp[n].priority;n++);xp.splice(n,0,e),n===0&&Ep(e)}};var Lp=n.version;if(Lp!==`19.2.6`)throw Error(i(527,Lp,`19.2.6`));O.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render==`function`?Error(i(188)):(e=Object.keys(e).join(`,`),Error(i(268,e)));return e=u(t),e=e===null?null:f(e),e=e===null?null:e.stateNode,e};var Rp={bundleType:0,version:`19.2.6`,rendererPackageName:`react-dom`,currentDispatcherRef:D,reconcilerVersion:`19.2.6`};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`){var zp=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!zp.isDisabled&&zp.supportsFiber)try{He=zp.inject(Rp),Ue=zp}catch{}}e.createRoot=function(e,t){if(!a(e))throw Error(i(299));var n=!1,r=``,o=Js,s=Ys,c=Xs;return t!=null&&(!0===t.unstable_strictMode&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onUncaughtError!==void 0&&(o=t.onUncaughtError),t.onCaughtError!==void 0&&(s=t.onCaughtError),t.onRecoverableError!==void 0&&(c=t.onRecoverableError)),t=ep(e,1,!1,null,null,n,r,null,o,s,c,Pp),e[gt]=t.current,Sd(e),new Fp(t)}})),_=o(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=g()})),v=l(d(),1),y=_(),b=s({cleanSectorName:()=>x,computeCurvature:()=>ee,computeDataBounds:()=>re,computeDistance:()=>w,computeHeading:()=>S,computeMomentumRoc:()=>T,computeQuadrantDistribution:()=>ne,computeVelocity:()=>C,enrichAll:()=>E,enrichPoint:()=>te});function x(e){if(!e)return``;let t=e.replace(/_/g,` `);return t=t.replace(/^NSE\s*INDEX\s*/i,``),t=t.replace(/^NIFTY\s*/i,``),t.trim()}function S(e,t){let n=180/Math.PI*Math.atan2(t,e);return n>=-22.5&&n<22.5?`E`:n>=22.5&&n<67.5?`NE`:n>=67.5&&n<112.5?`N`:n>=112.5&&n<157.5?`NW`:n>=157.5||n<-157.5?`W`:n>=-157.5&&n<-112.5?`SW`:n>=-112.5&&n<-67.5?`S`:`SE`}function C(e,t){return Math.sqrt(e*e+t*t)}function w(e,t,n=100,r=100){return Math.sqrt((e-n)**2+(t-r)**2)}function ee(e){if(e.length<3)return 0;let t=e.length,n=e[t-3],r=e[t-2],i=e[t-1],a=r.x-n.x,o=r.y-n.y,s=i.x-r.x,c=i.y-r.y,l=a*c-o*s,u=Math.sqrt(a*a+o*o)*Math.sqrt(s*s+c*c);return u===0?0:l/u}function T(e){if(e.length<3)return 0;let t=e.length;return e[t-1].y-e[t-2].y-(e[t-2].y-e[t-3].y)}function te(e){let t=e.trail,n=0,r=0;if(t.length>=2){let i=t[t.length-2];n=e.x-i.x,r=e.y-i.y}return{...e,velocity:C(n,r),heading:S(n,r),headingAngle:Math.atan2(r,n),distance:w(e.x,e.y),trendStrength:C(n,r)*w(e.x,e.y),curvature:ee(t),momentumRoc:T(t),quadrantDuration:0}}function E(e){return e.map(te)}function ne(e){let t=e.length||1,n={leading:0,weakening:0,lagging:0,improving:0};return e.forEach(e=>{let t=e.quadrant.toLowerCase();n[t]++}),{leading:Math.round(n.leading/t*100),weakening:Math.round(n.weakening/t*100),lagging:Math.round(n.lagging/t*100),improving:Math.round(n.improving/t*100)}}function re(e){if(e.length===0)return{minX:95,maxX:105,minY:95,maxY:105,centerX:100,centerY:100,domainWidth:10,domainHeight:10};let t=1/0,n=-1/0,r=1/0,i=-1/0;for(let a of e)if(a.x<t&&(t=a.x),a.x>n&&(n=a.x),a.y<r&&(r=a.y),a.y>i&&(i=a.y),a.trail)for(let e of a.trail)e.x<t&&(t=e.x),e.x>n&&(n=e.x),e.y<r&&(r=e.y),e.y>i&&(i=e.y);let a=e=>Math.round(e*1e4)/1e4;t=a(t),n=a(n),r=a(r),i=a(i);let o=n-t,s=i-r,c=Math.max(o*.12,1.5),l=Math.max(s*.12,1.5);t-=c,n+=c,r-=l,i+=l;let u=a(Math.max(n-t,4)),d=a(Math.max(i-r,4));return{minX:t,maxX:n,minY:r,maxY:i,centerX:a((t+n)/2),centerY:a((r+i)/2),domainWidth:u,domainHeight:d}}var ie=e=>{let t,n=new Set,r=(e,r)=>{let i=typeof e==`function`?e(t):e;if(!Object.is(i,t)){let e=t;t=r??(typeof i!=`object`||!i)?i:Object.assign({},t,i),n.forEach(n=>n(t,e))}},i=()=>t,a={setState:r,getState:i,getInitialState:()=>o,subscribe:e=>(n.add(e),()=>n.delete(e))},o=t=e(r,i,a);return a},ae=(e=>e?ie(e):ie),oe=e=>e;function se(e,t=oe){let n=v.useSyncExternalStore(e.subscribe,v.useCallback(()=>t(e.getState()),[e,t]),v.useCallback(()=>t(e.getInitialState()),[e,t]));return v.useDebugValue(n),n}var ce=e=>{let t=ae(e),n=e=>se(t,e);return Object.assign(n,t),n},D=(e=>e?ce(e):ce);function O(e,t){return function(){return e.apply(t,arguments)}}var{toString:le}=Object.prototype,{getPrototypeOf:ue}=Object,{iterator:de,toStringTag:fe}=Symbol,k=(e=>t=>{let n=le.call(t);return e[n]||(e[n]=n.slice(8,-1).toLowerCase())})(Object.create(null)),A=e=>(e=e.toLowerCase(),t=>k(t)===e),pe=e=>t=>typeof t===e,{isArray:me}=Array,he=pe(`undefined`);function ge(e){return e!==null&&!he(e)&&e.constructor!==null&&!he(e.constructor)&&be(e.constructor.isBuffer)&&e.constructor.isBuffer(e)}var _e=A(`ArrayBuffer`);function ve(e){let t;return t=typeof ArrayBuffer<`u`&&ArrayBuffer.isView?ArrayBuffer.isView(e):e&&e.buffer&&_e(e.buffer),t}var ye=pe(`string`),be=pe(`function`),xe=pe(`number`),Se=e=>typeof e==`object`&&!!e,Ce=e=>e===!0||e===!1,we=e=>{if(k(e)!==`object`)return!1;let t=ue(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(fe in e)&&!(de in e)},Te=e=>{if(!Se(e)||ge(e))return!1;try{return Object.keys(e).length===0&&Object.getPrototypeOf(e)===Object.prototype}catch{return!1}},Ee=A(`Date`),De=A(`File`),Oe=e=>!!(e&&e.uri!==void 0),ke=e=>e&&e.getParts!==void 0,Ae=A(`Blob`),je=A(`FileList`),Me=e=>Se(e)&&be(e.pipe);function Ne(){return typeof globalThis<`u`?globalThis:typeof self<`u`?self:typeof window<`u`?window:typeof global<`u`?global:{}}var Pe=Ne(),Fe=Pe.FormData===void 0?void 0:Pe.FormData,Ie=e=>{if(!e)return!1;if(Fe&&e instanceof Fe)return!0;let t=ue(e);if(!t||t===Object.prototype||!be(e.append))return!1;let n=k(e);return n===`formdata`||n===`object`&&be(e.toString)&&e.toString()===`[object FormData]`},Le=A(`URLSearchParams`),[Re,ze,Be,Ve]=[`ReadableStream`,`Request`,`Response`,`Headers`].map(A),He=e=>e.trim?e.trim():e.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,``);function Ue(e,t,{allOwnKeys:n=!1}={}){if(e==null)return;let r,i;if(typeof e!=`object`&&(e=[e]),me(e))for(r=0,i=e.length;r<i;r++)t.call(null,e[r],r,e);else{if(ge(e))return;let i=n?Object.getOwnPropertyNames(e):Object.keys(e),a=i.length,o;for(r=0;r<a;r++)o=i[r],t.call(null,e[o],o,e)}}function We(e,t){if(ge(e))return null;t=t.toLowerCase();let n=Object.keys(e),r=n.length,i;for(;r-- >0;)if(i=n[r],t===i.toLowerCase())return i;return null}var Ge=typeof globalThis<`u`?globalThis:typeof self<`u`?self:typeof window<`u`?window:global,Ke=e=>!he(e)&&e!==Ge;function qe(...e){let{caseless:t,skipUndefined:n}=Ke(this)&&this||{},r={},i=(e,i)=>{if(i===`__proto__`||i===`constructor`||i===`prototype`)return;let a=t&&We(r,i)||i,o=at(r,a)?r[a]:void 0;we(o)&&we(e)?r[a]=qe(o,e):we(e)?r[a]=qe({},e):me(e)?r[a]=e.slice():(!n||!he(e))&&(r[a]=e)};for(let t=0,n=e.length;t<n;t++)e[t]&&Ue(e[t],i);return r}var Je=(e,t,n,{allOwnKeys:r}={})=>(Ue(t,(t,r)=>{n&&be(t)?Object.defineProperty(e,r,{__proto__:null,value:O(t,n),writable:!0,enumerable:!0,configurable:!0}):Object.defineProperty(e,r,{__proto__:null,value:t,writable:!0,enumerable:!0,configurable:!0})},{allOwnKeys:r}),e),Ye=e=>(e.charCodeAt(0)===65279&&(e=e.slice(1)),e),Xe=(e,t,n,r)=>{e.prototype=Object.create(t.prototype,r),Object.defineProperty(e.prototype,`constructor`,{__proto__:null,value:e,writable:!0,enumerable:!1,configurable:!0}),Object.defineProperty(e,`super`,{__proto__:null,value:t.prototype}),n&&Object.assign(e.prototype,n)},Ze=(e,t,n,r)=>{let i,a,o,s={};if(t||={},e==null)return t;do{for(i=Object.getOwnPropertyNames(e),a=i.length;a-- >0;)o=i[a],(!r||r(o,e,t))&&!s[o]&&(t[o]=e[o],s[o]=!0);e=n!==!1&&ue(e)}while(e&&(!n||n(e,t))&&e!==Object.prototype);return t},Qe=(e,t,n)=>{e=String(e),(n===void 0||n>e.length)&&(n=e.length),n-=t.length;let r=e.indexOf(t,n);return r!==-1&&r===n},$e=e=>{if(!e)return null;if(me(e))return e;let t=e.length;if(!xe(t))return null;let n=Array(t);for(;t-- >0;)n[t]=e[t];return n},et=(e=>t=>e&&t instanceof e)(typeof Uint8Array<`u`&&ue(Uint8Array)),tt=(e,t)=>{let n=(e&&e[de]).call(e),r;for(;(r=n.next())&&!r.done;){let n=r.value;t.call(e,n[0],n[1])}},nt=(e,t)=>{let n,r=[];for(;(n=e.exec(t))!==null;)r.push(n);return r},rt=A(`HTMLFormElement`),it=e=>e.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g,function(e,t,n){return t.toUpperCase()+n}),at=(({hasOwnProperty:e})=>(t,n)=>e.call(t,n))(Object.prototype),ot=A(`RegExp`),st=(e,t)=>{let n=Object.getOwnPropertyDescriptors(e),r={};Ue(n,(n,i)=>{let a;(a=t(n,i,e))!==!1&&(r[i]=a||n)}),Object.defineProperties(e,r)},ct=e=>{st(e,(t,n)=>{if(be(e)&&[`arguments`,`caller`,`callee`].includes(n))return!1;let r=e[n];if(be(r)){if(t.enumerable=!1,`writable`in t){t.writable=!1;return}t.set||=()=>{throw Error(`Can not rewrite read-only method '`+n+`'`)}}})},lt=(e,t)=>{let n={},r=e=>{e.forEach(e=>{n[e]=!0})};return me(e)?r(e):r(String(e).split(t)),n},ut=()=>{},dt=(e,t)=>e!=null&&Number.isFinite(e=+e)?e:t;function ft(e){return!!(e&&be(e.append)&&e[fe]===`FormData`&&e[de])}var pt=e=>{let t=new WeakSet,n=e=>{if(Se(e)){if(t.has(e))return;if(ge(e))return e;if(!(`toJSON`in e)){t.add(e);let r=me(e)?[]:{};return Ue(e,(e,t)=>{let i=n(e);!he(i)&&(r[t]=i)}),t.delete(e),r}}return e};return n(e)},mt=A(`AsyncFunction`),ht=e=>e&&(Se(e)||be(e))&&be(e.then)&&be(e.catch),gt=((e,t)=>e?setImmediate:t?((e,t)=>(Ge.addEventListener(`message`,({source:n,data:r})=>{n===Ge&&r===e&&t.length&&t.shift()()},!1),n=>{t.push(n),Ge.postMessage(e,`*`)}))(`axios@${Math.random()}`,[]):e=>setTimeout(e))(typeof setImmediate==`function`,be(Ge.postMessage)),j={isArray:me,isArrayBuffer:_e,isBuffer:ge,isFormData:Ie,isArrayBufferView:ve,isString:ye,isNumber:xe,isBoolean:Ce,isObject:Se,isPlainObject:we,isEmptyObject:Te,isReadableStream:Re,isRequest:ze,isResponse:Be,isHeaders:Ve,isUndefined:he,isDate:Ee,isFile:De,isReactNativeBlob:Oe,isReactNative:ke,isBlob:Ae,isRegExp:ot,isFunction:be,isStream:Me,isURLSearchParams:Le,isTypedArray:et,isFileList:je,forEach:Ue,merge:qe,extend:Je,trim:He,stripBOM:Ye,inherits:Xe,toFlatObject:Ze,kindOf:k,kindOfTest:A,endsWith:Qe,toArray:$e,forEachEntry:tt,matchAll:nt,isHTMLForm:rt,hasOwnProperty:at,hasOwnProp:at,reduceDescriptors:st,freezeMethods:ct,toObjectSet:lt,toCamelCase:it,noop:ut,toFiniteNumber:dt,findKey:We,global:Ge,isContextDefined:Ke,isSpecCompliantForm:ft,toJSONObject:pt,isAsyncFn:mt,isThenable:ht,setImmediate:gt,asap:typeof queueMicrotask<`u`?queueMicrotask.bind(Ge):typeof process<`u`&&process.nextTick||gt,isIterable:e=>e!=null&&be(e[de])},_t=j.toObjectSet([`age`,`authorization`,`content-length`,`content-type`,`etag`,`expires`,`from`,`host`,`if-modified-since`,`if-unmodified-since`,`last-modified`,`location`,`max-forwards`,`proxy-authorization`,`referer`,`retry-after`,`user-agent`]),vt=e=>{let t={},n,r,i;return e&&e.split(`
`).forEach(function(e){i=e.indexOf(`:`),n=e.substring(0,i).trim().toLowerCase(),r=e.substring(i+1).trim(),!(!n||t[n]&&_t[n])&&(n===`set-cookie`?t[n]?t[n].push(r):t[n]=[r]:t[n]=t[n]?t[n]+`, `+r:r)}),t};function yt(e){let t=0,n=e.length;for(;t<n;){let n=e.charCodeAt(t);if(n!==9&&n!==32)break;t+=1}for(;n>t;){let t=e.charCodeAt(n-1);if(t!==9&&t!==32)break;--n}return t===0&&n===e.length?e:e.slice(t,n)}var bt=RegExp(`[\\u0000-\\u0008\\u000a-\\u001f\\u007f]+`,`g`),xt=RegExp(`[^\\u0009\\u0020-\\u007e\\u0080-\\u00ff]+`,`g`);function St(e,t){return j.isArray(e)?e.map(e=>St(e,t)):yt(String(e).replace(t,``))}var Ct=e=>St(e,bt),wt=e=>St(e,xt);function Tt(e){let t=Object.create(null);return j.forEach(e.toJSON(),(e,n)=>{t[n]=wt(e)}),t}var Et=Symbol(`internals`);function Dt(e){return e&&String(e).trim().toLowerCase()}function Ot(e){return e===!1||e==null?e:j.isArray(e)?e.map(Ot):Ct(String(e))}function kt(e){let t=Object.create(null),n=/([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g,r;for(;r=n.exec(e);)t[r[1]]=r[2];return t}var At=e=>/^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(e.trim());function jt(e,t,n,r,i){if(j.isFunction(r))return r.call(this,t,n);if(i&&(t=n),j.isString(t)){if(j.isString(r))return t.indexOf(r)!==-1;if(j.isRegExp(r))return r.test(t)}}function Mt(e){return e.trim().toLowerCase().replace(/([a-z\d])(\w*)/g,(e,t,n)=>t.toUpperCase()+n)}function Nt(e,t){let n=j.toCamelCase(` `+t);[`get`,`set`,`has`].forEach(r=>{Object.defineProperty(e,r+n,{__proto__:null,value:function(e,n,i){return this[r].call(this,t,e,n,i)},configurable:!0})})}var Pt=class{constructor(e){e&&this.set(e)}set(e,t,n){let r=this;function i(e,t,n){let i=Dt(t);if(!i)throw Error(`header name must be a non-empty string`);let a=j.findKey(r,i);(!a||r[a]===void 0||n===!0||n===void 0&&r[a]!==!1)&&(r[a||t]=Ot(e))}let a=(e,t)=>j.forEach(e,(e,n)=>i(e,n,t));if(j.isPlainObject(e)||e instanceof this.constructor)a(e,t);else if(j.isString(e)&&(e=e.trim())&&!At(e))a(vt(e),t);else if(j.isObject(e)&&j.isIterable(e)){let n={},r,i;for(let t of e){if(!j.isArray(t))throw TypeError(`Object iterator must return a key-value pair`);n[i=t[0]]=(r=n[i])?j.isArray(r)?[...r,t[1]]:[r,t[1]]:t[1]}a(n,t)}else e!=null&&i(t,e,n);return this}get(e,t){if(e=Dt(e),e){let n=j.findKey(this,e);if(n){let e=this[n];if(!t)return e;if(t===!0)return kt(e);if(j.isFunction(t))return t.call(this,e,n);if(j.isRegExp(t))return t.exec(e);throw TypeError(`parser must be boolean|regexp|function`)}}}has(e,t){if(e=Dt(e),e){let n=j.findKey(this,e);return!!(n&&this[n]!==void 0&&(!t||jt(this,this[n],n,t)))}return!1}delete(e,t){let n=this,r=!1;function i(e){if(e=Dt(e),e){let i=j.findKey(n,e);i&&(!t||jt(n,n[i],i,t))&&(delete n[i],r=!0)}}return j.isArray(e)?e.forEach(i):i(e),r}clear(e){let t=Object.keys(this),n=t.length,r=!1;for(;n--;){let i=t[n];(!e||jt(this,this[i],i,e,!0))&&(delete this[i],r=!0)}return r}normalize(e){let t=this,n={};return j.forEach(this,(r,i)=>{let a=j.findKey(n,i);if(a){t[a]=Ot(r),delete t[i];return}let o=e?Mt(i):String(i).trim();o!==i&&delete t[i],t[o]=Ot(r),n[o]=!0}),this}concat(...e){return this.constructor.concat(this,...e)}toJSON(e){let t=Object.create(null);return j.forEach(this,(n,r)=>{n!=null&&n!==!1&&(t[r]=e&&j.isArray(n)?n.join(`, `):n)}),t}[Symbol.iterator](){return Object.entries(this.toJSON())[Symbol.iterator]()}toString(){return Object.entries(this.toJSON()).map(([e,t])=>e+`: `+t).join(`
`)}getSetCookie(){return this.get(`set-cookie`)||[]}get[Symbol.toStringTag](){return`AxiosHeaders`}static from(e){return e instanceof this?e:new this(e)}static concat(e,...t){let n=new this(e);return t.forEach(e=>n.set(e)),n}static accessor(e){let t=(this[Et]=this[Et]={accessors:{}}).accessors,n=this.prototype;function r(e){let r=Dt(e);t[r]||(Nt(n,e),t[r]=!0)}return j.isArray(e)?e.forEach(r):r(e),this}};Pt.accessor([`Content-Type`,`Content-Length`,`Accept`,`Accept-Encoding`,`User-Agent`,`Authorization`]),j.reduceDescriptors(Pt.prototype,({value:e},t)=>{let n=t[0].toUpperCase()+t.slice(1);return{get:()=>e,set(e){this[n]=e}}}),j.freezeMethods(Pt);var Ft=`[REDACTED ****]`;function It(e){if(j.hasOwnProp(e,`toJSON`))return!0;let t=Object.getPrototypeOf(e);for(;t&&t!==Object.prototype;){if(j.hasOwnProp(t,`toJSON`))return!0;t=Object.getPrototypeOf(t)}return!1}function Lt(e,t){let n=new Set(t.map(e=>String(e).toLowerCase())),r=[],i=e=>{if(typeof e!=`object`||!e||j.isBuffer(e))return e;if(r.indexOf(e)!==-1)return;e instanceof Pt&&(e=e.toJSON()),r.push(e);let t;if(j.isArray(e))t=[],e.forEach((e,n)=>{let r=i(e);j.isUndefined(r)||(t[n]=r)});else{if(!j.isPlainObject(e)&&It(e))return r.pop(),e;t=Object.create(null);for(let[r,a]of Object.entries(e)){let e=n.has(r.toLowerCase())?Ft:i(a);j.isUndefined(e)||(t[r]=e)}}return r.pop(),t};return i(e)}var M=class e extends Error{static from(t,n,r,i,a,o){let s=new e(t.message,n||t.code,r,i,a);return s.cause=t,s.name=t.name,t.status!=null&&s.status==null&&(s.status=t.status),o&&Object.assign(s,o),s}constructor(e,t,n,r,i){super(e),Object.defineProperty(this,`message`,{__proto__:null,value:e,enumerable:!0,writable:!0,configurable:!0}),this.name=`AxiosError`,this.isAxiosError=!0,t&&(this.code=t),n&&(this.config=n),r&&(this.request=r),i&&(this.response=i,this.status=i.status)}toJSON(){let e=this.config,t=e&&j.hasOwnProp(e,`redact`)?e.redact:void 0,n=j.isArray(t)&&t.length>0?Lt(e,t):j.toJSONObject(e);return{message:this.message,name:this.name,description:this.description,number:this.number,fileName:this.fileName,lineNumber:this.lineNumber,columnNumber:this.columnNumber,stack:this.stack,config:n,code:this.code,status:this.status}}};M.ERR_BAD_OPTION_VALUE=`ERR_BAD_OPTION_VALUE`,M.ERR_BAD_OPTION=`ERR_BAD_OPTION`,M.ECONNABORTED=`ECONNABORTED`,M.ETIMEDOUT=`ETIMEDOUT`,M.ECONNREFUSED=`ECONNREFUSED`,M.ERR_NETWORK=`ERR_NETWORK`,M.ERR_FR_TOO_MANY_REDIRECTS=`ERR_FR_TOO_MANY_REDIRECTS`,M.ERR_DEPRECATED=`ERR_DEPRECATED`,M.ERR_BAD_RESPONSE=`ERR_BAD_RESPONSE`,M.ERR_BAD_REQUEST=`ERR_BAD_REQUEST`,M.ERR_CANCELED=`ERR_CANCELED`,M.ERR_NOT_SUPPORT=`ERR_NOT_SUPPORT`,M.ERR_INVALID_URL=`ERR_INVALID_URL`,M.ERR_FORM_DATA_DEPTH_EXCEEDED=`ERR_FORM_DATA_DEPTH_EXCEEDED`;function Rt(e){return j.isPlainObject(e)||j.isArray(e)}function zt(e){return j.endsWith(e,`[]`)?e.slice(0,-2):e}function Bt(e,t,n){return e?e.concat(t).map(function(e,t){return e=zt(e),!n&&t?`[`+e+`]`:e}).join(n?`.`:``):t}function Vt(e){return j.isArray(e)&&!e.some(Rt)}var Ht=j.toFlatObject(j,{},null,function(e){return/^is[A-Z]/.test(e)});function Ut(e,t,n){if(!j.isObject(e))throw TypeError(`target must be an object`);t||=new FormData,n=j.toFlatObject(n,{metaTokens:!0,dots:!1,indexes:!1},!1,function(e,t){return!j.isUndefined(t[e])});let r=n.metaTokens,i=n.visitor||d,a=n.dots,o=n.indexes,s=n.Blob||typeof Blob<`u`&&Blob,c=n.maxDepth===void 0?100:n.maxDepth,l=s&&j.isSpecCompliantForm(t);if(!j.isFunction(i))throw TypeError(`visitor must be a function`);function u(e){if(e===null)return``;if(j.isDate(e))return e.toISOString();if(j.isBoolean(e))return e.toString();if(!l&&j.isBlob(e))throw new M(`Blob is not supported. Use a Buffer instead.`);return j.isArrayBuffer(e)||j.isTypedArray(e)?l&&typeof Blob==`function`?new Blob([e]):Buffer.from(e):e}function d(e,n,i){let s=e;if(j.isReactNative(t)&&j.isReactNativeBlob(e))return t.append(Bt(i,n,a),u(e)),!1;if(e&&!i&&typeof e==`object`){if(j.endsWith(n,`{}`))n=r?n:n.slice(0,-2),e=JSON.stringify(e);else if(j.isArray(e)&&Vt(e)||(j.isFileList(e)||j.endsWith(n,`[]`))&&(s=j.toArray(e)))return n=zt(n),s.forEach(function(e,r){!(j.isUndefined(e)||e===null)&&t.append(o===!0?Bt([n],r,a):o===null?n:n+`[]`,u(e))}),!1}return Rt(e)?!0:(t.append(Bt(i,n,a),u(e)),!1)}let f=[],p=Object.assign(Ht,{defaultVisitor:d,convertValue:u,isVisitable:Rt});function m(e,n,r=0){if(!j.isUndefined(e)){if(r>c)throw new M(`Object is too deeply nested (`+r+` levels). Max depth: `+c,M.ERR_FORM_DATA_DEPTH_EXCEEDED);if(f.indexOf(e)!==-1)throw Error(`Circular reference detected in `+n.join(`.`));f.push(e),j.forEach(e,function(e,a){(!(j.isUndefined(e)||e===null)&&i.call(t,e,j.isString(a)?a.trim():a,n,p))===!0&&m(e,n?n.concat(a):[a],r+1)}),f.pop()}}if(!j.isObject(e))throw TypeError(`data must be an object`);return m(e),t}function Wt(e){let t={"!":`%21`,"'":`%27`,"(":`%28`,")":`%29`,"~":`%7E`,"%20":`+`};return encodeURIComponent(e).replace(/[!'()~]|%20/g,function(e){return t[e]})}function Gt(e,t){this._pairs=[],e&&Ut(e,this,t)}var Kt=Gt.prototype;Kt.append=function(e,t){this._pairs.push([e,t])},Kt.toString=function(e){let t=e?function(t){return e.call(this,t,Wt)}:Wt;return this._pairs.map(function(e){return t(e[0])+`=`+t(e[1])},``).join(`&`)};function qt(e){return encodeURIComponent(e).replace(/%3A/gi,`:`).replace(/%24/g,`$`).replace(/%2C/gi,`,`).replace(/%20/g,`+`)}function Jt(e,t,n){if(!t)return e;let r=n&&n.encode||qt,i=j.isFunction(n)?{serialize:n}:n,a=i&&i.serialize,o;if(o=a?a(t,i):j.isURLSearchParams(t)?t.toString():new Gt(t,i).toString(r),o){let t=e.indexOf(`#`);t!==-1&&(e=e.slice(0,t)),e+=(e.indexOf(`?`)===-1?`?`:`&`)+o}return e}var Yt=class{constructor(){this.handlers=[]}use(e,t,n){return this.handlers.push({fulfilled:e,rejected:t,synchronous:n?n.synchronous:!1,runWhen:n?n.runWhen:null}),this.handlers.length-1}eject(e){this.handlers[e]&&(this.handlers[e]=null)}clear(){this.handlers&&=[]}forEach(e){j.forEach(this.handlers,function(t){t!==null&&e(t)})}},Xt={silentJSONParsing:!0,forcedJSONParsing:!0,clarifyTimeoutError:!1,legacyInterceptorReqResOrdering:!0},Zt={isBrowser:!0,classes:{URLSearchParams:typeof URLSearchParams<`u`?URLSearchParams:Gt,FormData:typeof FormData<`u`?FormData:null,Blob:typeof Blob<`u`?Blob:null},protocols:[`http`,`https`,`file`,`blob`,`url`,`data`]},Qt=s({hasBrowserEnv:()=>$t,hasStandardBrowserEnv:()=>tn,hasStandardBrowserWebWorkerEnv:()=>nn,navigator:()=>en,origin:()=>rn}),$t=typeof window<`u`&&typeof document<`u`,en=typeof navigator==`object`&&navigator||void 0,tn=$t&&(!en||[`ReactNative`,`NativeScript`,`NS`].indexOf(en.product)<0),nn=typeof WorkerGlobalScope<`u`&&self instanceof WorkerGlobalScope&&typeof self.importScripts==`function`,rn=$t&&window.location.href||`http://localhost`,an={...Qt,...Zt};function on(e,t){return Ut(e,new an.classes.URLSearchParams,{visitor:function(e,t,n,r){return an.isNode&&j.isBuffer(e)?(this.append(t,e.toString(`base64`)),!1):r.defaultVisitor.apply(this,arguments)},...t})}function sn(e){return j.matchAll(/\w+|\[(\w*)]/g,e).map(e=>e[0]===`[]`?``:e[1]||e[0])}function cn(e){let t={},n=Object.keys(e),r,i=n.length,a;for(r=0;r<i;r++)a=n[r],t[a]=e[a];return t}function ln(e){function t(e,n,r,i){let a=e[i++];if(a===`__proto__`)return!0;let o=Number.isFinite(+a),s=i>=e.length;return a=!a&&j.isArray(r)?r.length:a,s?(j.hasOwnProp(r,a)?r[a]=j.isArray(r[a])?r[a].concat(n):[r[a],n]:r[a]=n,!o):((!j.hasOwnProp(r,a)||!j.isObject(r[a]))&&(r[a]=[]),t(e,n,r[a],i)&&j.isArray(r[a])&&(r[a]=cn(r[a])),!o)}if(j.isFormData(e)&&j.isFunction(e.entries)){let n={};return j.forEachEntry(e,(e,r)=>{t(sn(e),r,n,0)}),n}return null}var un=(e,t)=>e!=null&&j.hasOwnProp(e,t)?e[t]:void 0;function dn(e,t,n){if(j.isString(e))try{return(t||JSON.parse)(e),j.trim(e)}catch(e){if(e.name!==`SyntaxError`)throw e}return(n||JSON.stringify)(e)}var fn={transitional:Xt,adapter:[`xhr`,`http`,`fetch`],transformRequest:[function(e,t){let n=t.getContentType()||``,r=n.indexOf(`application/json`)>-1,i=j.isObject(e);if(i&&j.isHTMLForm(e)&&(e=new FormData(e)),j.isFormData(e))return r?JSON.stringify(ln(e)):e;if(j.isArrayBuffer(e)||j.isBuffer(e)||j.isStream(e)||j.isFile(e)||j.isBlob(e)||j.isReadableStream(e))return e;if(j.isArrayBufferView(e))return e.buffer;if(j.isURLSearchParams(e))return t.setContentType(`application/x-www-form-urlencoded;charset=utf-8`,!1),e.toString();let a;if(i){let t=un(this,`formSerializer`);if(n.indexOf(`application/x-www-form-urlencoded`)>-1)return on(e,t).toString();if((a=j.isFileList(e))||n.indexOf(`multipart/form-data`)>-1){let n=un(this,`env`),r=n&&n.FormData;return Ut(a?{"files[]":e}:e,r&&new r,t)}}return i||r?(t.setContentType(`application/json`,!1),dn(e)):e}],transformResponse:[function(e){let t=un(this,`transitional`)||fn.transitional,n=t&&t.forcedJSONParsing,r=un(this,`responseType`),i=r===`json`;if(j.isResponse(e)||j.isReadableStream(e))return e;if(e&&j.isString(e)&&(n&&!r||i)){let n=!(t&&t.silentJSONParsing)&&i;try{return JSON.parse(e,un(this,`parseReviver`))}catch(e){if(n)throw e.name===`SyntaxError`?M.from(e,M.ERR_BAD_RESPONSE,this,null,un(this,`response`)):e}}return e}],timeout:0,xsrfCookieName:`XSRF-TOKEN`,xsrfHeaderName:`X-XSRF-TOKEN`,maxContentLength:-1,maxBodyLength:-1,env:{FormData:an.classes.FormData,Blob:an.classes.Blob},validateStatus:function(e){return e>=200&&e<300},headers:{common:{Accept:`application/json, text/plain, */*`,"Content-Type":void 0}}};j.forEach([`delete`,`get`,`head`,`post`,`put`,`patch`,`query`],e=>{fn.headers[e]={}});function pn(e,t){let n=this||fn,r=t||n,i=Pt.from(r.headers),a=r.data;return j.forEach(e,function(e){a=e.call(n,a,i.normalize(),t?t.status:void 0)}),i.normalize(),a}function mn(e){return!!(e&&e.__CANCEL__)}var hn=class extends M{constructor(e,t,n){super(e??`canceled`,M.ERR_CANCELED,t,n),this.name=`CanceledError`,this.__CANCEL__=!0}};function gn(e,t,n){let r=n.config.validateStatus;!n.status||!r||r(n.status)?e(n):t(new M(`Request failed with status code `+n.status,n.status>=400&&n.status<500?M.ERR_BAD_REQUEST:M.ERR_BAD_RESPONSE,n.config,n.request,n))}function _n(e){let t=/^([-+\w]{1,25}):(?:\/\/)?/.exec(e);return t&&t[1]||``}function vn(e,t){e||=10;let n=Array(e),r=Array(e),i=0,a=0,o;return t=t===void 0?1e3:t,function(s){let c=Date.now(),l=r[a];o||=c,n[i]=s,r[i]=c;let u=a,d=0;for(;u!==i;)d+=n[u++],u%=e;if(i=(i+1)%e,i===a&&(a=(a+1)%e),c-o<t)return;let f=l&&c-l;return f?Math.round(d*1e3/f):void 0}}function yn(e,t){let n=0,r=1e3/t,i,a,o=(t,r=Date.now())=>{n=r,i=null,a&&=(clearTimeout(a),null),e(...t)};return[(...e)=>{let t=Date.now(),s=t-n;s>=r?o(e,t):(i=e,a||=setTimeout(()=>{a=null,o(i)},r-s))},()=>i&&o(i)]}var bn=(e,t,n=3)=>{let r=0,i=vn(50,250);return yn(n=>{if(!n||typeof n.loaded!=`number`)return;let a=n.loaded,o=n.lengthComputable?n.total:void 0,s=o==null?a:Math.min(a,o),c=Math.max(0,s-r),l=i(c);r=Math.max(r,s),e({loaded:s,total:o,progress:o?s/o:void 0,bytes:c,rate:l||void 0,estimated:l&&o?(o-s)/l:void 0,event:n,lengthComputable:o!=null,[t?`download`:`upload`]:!0})},n)},xn=(e,t)=>{let n=e!=null;return[r=>t[0]({lengthComputable:n,total:e,loaded:r}),t[1]]},Sn=e=>(...t)=>j.asap(()=>e(...t)),Cn=an.hasStandardBrowserEnv?((e,t)=>n=>(n=new URL(n,an.origin),e.protocol===n.protocol&&e.host===n.host&&(t||e.port===n.port)))(new URL(an.origin),an.navigator&&/(msie|trident)/i.test(an.navigator.userAgent)):()=>!0,wn=an.hasStandardBrowserEnv?{write(e,t,n,r,i,a,o){if(typeof document>`u`)return;let s=[`${e}=${encodeURIComponent(t)}`];j.isNumber(n)&&s.push(`expires=${new Date(n).toUTCString()}`),j.isString(r)&&s.push(`path=${r}`),j.isString(i)&&s.push(`domain=${i}`),a===!0&&s.push(`secure`),j.isString(o)&&s.push(`SameSite=${o}`),document.cookie=s.join(`; `)},read(e){if(typeof document>`u`)return null;let t=document.cookie.split(`;`);for(let n=0;n<t.length;n++){let r=t[n].replace(/^\s+/,``),i=r.indexOf(`=`);if(i!==-1&&r.slice(0,i)===e)return decodeURIComponent(r.slice(i+1))}return null},remove(e){this.write(e,``,Date.now()-864e5,`/`)}}:{write(){},read(){return null},remove(){}};function Tn(e){return typeof e==`string`?/^([a-z][a-z\d+\-.]*:)?\/\//i.test(e):!1}function En(e,t){return t?e.replace(/\/?\/$/,``)+`/`+t.replace(/^\/+/,``):e}function Dn(e,t,n){let r=!Tn(t);return e&&(r||n===!1)?En(e,t):t}var On=e=>e instanceof Pt?{...e}:e;function kn(e,t){t||={};let n=Object.create(null);Object.defineProperty(n,`hasOwnProperty`,{__proto__:null,value:Object.prototype.hasOwnProperty,enumerable:!1,writable:!0,configurable:!0});function r(e,t,n,r){return j.isPlainObject(e)&&j.isPlainObject(t)?j.merge.call({caseless:r},e,t):j.isPlainObject(t)?j.merge({},t):j.isArray(t)?t.slice():t}function i(e,t,n,i){if(!j.isUndefined(t))return r(e,t,n,i);if(!j.isUndefined(e))return r(void 0,e,n,i)}function a(e,t){if(!j.isUndefined(t))return r(void 0,t)}function o(e,t){if(!j.isUndefined(t))return r(void 0,t);if(!j.isUndefined(e))return r(void 0,e)}function s(n,i,a){if(j.hasOwnProp(t,a))return r(n,i);if(j.hasOwnProp(e,a))return r(void 0,n)}let c={url:a,method:a,data:a,baseURL:o,transformRequest:o,transformResponse:o,paramsSerializer:o,timeout:o,timeoutMessage:o,withCredentials:o,withXSRFToken:o,adapter:o,responseType:o,xsrfCookieName:o,xsrfHeaderName:o,onUploadProgress:o,onDownloadProgress:o,decompress:o,maxContentLength:o,maxBodyLength:o,beforeRedirect:o,transport:o,httpAgent:o,httpsAgent:o,cancelToken:o,socketPath:o,allowedSocketPaths:o,responseEncoding:o,validateStatus:s,headers:(e,t,n)=>i(On(e),On(t),n,!0)};return j.forEach(Object.keys({...e,...t}),function(r){if(r===`__proto__`||r===`constructor`||r===`prototype`)return;let a=j.hasOwnProp(c,r)?c[r]:i,o=a(j.hasOwnProp(e,r)?e[r]:void 0,j.hasOwnProp(t,r)?t[r]:void 0,r);j.isUndefined(o)&&a!==s||(n[r]=o)}),n}var An=[`content-type`,`content-length`];function jn(e,t,n){if(n!==`content-only`){e.set(t);return}Object.entries(t).forEach(([t,n])=>{An.includes(t.toLowerCase())&&e.set(t,n)})}var Mn=e=>encodeURIComponent(e).replace(/%([0-9A-F]{2})/gi,(e,t)=>String.fromCharCode(parseInt(t,16))),Nn=e=>{let t=kn({},e),n=e=>j.hasOwnProp(t,e)?t[e]:void 0,r=n(`data`),i=n(`withXSRFToken`),a=n(`xsrfHeaderName`),o=n(`xsrfCookieName`),s=n(`headers`),c=n(`auth`),l=n(`baseURL`),u=n(`allowAbsoluteUrls`),d=n(`url`);if(t.headers=s=Pt.from(s),t.url=Jt(Dn(l,d,u),e.params,e.paramsSerializer),c&&s.set(`Authorization`,`Basic `+btoa((c.username||``)+`:`+(c.password?Mn(c.password):``))),j.isFormData(r)&&(an.hasStandardBrowserEnv||an.hasStandardBrowserWebWorkerEnv?s.setContentType(void 0):j.isFunction(r.getHeaders)&&jn(s,r.getHeaders(),n(`formDataHeaderPolicy`))),an.hasStandardBrowserEnv&&(j.isFunction(i)&&(i=i(t)),i===!0||i==null&&Cn(t.url))){let e=a&&o&&wn.read(o);e&&s.set(a,e)}return t},Pn=typeof XMLHttpRequest<`u`&&function(e){return new Promise(function(t,n){let r=Nn(e),i=r.data,a=Pt.from(r.headers).normalize(),{responseType:o,onUploadProgress:s,onDownloadProgress:c}=r,l,u,d,f,p;function m(){f&&f(),p&&p(),r.cancelToken&&r.cancelToken.unsubscribe(l),r.signal&&r.signal.removeEventListener(`abort`,l)}let h=new XMLHttpRequest;h.open(r.method.toUpperCase(),r.url,!0),h.timeout=r.timeout;function g(){if(!h)return;let r=Pt.from(`getAllResponseHeaders`in h&&h.getAllResponseHeaders());gn(function(e){t(e),m()},function(e){n(e),m()},{data:!o||o===`text`||o===`json`?h.responseText:h.response,status:h.status,statusText:h.statusText,headers:r,config:e,request:h}),h=null}`onloadend`in h?h.onloadend=g:h.onreadystatechange=function(){!h||h.readyState!==4||h.status===0&&!(h.responseURL&&h.responseURL.startsWith(`file:`))||setTimeout(g)},h.onabort=function(){h&&=(n(new M(`Request aborted`,M.ECONNABORTED,e,h)),m(),null)},h.onerror=function(t){let r=new M(t&&t.message?t.message:`Network Error`,M.ERR_NETWORK,e,h);r.event=t||null,n(r),m(),h=null},h.ontimeout=function(){let t=r.timeout?`timeout of `+r.timeout+`ms exceeded`:`timeout exceeded`,i=r.transitional||Xt;r.timeoutErrorMessage&&(t=r.timeoutErrorMessage),n(new M(t,i.clarifyTimeoutError?M.ETIMEDOUT:M.ECONNABORTED,e,h)),m(),h=null},i===void 0&&a.setContentType(null),`setRequestHeader`in h&&j.forEach(Tt(a),function(e,t){h.setRequestHeader(t,e)}),j.isUndefined(r.withCredentials)||(h.withCredentials=!!r.withCredentials),o&&o!==`json`&&(h.responseType=r.responseType),c&&([d,p]=bn(c,!0),h.addEventListener(`progress`,d)),s&&h.upload&&([u,f]=bn(s),h.upload.addEventListener(`progress`,u),h.upload.addEventListener(`loadend`,f)),(r.cancelToken||r.signal)&&(l=t=>{h&&=(n(!t||t.type?new hn(null,e,h):t),h.abort(),m(),null)},r.cancelToken&&r.cancelToken.subscribe(l),r.signal&&(r.signal.aborted?l():r.signal.addEventListener(`abort`,l)));let _=_n(r.url);if(_&&!an.protocols.includes(_)){n(new M(`Unsupported protocol `+_+`:`,M.ERR_BAD_REQUEST,e));return}h.send(i||null)})},Fn=(e,t)=>{if(e=e?e.filter(Boolean):[],!t&&!e.length)return;let n=new AbortController,r=!1,i=function(e){if(!r){r=!0,o();let t=e instanceof Error?e:this.reason;n.abort(t instanceof M?t:new hn(t instanceof Error?t.message:t))}},a=t&&setTimeout(()=>{a=null,i(new M(`timeout of ${t}ms exceeded`,M.ETIMEDOUT))},t),o=()=>{e&&=(a&&clearTimeout(a),a=null,e.forEach(e=>{e.unsubscribe?e.unsubscribe(i):e.removeEventListener(`abort`,i)}),null)};e.forEach(e=>e.addEventListener(`abort`,i));let{signal:s}=n;return s.unsubscribe=()=>j.asap(o),s},In=function*(e,t){let n=e.byteLength;if(!t||n<t){yield e;return}let r=0,i;for(;r<n;)i=r+t,yield e.slice(r,i),r=i},Ln=async function*(e,t){for await(let n of Rn(e))yield*In(n,t)},Rn=async function*(e){if(e[Symbol.asyncIterator]){yield*e;return}let t=e.getReader();try{for(;;){let{done:e,value:n}=await t.read();if(e)break;yield n}}finally{await t.cancel()}},zn=(e,t,n,r)=>{let i=Ln(e,t),a=0,o,s=e=>{o||(o=!0,r&&r(e))};return new ReadableStream({async pull(e){try{let{done:t,value:r}=await i.next();if(t){s(),e.close();return}let o=r.byteLength;n&&n(a+=o),e.enqueue(new Uint8Array(r))}catch(e){throw s(e),e}},cancel(e){return s(e),i.return()}},{highWaterMark:2})};function Bn(e){if(!e||typeof e!=`string`||!e.startsWith(`data:`))return 0;let t=e.indexOf(`,`);if(t<0)return 0;let n=e.slice(5,t),r=e.slice(t+1);if(/;base64/i.test(n)){let e=r.length,t=r.length;for(let n=0;n<t;n++)if(r.charCodeAt(n)===37&&n+2<t){let t=r.charCodeAt(n+1),i=r.charCodeAt(n+2);(t>=48&&t<=57||t>=65&&t<=70||t>=97&&t<=102)&&(i>=48&&i<=57||i>=65&&i<=70||i>=97&&i<=102)&&(e-=2,n+=2)}let n=0,i=t-1,a=e=>e>=2&&r.charCodeAt(e-2)===37&&r.charCodeAt(e-1)===51&&(r.charCodeAt(e)===68||r.charCodeAt(e)===100);i>=0&&(r.charCodeAt(i)===61?(n++,i--):a(i)&&(n++,i-=3)),n===1&&i>=0&&(r.charCodeAt(i)===61||a(i))&&n++;let o=Math.floor(e/4)*3-(n||0);return o>0?o:0}if(typeof Buffer<`u`&&typeof Buffer.byteLength==`function`)return Buffer.byteLength(r,`utf8`);let i=0;for(let e=0,t=r.length;e<t;e++){let n=r.charCodeAt(e);if(n<128)i+=1;else if(n<2048)i+=2;else if(n>=55296&&n<=56319&&e+1<t){let t=r.charCodeAt(e+1);t>=56320&&t<=57343?(i+=4,e++):i+=3}else i+=3}return i}var Vn=`1.16.1`,Hn=64*1024,{isFunction:Un}=j,Wn=(e,...t)=>{try{return!!e(...t)}catch{return!1}},Gn=e=>{let t=j.global!==void 0&&j.global!==null?j.global:globalThis,{ReadableStream:n,TextEncoder:r}=t;e=j.merge.call({skipUndefined:!0},{Request:t.Request,Response:t.Response},e);let{fetch:i,Request:a,Response:o}=e,s=i?Un(i):typeof fetch==`function`,c=Un(a),l=Un(o);if(!s)return!1;let u=s&&Un(n),d=s&&(typeof r==`function`?(e=>t=>e.encode(t))(new r):async e=>new Uint8Array(await new a(e).arrayBuffer())),f=c&&u&&Wn(()=>{let e=!1,t=new a(an.origin,{body:new n,method:`POST`,get duplex(){return e=!0,`half`}}),r=t.headers.has(`Content-Type`);return t.body!=null&&t.body.cancel(),e&&!r}),p=l&&u&&Wn(()=>j.isReadableStream(new o(``).body)),m={stream:p&&(e=>e.body)};s&&[`text`,`arrayBuffer`,`blob`,`formData`,`stream`].forEach(e=>{!m[e]&&(m[e]=(t,n)=>{let r=t&&t[e];if(r)return r.call(t);throw new M(`Response type '${e}' is not supported`,M.ERR_NOT_SUPPORT,n)})});let h=async e=>{if(e==null)return 0;if(j.isBlob(e))return e.size;if(j.isSpecCompliantForm(e))return(await new a(an.origin,{method:`POST`,body:e}).arrayBuffer()).byteLength;if(j.isArrayBufferView(e)||j.isArrayBuffer(e))return e.byteLength;if(j.isURLSearchParams(e)&&(e+=``),j.isString(e))return(await d(e)).byteLength},g=async(e,t)=>j.toFiniteNumber(e.getContentLength())??h(t);return async e=>{let{url:t,method:n,data:s,signal:l,cancelToken:u,timeout:d,onDownloadProgress:h,onUploadProgress:_,responseType:v,headers:y,withCredentials:b=`same-origin`,fetchOptions:x,maxContentLength:S,maxBodyLength:C}=Nn(e),w=j.isNumber(S)&&S>-1,ee=j.isNumber(C)&&C>-1,T=i||fetch;v=v?(v+``).toLowerCase():`text`;let te=Fn([l,u&&u.toAbortSignal()],d),E=null,ne=te&&te.unsubscribe&&(()=>{te.unsubscribe()}),re;try{if(w&&typeof t==`string`&&t.startsWith(`data:`)&&Bn(t)>S)throw new M(`maxContentLength size of `+S+` exceeded`,M.ERR_BAD_RESPONSE,e,E);if(ee&&n!==`get`&&n!==`head`){let t=await g(y,s);if(typeof t==`number`&&isFinite(t)&&t>C)throw new M(`Request body larger than maxBodyLength limit`,M.ERR_BAD_REQUEST,e,E)}if(_&&f&&n!==`get`&&n!==`head`&&(re=await g(y,s))!==0){let e=new a(t,{method:`POST`,body:s,duplex:`half`}),n;if(j.isFormData(s)&&(n=e.headers.get(`content-type`))&&y.setContentType(n),e.body){let[t,n]=xn(re,bn(Sn(_)));s=zn(e.body,Hn,t,n)}}j.isString(b)||(b=b?`include`:`omit`);let i=c&&`credentials`in a.prototype;if(j.isFormData(s)){let e=y.getContentType();e&&/^multipart\/form-data/i.test(e)&&!/boundary=/i.test(e)&&y.delete(`content-type`)}y.set(`User-Agent`,`axios/`+Vn,!1);let l={...x,signal:te,method:n.toUpperCase(),headers:Tt(y.normalize()),body:s,duplex:`half`,credentials:i?b:void 0};E=c&&new a(t,l);let u=await(c?T(E,x):T(t,l));if(w){let t=j.toFiniteNumber(u.headers.get(`content-length`));if(t!=null&&t>S)throw new M(`maxContentLength size of `+S+` exceeded`,M.ERR_BAD_RESPONSE,e,E)}let d=p&&(v===`stream`||v===`response`);if(p&&u.body&&(h||w||d&&ne)){let t={};[`status`,`statusText`,`headers`].forEach(e=>{t[e]=u[e]});let n=j.toFiniteNumber(u.headers.get(`content-length`)),[r,i]=h&&xn(n,bn(Sn(h),!0))||[],a=0;u=new o(zn(u.body,Hn,t=>{if(w&&(a=t,a>S))throw new M(`maxContentLength size of `+S+` exceeded`,M.ERR_BAD_RESPONSE,e,E);r&&r(t)},()=>{i&&i(),ne&&ne()}),t)}v||=`text`;let ie=await m[j.findKey(m,v)||`text`](u,e);if(w&&!p&&!d){let t;if(ie!=null&&(typeof ie.byteLength==`number`?t=ie.byteLength:typeof ie.size==`number`?t=ie.size:typeof ie==`string`&&(t=typeof r==`function`?new r().encode(ie).byteLength:ie.length)),typeof t==`number`&&t>S)throw new M(`maxContentLength size of `+S+` exceeded`,M.ERR_BAD_RESPONSE,e,E)}return!d&&ne&&ne(),await new Promise((t,n)=>{gn(t,n,{data:ie,headers:Pt.from(u.headers),status:u.status,statusText:u.statusText,config:e,request:E})})}catch(t){if(ne&&ne(),te&&te.aborted&&te.reason instanceof M){let n=te.reason;throw n.config=e,E&&(n.request=E),t!==n&&(n.cause=t),n}throw t&&t.name===`TypeError`&&/Load failed|fetch/i.test(t.message)?Object.assign(new M(`Network Error`,M.ERR_NETWORK,e,E,t&&t.response),{cause:t.cause||t}):M.from(t,t&&t.code,e,E,t&&t.response)}}},Kn=new Map,qn=e=>{let t=e&&e.env||{},{fetch:n,Request:r,Response:i}=t,a=[r,i,n],o=a.length,s,c,l=Kn;for(;o--;)s=a[o],c=l.get(s),c===void 0&&l.set(s,c=o?new Map:Gn(t)),l=c;return c};qn();var Jn={http:null,xhr:Pn,fetch:{get:qn}};j.forEach(Jn,(e,t)=>{if(e){try{Object.defineProperty(e,`name`,{__proto__:null,value:t})}catch{}Object.defineProperty(e,`adapterName`,{__proto__:null,value:t})}});var Yn=e=>`- ${e}`,Xn=e=>j.isFunction(e)||e===null||e===!1;function Zn(e,t){e=j.isArray(e)?e:[e];let{length:n}=e,r,i,a={};for(let o=0;o<n;o++){r=e[o];let n;if(i=r,!Xn(r)&&(i=Jn[(n=String(r)).toLowerCase()],i===void 0))throw new M(`Unknown adapter '${n}'`);if(i&&(j.isFunction(i)||(i=i.get(t))))break;a[n||`#`+o]=i}if(!i){let e=Object.entries(a).map(([e,t])=>`adapter ${e} `+(t===!1?`is not supported by the environment`:`is not available in the build`));throw new M(`There is no suitable adapter to dispatch the request `+(n?e.length>1?`since :
`+e.map(Yn).join(`
`):` `+Yn(e[0]):`as no adapter specified`),`ERR_NOT_SUPPORT`)}return i}var Qn={getAdapter:Zn,adapters:Jn};function $n(e){if(e.cancelToken&&e.cancelToken.throwIfRequested(),e.signal&&e.signal.aborted)throw new hn(null,e)}function er(e){return $n(e),e.headers=Pt.from(e.headers),e.data=pn.call(e,e.transformRequest),[`post`,`put`,`patch`].indexOf(e.method)!==-1&&e.headers.setContentType(`application/x-www-form-urlencoded`,!1),Qn.getAdapter(e.adapter||fn.adapter,e)(e).then(function(t){$n(e),e.response=t;try{t.data=pn.call(e,e.transformResponse,t)}finally{delete e.response}return t.headers=Pt.from(t.headers),t},function(t){if(!mn(t)&&($n(e),t&&t.response)){e.response=t.response;try{t.response.data=pn.call(e,e.transformResponse,t.response)}finally{delete e.response}t.response.headers=Pt.from(t.response.headers)}return Promise.reject(t)})}var tr={};[`object`,`boolean`,`number`,`function`,`string`,`symbol`].forEach((e,t)=>{tr[e]=function(n){return typeof n===e||`a`+(t<1?`n `:` `)+e}});var nr={};tr.transitional=function(e,t,n){function r(e,t){return`[Axios v`+Vn+`] Transitional option '`+e+`'`+t+(n?`. `+n:``)}return(n,i,a)=>{if(e===!1)throw new M(r(i,` has been removed`+(t?` in `+t:``)),M.ERR_DEPRECATED);return t&&!nr[i]&&(nr[i]=!0,console.warn(r(i,` has been deprecated since v`+t+` and will be removed in the near future`))),e?e(n,i,a):!0}},tr.spelling=function(e){return(t,n)=>(console.warn(`${n} is likely a misspelling of ${e}`),!0)};function rr(e,t,n){if(typeof e!=`object`)throw new M(`options must be an object`,M.ERR_BAD_OPTION_VALUE);let r=Object.keys(e),i=r.length;for(;i-- >0;){let a=r[i],o=Object.prototype.hasOwnProperty.call(t,a)?t[a]:void 0;if(o){let t=e[a],n=t===void 0||o(t,a,e);if(n!==!0)throw new M(`option `+a+` must be `+n,M.ERR_BAD_OPTION_VALUE);continue}if(n!==!0)throw new M(`Unknown option `+a,M.ERR_BAD_OPTION)}}var ir={assertOptions:rr,validators:tr},ar=ir.validators,or=class{constructor(e){this.defaults=e||{},this.interceptors={request:new Yt,response:new Yt}}async request(e,t){try{return await this._request(e,t)}catch(e){if(e instanceof Error){let t={};Error.captureStackTrace?Error.captureStackTrace(t):t=Error();let n=(()=>{if(!t.stack)return``;let e=t.stack.indexOf(`
`);return e===-1?``:t.stack.slice(e+1)})();try{if(!e.stack)e.stack=n;else if(n){let t=n.indexOf(`
`),r=t===-1?-1:n.indexOf(`
`,t+1),i=r===-1?``:n.slice(r+1);String(e.stack).endsWith(i)||(e.stack+=`
`+n)}}catch{}}throw e}}_request(e,t){typeof e==`string`?(t||={},t.url=e):t=e||{},t=kn(this.defaults,t);let{transitional:n,paramsSerializer:r,headers:i}=t;n!==void 0&&ir.assertOptions(n,{silentJSONParsing:ar.transitional(ar.boolean),forcedJSONParsing:ar.transitional(ar.boolean),clarifyTimeoutError:ar.transitional(ar.boolean),legacyInterceptorReqResOrdering:ar.transitional(ar.boolean)},!1),r!=null&&(j.isFunction(r)?t.paramsSerializer={serialize:r}:ir.assertOptions(r,{encode:ar.function,serialize:ar.function},!0)),t.allowAbsoluteUrls!==void 0||(this.defaults.allowAbsoluteUrls===void 0?t.allowAbsoluteUrls=!0:t.allowAbsoluteUrls=this.defaults.allowAbsoluteUrls),ir.assertOptions(t,{baseUrl:ar.spelling(`baseURL`),withXsrfToken:ar.spelling(`withXSRFToken`)},!0),t.method=(t.method||this.defaults.method||`get`).toLowerCase();let a=i&&j.merge(i.common,i[t.method]);i&&j.forEach([`delete`,`get`,`head`,`post`,`put`,`patch`,`query`,`common`],e=>{delete i[e]}),t.headers=Pt.concat(a,i);let o=[],s=!0;this.interceptors.request.forEach(function(e){if(typeof e.runWhen==`function`&&e.runWhen(t)===!1)return;s&&=e.synchronous;let n=t.transitional||Xt;n&&n.legacyInterceptorReqResOrdering?o.unshift(e.fulfilled,e.rejected):o.push(e.fulfilled,e.rejected)});let c=[];this.interceptors.response.forEach(function(e){c.push(e.fulfilled,e.rejected)});let l,u=0,d;if(!s){let e=[er.bind(this),void 0];for(e.unshift(...o),e.push(...c),d=e.length,l=Promise.resolve(t);u<d;)l=l.then(e[u++],e[u++]);return l}d=o.length;let f=t;for(;u<d;){let e=o[u++],t=o[u++];try{f=e(f)}catch(e){t.call(this,e);break}}try{l=er.call(this,f)}catch(e){return Promise.reject(e)}for(u=0,d=c.length;u<d;)l=l.then(c[u++],c[u++]);return l}getUri(e){return e=kn(this.defaults,e),Jt(Dn(e.baseURL,e.url,e.allowAbsoluteUrls),e.params,e.paramsSerializer)}};j.forEach([`delete`,`get`,`head`,`options`],function(e){or.prototype[e]=function(t,n){return this.request(kn(n||{},{method:e,url:t,data:(n||{}).data}))}}),j.forEach([`post`,`put`,`patch`,`query`],function(e){function t(t){return function(n,r,i){return this.request(kn(i||{},{method:e,headers:t?{"Content-Type":`multipart/form-data`}:{},url:n,data:r}))}}or.prototype[e]=t(),e!==`query`&&(or.prototype[e+`Form`]=t(!0))});var sr=class e{constructor(e){if(typeof e!=`function`)throw TypeError(`executor must be a function.`);let t;this.promise=new Promise(function(e){t=e});let n=this;this.promise.then(e=>{if(!n._listeners)return;let t=n._listeners.length;for(;t-- >0;)n._listeners[t](e);n._listeners=null}),this.promise.then=e=>{let t,r=new Promise(e=>{n.subscribe(e),t=e}).then(e);return r.cancel=function(){n.unsubscribe(t)},r},e(function(e,r,i){n.reason||(n.reason=new hn(e,r,i),t(n.reason))})}throwIfRequested(){if(this.reason)throw this.reason}subscribe(e){if(this.reason){e(this.reason);return}this._listeners?this._listeners.push(e):this._listeners=[e]}unsubscribe(e){if(!this._listeners)return;let t=this._listeners.indexOf(e);t!==-1&&this._listeners.splice(t,1)}toAbortSignal(){let e=new AbortController,t=t=>{e.abort(t)};return this.subscribe(t),e.signal.unsubscribe=()=>this.unsubscribe(t),e.signal}static source(){let t;return{token:new e(function(e){t=e}),cancel:t}}};function cr(e){return function(t){return e.apply(null,t)}}function lr(e){return j.isObject(e)&&e.isAxiosError===!0}var ur={Continue:100,SwitchingProtocols:101,Processing:102,EarlyHints:103,Ok:200,Created:201,Accepted:202,NonAuthoritativeInformation:203,NoContent:204,ResetContent:205,PartialContent:206,MultiStatus:207,AlreadyReported:208,ImUsed:226,MultipleChoices:300,MovedPermanently:301,Found:302,SeeOther:303,NotModified:304,UseProxy:305,Unused:306,TemporaryRedirect:307,PermanentRedirect:308,BadRequest:400,Unauthorized:401,PaymentRequired:402,Forbidden:403,NotFound:404,MethodNotAllowed:405,NotAcceptable:406,ProxyAuthenticationRequired:407,RequestTimeout:408,Conflict:409,Gone:410,LengthRequired:411,PreconditionFailed:412,PayloadTooLarge:413,UriTooLong:414,UnsupportedMediaType:415,RangeNotSatisfiable:416,ExpectationFailed:417,ImATeapot:418,MisdirectedRequest:421,UnprocessableEntity:422,Locked:423,FailedDependency:424,TooEarly:425,UpgradeRequired:426,PreconditionRequired:428,TooManyRequests:429,RequestHeaderFieldsTooLarge:431,UnavailableForLegalReasons:451,InternalServerError:500,NotImplemented:501,BadGateway:502,ServiceUnavailable:503,GatewayTimeout:504,HttpVersionNotSupported:505,VariantAlsoNegotiates:506,InsufficientStorage:507,LoopDetected:508,NotExtended:510,NetworkAuthenticationRequired:511,WebServerIsDown:521,ConnectionTimedOut:522,OriginIsUnreachable:523,TimeoutOccurred:524,SslHandshakeFailed:525,InvalidSslCertificate:526};Object.entries(ur).forEach(([e,t])=>{ur[t]=e});function dr(e){let t=new or(e),n=O(or.prototype.request,t);return j.extend(n,or.prototype,t,{allOwnKeys:!0}),j.extend(n,t,null,{allOwnKeys:!0}),n.create=function(t){return dr(kn(e,t))},n}var N=dr(fn);N.Axios=or,N.CanceledError=hn,N.CancelToken=sr,N.isCancel=mn,N.VERSION=Vn,N.toFormData=Ut,N.AxiosError=M,N.Cancel=N.CanceledError,N.all=function(e){return Promise.all(e)},N.spread=cr,N.isAxiosError=lr,N.mergeConfig=kn,N.AxiosHeaders=Pt,N.formToJSON=e=>ln(j.isHTMLForm(e)?new FormData(e):e),N.getAdapter=Qn.getAdapter,N.HttpStatusCode=ur,N.default=N;var fr=`http://localhost:8080/api/rrg`;async function pr(){return(await N.get(`${fr}/sectors`)).data}async function mr(e,t,n,r,i,a,o,s,c,l,u){let d=performance.now(),f=await N.get(`${fr}/snapshot`,{params:{benchmark:e,timeframe:t,trailLength:n,normalized:r,sectors:i?.join(`,`),minimalWindowResampling:a,watchlistOnlyResampling:o,watchlist:s?.join(`,`),selectedSector:c,hoveredSector:l},signal:u}),p=Math.round(performance.now()-d);return{data:f.data,latency:p}}async function hr(){return(await N.get(`${fr}/config/watchlist`)).data}async function gr(e){return(await N.put(`${fr}/config/watchlist`,e)).data}async function _r(){return(await N.get(`${fr}/config/settings`)).data}async function vr(e){return(await N.put(`${fr}/config/settings`,e)).data}async function yr(){return(await N.get(`${fr}/config/commandbar`)).data}async function br(e){return(await N.put(`${fr}/config/commandbar`,e)).data}var xr={benchmark:`NSE_INDEX_Nifty 50`,showLabels:!0,gridDensity:`normal`,quadrantOpacity:.22,semanticZoom:!0,animationSpeed:1,playbackMode:!1,zoomSensitivity:.1,panSensitivity:1,minZoom:.8,maxZoom:6,minimalWindowResampling:!1,watchlistOnlyResampling:!1,backgroundSnapshotRefresh:!0,hydrated:!1},Sr=null,Cr=D((e,t)=>({...xr,setBenchmark:n=>{e({benchmark:n}),t().saveConfig()},setShowLabels:n=>{e({showLabels:n}),t().saveConfig()},setGridDensity:n=>{e({gridDensity:n}),t().saveConfig()},setQuadrantOpacity:n=>{e({quadrantOpacity:n}),t().saveConfig()},setSemanticZoom:n=>{e({semanticZoom:n}),t().saveConfig()},setAnimationSpeed:t=>e({animationSpeed:t}),setPlaybackMode:t=>e({playbackMode:t}),setZoomSensitivity:n=>{e({zoomSensitivity:n}),t().saveConfig()},setPanSensitivity:n=>{e({panSensitivity:n}),t().saveConfig()},setMinZoom:n=>{e({minZoom:n}),t().saveConfig()},setMaxZoom:n=>{e({maxZoom:n}),t().saveConfig()},setMinimalWindowResampling:n=>{e({minimalWindowResampling:n}),t().saveConfig()},setWatchlistOnlyResampling:n=>{e({watchlistOnlyResampling:n}),t().saveConfig()},setBackgroundSnapshotRefresh:n=>{e({backgroundSnapshotRefresh:n}),t().saveConfig()},resetDefaults:()=>{e({...xr,hydrated:!0}),t().saveConfig()},loadConfig:async()=>{try{let t=await _r();t&&e({minimalWindowResampling:t.optimization?.minimalWindowResampling??xr.minimalWindowResampling,watchlistOnlyResampling:t.optimization?.watchlistOnlyResampling??xr.watchlistOnlyResampling,backgroundSnapshotRefresh:t.optimization?.backgroundSnapshotRefresh??xr.backgroundSnapshotRefresh,showLabels:t.rendering?.labelsEnabled??xr.showLabels,semanticZoom:t.rendering?.semanticZoom??xr.semanticZoom,minZoom:t.camera?.minInteractionZoom??xr.minZoom,maxZoom:t.camera?.maxZoom??xr.maxZoom,hydrated:!0})}catch(t){console.error(`Failed to load settings config`,t),e({hydrated:!0})}},saveConfig:()=>{Sr&&clearTimeout(Sr),Sr=setTimeout(async()=>{let e=t(),n={optimization:{minimalWindowResampling:e.minimalWindowResampling,watchlistOnlyResampling:e.watchlistOnlyResampling,backgroundSnapshotRefresh:e.backgroundSnapshotRefresh,snapshotCacheEnabled:!0,snapshotCacheTtlEnabled:!0},rendering:{trailsEnabled:!0,trailArrowsEnabled:!0,trailGlowEnabled:!0,labelsEnabled:e.showLabels,adaptiveLabels:!0,semanticZoom:e.semanticZoom},camera:{autoFitEnabled:!0,fitPadding:.5,smoothInterpolation:!0,maxZoom:e.maxZoom,minInteractionZoom:e.minZoom},interaction:{hoverHighlight:!0,selectionHighlight:!0,tooltipEnabled:!0}};try{await vr(n)}catch(e){console.error(`Failed to save settings config`,e)}},500)}})),P={MINUTE:`m`,HOUR:`h`,DAY:`d`,WEEK:`w`,MONTH:`mo`,YEAR:`y`},wr={min:P.MINUTE,m:P.MINUTE,h:P.HOUR,d:P.DAY,w:P.WEEK,mo:P.MONTH,y:P.YEAR},Tr={[P.MINUTE]:1440,[P.HOUR]:168,[P.DAY]:365,[P.WEEK]:260,[P.MONTH]:120,[P.YEAR]:20},Er={[P.MINUTE]:1,[P.HOUR]:60,[P.DAY]:1440,[P.WEEK]:10080,[P.MONTH]:5e4,[P.YEAR]:6e5},Dr={[P.MINUTE]:`Min`,[P.HOUR]:`Hour`,[P.DAY]:`Day`,[P.WEEK]:`Week`,[P.MONTH]:`Month`,[P.YEAR]:`Year`};function Or(e){let t=e.toLowerCase().match(/^(\d+)([a-z]+)$/);if(!t)throw Error(`Invalid timeframe format: ${e}`);let[,n,r]=t;if(n.includes(`.`))throw Error(`Fractional timeframes are not allowed: ${e}`);let i=parseInt(n,10);if(isNaN(i)||i<=0)throw Error(`Timeframe multiplier must be > 0: ${e}`);let a=wr[r];if(!a)throw Error(`Unknown timeframe unit: ${r}`);if(i>Tr[a])throw Error(`Timeframe ${i}${a} exceeds max limit of ${Tr[a]}${a}`);let o=`${i}${a}`,s=`${i} ${Dr[a]}`,c=a===P.MINUTE||a===P.HOUR,l=!c,u=c?1:1440,d=i;if(a===P.HOUR&&(d=i*60),a===P.WEEK&&(d=i*7),a===P.MONTH&&(d=i*30),a===P.YEAR&&(d=i*365),d>1e4)throw Error(`Timeframe ${o} base candle multiplier exceeds hard limit of 10000`);let f;f=a===P.MINUTE&&i<15?`ultra_intraday`:c?`intraday`:a===P.DAY&&i<5?`swing`:a===P.DAY||a===P.WEEK?`position`:`macro`;let p=Er[a]*i;return{raw:e,multiplier:i,unit:a,canonical:o,displayLabel:s,baseResolutionMinutes:u,baseCandleMultiplier:d,intraday:c,isCalendarAnchored:l,timeframeScaleClass:f,sortWeight:p}}var kr={timeframe:`15min`,trailLength:10,bookmarkedTrailLengths:[5,10,15,20,30],bookmarkedTimeframes:[`1min`,`5min`,`15min`,`45min`,`1h`,`1d`,`1w`,`1mo`],recentTimeframes:[],normalized:!0,showTrails:!0,hydrated:!1},Ar=null,jr=D((e,t)=>({...kr,setTimeframe:n=>{try{let r=Or(n);e({timeframe:r.canonical}),t().addRecentTimeframe(r.canonical),t().saveConfig()}catch(e){console.warn(`Invalid timeframe`,e)}},setTrailLength:n=>{e({trailLength:n}),t().saveConfig()},setBookmarkedTrailLengths:n=>{e({bookmarkedTrailLengths:n}),t().saveConfig()},setBookmarkedTimeframes:n=>{let r=n.map(e=>{try{return Or(e)}catch{return null}}).filter(Boolean).sort((e,t)=>e.sortWeight-t.sortWeight).map(e=>e.canonical);e({bookmarkedTimeframes:Array.from(new Set(r))}),t().saveConfig()},addRecentTimeframe:n=>{e({recentTimeframes:[n,...t().recentTimeframes.filter(e=>e!==n)].slice(0,5)})},setNormalized:n=>{e({normalized:n}),t().saveConfig()},setShowTrails:n=>{e({showTrails:n}),t().saveConfig()},loadConfig:async()=>{try{let t=await yr();t&&e({timeframe:t.timeframes?.active||kr.timeframe,bookmarkedTimeframes:t.timeframes?.bookmarked||kr.bookmarkedTimeframes,trailLength:t.trailLengths?.active||kr.trailLength,bookmarkedTrailLengths:t.trailLengths?.bookmarked||kr.bookmarkedTrailLengths,normalized:t.toggles?.normalized??kr.normalized,showTrails:t.toggles?.trailsEnabled??kr.showTrails,hydrated:!0})}catch(t){console.error(`Failed to load command bar config`,t),e({hydrated:!0})}},saveConfig:()=>{Ar&&clearTimeout(Ar),Ar=setTimeout(async()=>{let e=t(),n={timeframes:{active:e.timeframe,bookmarked:e.bookmarkedTimeframes},trailLengths:{active:e.trailLength,bookmarked:e.bookmarkedTrailLengths},toggles:{normalized:e.normalized,trailsEnabled:e.showTrails}};try{await br(n)}catch(e){console.error(`Failed to save command bar config`,e)}},500)}})),Mr=null,F=D((e,t)=>({rawData:[],enrichedData:[],sectors:[],watchlist:[],quadrantDistribution:{leading:0,weakening:0,lagging:0,improving:0},selectedSector:null,hoveredSector:null,hiddenSectors:[],connectionStatus:`DISCONNECTED`,lastUpdate:null,latency:0,loading:!1,historicalFrames:[],currentFrameIndex:0,playbackSpeed:1,isPlaying:!1,crosshairX:null,crosshairY:null,lastQueryKey:null,setSelectedSector:t=>e({selectedSector:t}),setHoveredSector:t=>e({hoveredSector:t}),setCrosshair:(t,n)=>e({crosshairX:t,crosshairY:n}),setPlaybackSpeed:t=>e({playbackSpeed:t}),setIsPlaying:t=>e({isPlaying:t}),setCurrentFrameIndex:t=>e({currentFrameIndex:t}),toggleSector:n=>e(e=>{let r=e.watchlist.map(e=>e.symbol===n?{...e,enabled:!e.enabled}:e);return t().saveWatchlist(r),{watchlist:r}}),toggleHiddenSector:t=>e(e=>({hiddenSectors:e.hiddenSectors.includes(t)?e.hiddenSectors.filter(e=>e!==t):[...e.hiddenSectors,t]})),hideSectors:t=>e(e=>{let n=[...e.hiddenSectors];return t.forEach(e=>{n.includes(e)||n.push(e)}),{hiddenSectors:n}}),showSectors:t=>e(e=>({hiddenSectors:e.hiddenSectors.filter(e=>!t.includes(e))})),selectAllSectors:()=>e(e=>{let n=e.watchlist.map(e=>({...e,enabled:!0}));return t().saveWatchlist(n),{watchlist:n}}),clearAllSectors:()=>e(e=>{let n=e.watchlist.map(e=>({...e,enabled:!1}));return t().saveWatchlist(n),{watchlist:n}}),setWatchlist:n=>{e({watchlist:n}),t().saveWatchlist(n)},saveWatchlist:e=>{Mr&&clearTimeout(Mr),Mr=setTimeout(async()=>{try{await gr({version:1,watchlistOnlyResampling:Cr.getState().watchlistOnlyResampling,watchlists:[{id:`default`,name:`Default`,active:!0,sectors:e.map(e=>({symbol:e.symbol,pinned:e.pinned||!1,priority:e.order||0,hidden:!e.enabled}))}]})}catch(e){console.error(`Failed to save watchlist config`,e)}},500)},fetchData:async n=>{let{benchmark:r,minimalWindowResampling:i,watchlistOnlyResampling:a}=Cr.getState(),{timeframe:o,trailLength:s,normalized:c}=jr.getState();r===`NSE_INDEX__Nifty_50`&&(r=`NSE_INDEX_Nifty 50`);let{watchlist:l,lastQueryKey:u,selectedSector:d,hoveredSector:f}=t(),p=l.filter(e=>e.enabled).map(e=>e.symbol),m=l.map(e=>e.symbol);p=p.filter(e=>e.trim().toLowerCase()!==`sector`&&e.trim()!==``),p.includes(r)||p.push(r);let h=JSON.stringify({benchmark:r,timeframe:o,trailLength:s,normalized:c,minimalWindowResampling:i,watchlistOnlyResampling:a,enabledSectors:p,watchlistSectors:m,selectedSector:d,hoveredSector:f});if(h!==u){if(e({lastQueryKey:h}),p.length===0){e({rawData:[],enrichedData:[],quadrantDistribution:{leading:0,weakening:0,lagging:0,improving:0}});return}e({loading:!0});try{let{data:t,latency:l}=await mr(r,o,s,c,p,i,a,m,d,f,n);e({rawData:t,enrichedData:E(t),quadrantDistribution:ne(t),connectionStatus:`CONNECTED`,lastUpdate:Date.now(),latency:l,loading:!1})}catch(t){t.name!==`CanceledError`&&t.name!==`AbortError`&&e({connectionStatus:`DISCONNECTED`,loading:!1})}}},fetchSectorList:async()=>{try{let t=await pr(),n=[];try{let e=await hr();e&&e.watchlists&&e.watchlists.length>0&&(n=(e.watchlists.find(e=>e.active)||e.watchlists[0]).sectors.map(e=>({symbol:e.symbol,enabled:!e.hidden,pinned:e.pinned,order:e.priority})))}catch(e){console.error(`Failed to load watchlist config`,e)}let{benchmark:r}=Cr.getState();r===`NSE_INDEX__Nifty_50`&&(r=`NSE_INDEX_Nifty 50`);let i=Array.from(new Set([r,...t])),a=new Map(n.map(e=>[e.symbol,e]));e({sectors:i,watchlist:i.map(e=>a.has(e)?a.get(e):{symbol:e,enabled:!0})})}catch{console.error(`Failed to fetch sectors`)}}})),Nr=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.fragment`);function r(e,n,r){var i=null;if(r!==void 0&&(i=``+r),n.key!==void 0&&(i=``+n.key),`key`in n)for(var a in r={},n)a!==`key`&&(r[a]=n[a]);else r=n;return n=r.ref,{$$typeof:t,type:e,key:i,ref:n===void 0?null:n,props:r}}e.Fragment=n,e.jsx=r,e.jsxs=r})),I=o(((e,t)=>{t.exports=Nr()}))();function Pr({label:e,checked:t,onChange:n}){return(0,I.jsxs)(`div`,{className:`settings-row`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:e}),(0,I.jsxs)(`label`,{className:`settings-toggle`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:t,onChange:e=>n(e.target.checked)}),(0,I.jsx)(`span`,{className:`settings-toggle__track`}),(0,I.jsx)(`span`,{className:`settings-toggle__thumb`})]})]})}function Fr({label:e,value:t,min:n,max:r,step:i,display:a,onChange:o}){return(0,I.jsxs)(`div`,{className:`settings-row`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:e}),(0,I.jsxs)(`div`,{className:`settings-row__control`,children:[(0,I.jsx)(`input`,{type:`range`,min:n,max:r,step:i,value:t,onChange:e=>o(parseFloat(e.target.value)),className:`settings-slider`}),(0,I.jsx)(`span`,{className:`settings-value-display`,children:a??t})]})]})}function Ir({label:e,options:t,value:n,onChange:r}){return(0,I.jsxs)(`div`,{className:`settings-row`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:e}),(0,I.jsx)(`div`,{className:`settings-row__control`,children:t.map(e=>(0,I.jsx)(`button`,{className:`settings-btn ${n===e.value?`settings-btn--active`:``}`,onClick:()=>r(e.value),children:e.label},e.value))})]})}var Lr=v.memo(({open:e,onClose:t})=>{let n=Cr(),r=jr(),{watchlist:i,toggleSector:a,selectAllSectors:o,clearAllSectors:s}=F(),c=(0,v.useCallback)(e=>{e.target===e.currentTarget&&t()},[t]);if(!e)return null;let l=i.filter(e=>e.enabled).length;return(0,I.jsx)(`div`,{className:`settings-overlay`,onClick:c,role:`presentation`,children:(0,I.jsxs)(`div`,{className:`settings-modal`,role:`dialog`,"aria-modal":`true`,"aria-label":`Chart Settings`,children:[(0,I.jsxs)(`div`,{className:`settings-modal__header`,children:[(0,I.jsx)(`span`,{className:`settings-modal__title`,children:`⚙ Chart Settings`}),(0,I.jsx)(`button`,{className:`settings-modal__close`,onClick:t,"aria-label":`Close settings`,children:`✕`})]}),(0,I.jsxs)(`div`,{className:`settings-modal__body`,children:[(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`General`}),(0,I.jsx)(Ir,{label:`Timeframe`,value:r.timeframe,options:[{value:`1d`,label:`DAY`},{value:`1w`,label:`WEEK`},{value:`1mo`,label:`MONTH`}],onChange:e=>r.setTimeframe(e)}),(0,I.jsxs)(`div`,{className:`settings-row`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:`Trail Length (Global)`}),(0,I.jsx)(`div`,{className:`settings-row__control`,children:[5,10,15,20,25,30].map(e=>(0,I.jsx)(`button`,{className:`settings-btn ${r.trailLength===e?`settings-btn--active`:``}`,onClick:()=>r.setTrailLength(e),children:e},e))})]}),(0,I.jsx)(Pr,{label:`Normalize RRG (100 Center)`,checked:r.normalized,onChange:r.setNormalized})]}),(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`Visuals`}),(0,I.jsx)(Pr,{label:`Show Trails`,checked:r.showTrails,onChange:r.setShowTrails}),(0,I.jsx)(Fr,{label:`Animation Speed`,value:n.animationSpeed,min:.25,max:4,step:.25,display:`${n.animationSpeed}x`,onChange:n.setAnimationSpeed})]}),(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`Optimizations`}),(0,I.jsxs)(`div`,{className:`settings-row`,title:`Optimized for live visualization performance. Replay/export modes automatically use full history.`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:`Minimal Window Resampling`}),(0,I.jsxs)(`label`,{className:`settings-toggle`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:n.minimalWindowResampling,onChange:e=>n.setMinimalWindowResampling(e.target.checked)}),(0,I.jsx)(`span`,{className:`settings-toggle__track`}),(0,I.jsx)(`span`,{className:`settings-toggle__thumb`})]})]}),(0,I.jsxs)(`div`,{className:`settings-row`,title:`Only sectors currently in the watchlist will be resampled during timeframe changes to improve responsiveness.`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:`Optimize Timeframe Switching (Resample Watchlist Only)`}),(0,I.jsxs)(`label`,{className:`settings-toggle`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:n.watchlistOnlyResampling,onChange:e=>n.setWatchlistOnlyResampling(e.target.checked)}),(0,I.jsx)(`span`,{className:`settings-toggle__track`}),(0,I.jsx)(`span`,{className:`settings-toggle__thumb`})]})]})]}),(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`Visual`}),(0,I.jsx)(Pr,{label:`Show Trails`,checked:r.showTrails,onChange:r.setShowTrails}),(0,I.jsx)(Pr,{label:`Show Labels`,checked:n.showLabels,onChange:n.setShowLabels}),(0,I.jsx)(Pr,{label:`Normalized Mode`,checked:r.normalized,onChange:r.setNormalized}),(0,I.jsx)(Ir,{label:`Grid Density`,value:n.gridDensity,options:[{value:`sparse`,label:`SPARSE`},{value:`normal`,label:`NORMAL`},{value:`dense`,label:`DENSE`}],onChange:e=>n.setGridDensity(e)}),(0,I.jsx)(Fr,{label:`Quadrant Opacity`,value:Math.round(n.quadrantOpacity*100),min:5,max:50,step:1,display:`${Math.round(n.quadrantOpacity*100)}%`,onChange:e=>n.setQuadrantOpacity(e/100)})]}),(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`Sectors`}),(0,I.jsxs)(`div`,{className:`settings-sector-header`,children:[(0,I.jsxs)(`span`,{className:`settings-sector-count`,children:[l,` / `,i.length,` ACTIVE`]}),(0,I.jsxs)(`div`,{className:`settings-sector-actions`,children:[(0,I.jsx)(`button`,{className:`settings-btn`,onClick:o,children:`ALL`}),(0,I.jsx)(`button`,{className:`settings-btn`,onClick:s,children:`NONE`})]})]}),(0,I.jsx)(`div`,{className:`settings-sector-grid`,children:i.map(e=>(0,I.jsx)(`button`,{className:`settings-sector-btn ${e.enabled?`settings-sector-btn--active`:``}`,onClick:()=>a(e.symbol),title:x(e.symbol),children:x(e.symbol)},e.symbol))})]}),(0,I.jsxs)(`div`,{className:`settings-section`,children:[(0,I.jsx)(`div`,{className:`settings-section__title`,children:`Viewport`}),(0,I.jsx)(Fr,{label:`Zoom Sensitivity`,value:n.zoomSensitivity,min:.05,max:.5,step:.05,display:String(n.zoomSensitivity),onChange:n.setZoomSensitivity}),(0,I.jsx)(Fr,{label:`Pan Sensitivity`,value:n.panSensitivity,min:.25,max:3,step:.25,display:String(n.panSensitivity),onChange:n.setPanSensitivity}),(0,I.jsxs)(`div`,{className:`settings-row`,children:[(0,I.jsx)(`span`,{className:`settings-row__label`,children:`Zoom Range (Min — Max)`}),(0,I.jsxs)(`div`,{className:`settings-row__control`,style:{gap:6},children:[(0,I.jsx)(`input`,{type:`number`,min:.3,max:1,step:.1,value:n.minZoom,onChange:e=>n.setMinZoom(parseFloat(e.target.value)),className:`settings-input`}),(0,I.jsx)(`span`,{style:{fontSize:9,color:`#555`},children:`—`}),(0,I.jsx)(`input`,{type:`number`,min:2,max:20,step:1,value:n.maxZoom,onChange:e=>n.setMaxZoom(parseFloat(e.target.value)),className:`settings-input`})]})]})]})]}),(0,I.jsxs)(`div`,{className:`settings-modal__footer`,children:[(0,I.jsx)(`button`,{className:`settings-footer-btn`,onClick:n.resetDefaults,children:`RESET DEFAULTS`}),(0,I.jsx)(`button`,{className:`settings-footer-btn settings-footer-btn--primary`,onClick:t,children:`APPLY`})]})]})})}),Rr=`modulepreload`,zr=function(e){return`/`+e},Br={},Vr=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}r=o(t.map(t=>{if(t=zr(t,n),t in Br)return;Br[t]=!0;let r=t.endsWith(`.css`),i=r?`[rel="stylesheet"]`:``;if(n)for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}else if(document.querySelector(`link[href="${t}"]${i}`))return;let o=document.createElement(`link`);if(o.rel=r?`stylesheet`:Rr,r||(o.as=`script`),o.crossOrigin=``,o.href=t,a&&o.setAttribute(`nonce`,a),document.head.appendChild(o),r)return new Promise((e,n)=>{o.addEventListener(`load`,e),o.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},Hr=(0,v.memo)(()=>{let{timeframe:e,setTimeframe:t,trailLength:n,setTrailLength:r,bookmarkedTrailLengths:i,setBookmarkedTrailLengths:a,bookmarkedTimeframes:o,setBookmarkedTimeframes:s,recentTimeframes:c,showTrails:l,setShowTrails:u,normalized:d,setNormalized:f}=jr(),{benchmark:p,setBenchmark:m}=Cr(),{sectors:h,isPlaying:g,setIsPlaying:_}=F(),[y,b]=(0,v.useState)(``),[S,C]=(0,v.useState)(!1),[w,ee]=(0,v.useState)(!1),[T,te]=(0,v.useState)(!1),[E,ne]=(0,v.useState)(10),[re,ie]=(0,v.useState)(45),[ae,oe]=(0,v.useState)(P.MINUTE),se=(0,v.useRef)(null),ce=(0,v.useRef)(null);(0,v.useEffect)(()=>{let e=e=>{se.current&&!se.current.contains(e.target)&&ee(!1),ce.current&&!ce.current.contains(e.target)&&te(!1)};return(w||T)&&document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[w,T]),(0,v.useEffect)(()=>{let e=setInterval(()=>{b(new Date().toTimeString().split(` `)[0])},1e3);return()=>clearInterval(e)},[]);let D=(e,t)=>{let n=URL.createObjectURL(e),r=document.createElement(`a`);r.href=n,r.download=t,r.click(),URL.revokeObjectURL(n)},O=async e=>{try{if(e===`SVG`){let e=document.getElementById(`rrg-scene-svg`);if(!e)return;let t=new XMLSerializer().serializeToString(e);D(new Blob([t],{type:`image/svg+xml;charset=utf-8`}),`rrg-export.svg`)}else if(e===`PNG`){let e=document.getElementById(`rrg-scene-container`);if(!e)return;let{toPng:t}=await Vr(async()=>{let{toPng:e}=await import(`./es-CRgxV0p-.js`);return{toPng:e}},[]),n=await t(e),r=document.createElement(`a`);r.href=n,r.download=`rrg-export.png`,r.click()}else if(e===`CSV`){let e=F.getState().enrichedData.map(e=>`${e.symbol},${e.x},${e.y},${e.quadrant},${e.velocity||0}`).join(`
`);D(new Blob([`symbol,x,y,quadrant,velocity
`+e],{type:`text/csv;charset=utf-8`}),`rrg-export.csv`)}else if(e===`JSON`){let e=F.getState(),t=JSON.stringify(e,null,2);D(new Blob([t],{type:`application/json;charset=utf-8`}),`rrg-state.json`)}}catch(e){console.error(`Export failed`,e)}};return(0,I.jsxs)(`div`,{className:`command-bar`,children:[(0,I.jsx)(`select`,{className:`command-bar__benchmark`,value:p||``,onChange:e=>m?.(e.target.value),children:h?.map(e=>(0,I.jsx)(`option`,{value:e,children:x(e)},e))}),(0,I.jsxs)(`div`,{className:`command-bar__group command-bar__timeframe`,children:[o.map(n=>{let r=n;try{r=Or(n).displayLabel.toUpperCase()}catch{}return(0,I.jsx)(`button`,{className:`command-bar__segment-btn ${e===n?`command-bar__segment-btn--active`:``}`,onClick:()=>t(n),onContextMenu:e=>{e.preventDefault(),o.length>1&&s(o.filter(e=>e!==n))},title:`Right-click to remove bookmark`,children:r},n)}),(0,I.jsxs)(`div`,{ref:ce,style:{position:`relative`,display:`flex`},children:[(0,I.jsx)(`button`,{className:`command-bar__segment-btn`,onClick:()=>te(!T),style:{fontWeight:`bold`},title:`Add Custom Timeframe`,children:`+`}),T&&(0,I.jsxs)(`div`,{className:`command-bar__popup`,style:{position:`absolute`,top:`100%`,left:`0`,background:`#111`,border:`1px solid #333`,padding:`8px`,zIndex:100,display:`flex`,gap:`4px`,marginTop:`4px`,borderRadius:`4px`,boxShadow:`0 4px 12px rgba(0,0,0,0.5)`,flexDirection:`column`,width:`220px`},children:[(0,I.jsxs)(`div`,{style:{display:`flex`,gap:`4px`},children:[(0,I.jsx)(`input`,{type:`number`,value:re,onChange:e=>ie(parseInt(e.target.value)||0),style:{width:`50px`,background:`#222`,color:`#fff`,border:`1px solid #444`,textAlign:`center`,borderRadius:`2px`},min:1}),(0,I.jsxs)(`select`,{value:ae,onChange:e=>oe(e.target.value),style:{flex:1,background:`#222`,color:`#fff`,border:`1px solid #444`,borderRadius:`2px`},children:[(0,I.jsx)(`option`,{value:P.MINUTE,children:`Minutes`}),(0,I.jsx)(`option`,{value:P.HOUR,children:`Hours`}),(0,I.jsx)(`option`,{value:P.DAY,children:`Days`}),(0,I.jsx)(`option`,{value:P.WEEK,children:`Weeks`}),(0,I.jsx)(`option`,{value:P.MONTH,children:`Months`}),(0,I.jsx)(`option`,{value:P.YEAR,children:`Years`})]}),(0,I.jsx)(`button`,{onClick:()=>{let e=`${re}${ae}`;try{let n=Or(e);o.includes(n.canonical)||s([...o,n.canonical]),t(n.canonical),te(!1)}catch(e){alert(e.message)}},style:{background:`#333`,border:`1px solid #444`,color:`#fff`,cursor:`pointer`,padding:`2px 8px`,borderRadius:`2px`,fontSize:`10px`},children:`ADD`})]}),c.length>0&&(0,I.jsxs)(`div`,{style:{marginTop:`8px`,borderTop:`1px solid #333`,paddingTop:`4px`},children:[(0,I.jsx)(`div`,{style:{fontSize:`10px`,color:`#888`,marginBottom:`4px`},children:`RECENT`}),(0,I.jsx)(`div`,{style:{display:`flex`,gap:`4px`,flexWrap:`wrap`},children:c.map(e=>(0,I.jsx)(`button`,{onClick:()=>{t(e),o.includes(e)||s([...o,e]),te(!1)},style:{background:`#222`,border:`1px solid #444`,color:`#ccc`,fontSize:`10px`,padding:`2px 4px`,cursor:`pointer`,borderRadius:`2px`},children:e},e))})]})]})]})]}),(0,I.jsxs)(`div`,{className:`command-bar__group command-bar__range`,children:[i.map(e=>(0,I.jsx)(`button`,{className:`command-bar__segment-btn ${n===e?`command-bar__segment-btn--active`:``}`,onClick:()=>r?.(e),onContextMenu:t=>{t.preventDefault(),i.length>1&&a(i.filter(t=>t!==e))},title:`Right-click to remove bookmark`,children:e},e)),(0,I.jsxs)(`div`,{ref:se,style:{position:`relative`,display:`flex`},children:[(0,I.jsx)(`button`,{className:`command-bar__segment-btn`,onClick:()=>ee(!w),style:{fontWeight:`bold`},title:`Add Custom Trail`,children:`+`}),w&&(0,I.jsxs)(`div`,{className:`command-bar__popup`,style:{position:`absolute`,top:`100%`,left:`0`,background:`#111`,border:`1px solid #333`,padding:`8px`,zIndex:100,display:`flex`,gap:`4px`,marginTop:`4px`,borderRadius:`4px`,boxShadow:`0 4px 12px rgba(0,0,0,0.5)`},children:[(0,I.jsx)(`input`,{type:`number`,value:E,onChange:e=>ne(parseInt(e.target.value)||0),style:{width:`50px`,background:`#222`,color:`#fff`,border:`1px solid #444`,textAlign:`center`,borderRadius:`2px`},min:1,max:500}),(0,I.jsx)(`button`,{onClick:()=>{E>0&&r(E),ee(!1)},style:{background:`#333`,border:`1px solid #444`,color:`#fff`,cursor:`pointer`,padding:`2px 8px`,borderRadius:`2px`,fontSize:`10px`},children:`APPLY`}),(0,I.jsx)(`button`,{onClick:()=>{E>0&&!i.includes(E)&&(a([...i,E].sort((e,t)=>e-t)),r(E),ee(!1))},style:{background:`#2c3e50`,border:`1px solid #34495e`,color:`#fff`,cursor:`pointer`,padding:`2px 8px`,fontSize:`10px`,borderRadius:`2px`},title:`Bookmark this length`,children:`★`})]})]})]}),(0,I.jsx)(`button`,{className:`command-bar__toggle ${l?`command-bar__toggle--active`:``}`,onClick:()=>u(!l),children:l?`☑ TRAIL`:`☐ TRAIL`}),(0,I.jsx)(`button`,{className:`command-bar__toggle ${d?`command-bar__toggle--active`:``}`,onClick:()=>f(!d),children:d?`☑ NORM`:`☐ NORM`}),(0,I.jsxs)(`div`,{className:`command-bar__playback`,children:[(0,I.jsx)(`button`,{className:`command-bar__playback-btn`,onClick:()=>{},children:`⏮`}),(0,I.jsx)(`button`,{className:`command-bar__playback-btn`,onClick:()=>_?.(!g),children:g?`⏸`:`⏯`}),(0,I.jsx)(`button`,{className:`command-bar__playback-btn`,onClick:()=>{},children:`⏭`})]}),(0,I.jsxs)(`select`,{className:`command-bar__export-btn`,onChange:e=>{e.target.value&&(O(e.target.value),e.target.value=``)},value:``,style:{appearance:`none`,textAlign:`center`},children:[(0,I.jsx)(`option`,{value:``,disabled:!0,children:`EXPORT ▾`}),(0,I.jsx)(`option`,{value:`SVG`,children:`SVG`}),(0,I.jsx)(`option`,{value:`PNG`,children:`PNG`}),(0,I.jsx)(`option`,{value:`CSV`,children:`CSV`}),(0,I.jsx)(`option`,{value:`JSON`,children:`JSON`})]}),(0,I.jsx)(`div`,{className:`command-bar__spacer`}),(0,I.jsx)(`div`,{className:`command-bar__clock`,children:y}),(0,I.jsx)(`button`,{id:`cmd-settings-btn`,className:`command-bar__settings-btn`,onClick:()=>C(!0),title:`Chart Settings`,children:`⚙ SETTINGS`}),(0,I.jsx)(Lr,{open:S,onClose:()=>C(!1)})]})}),Ur=({onClose:e})=>{let{watchlist:t,toggleSector:n,selectAllSectors:r,clearAllSectors:i}=F(),[a,o]=(0,v.useState)(``),s=(0,v.useRef)(null);(0,v.useEffect)(()=>{let t=t=>{t.key===`Escape`&&e()},n=t=>{s.current&&!s.current.contains(t.target)&&e()};return window.addEventListener(`keydown`,t),document.addEventListener(`mousedown`,n),()=>{window.removeEventListener(`keydown`,t),document.removeEventListener(`mousedown`,n)}},[e]);let c=(0,v.useMemo)(()=>{if(!a)return t;let e=a.toLowerCase();return t.filter(t=>x(t.symbol).toLowerCase().includes(e))},[t,a]);return(0,I.jsx)(`div`,{className:`watchlist-modal-overlay`,children:(0,I.jsxs)(`div`,{className:`watchlist-modal`,ref:s,children:[(0,I.jsxs)(`div`,{className:`watchlist-modal__header`,children:[(0,I.jsx)(`div`,{className:`watchlist-modal__title`,children:`SECTOR SETTINGS`}),(0,I.jsx)(`button`,{className:`watchlist-modal__close`,onClick:e,children:`×`})]}),(0,I.jsx)(`div`,{className:`watchlist-modal__search-container`,children:(0,I.jsx)(`input`,{type:`text`,className:`watchlist-modal__search`,placeholder:`Search sectors...`,value:a,onChange:e=>o(e.target.value),autoFocus:!0})}),(0,I.jsxs)(`div`,{className:`watchlist-modal__actions`,children:[(0,I.jsx)(`button`,{className:`watchlist-modal__btn`,onClick:r,children:`SELECT ALL`}),(0,I.jsx)(`button`,{className:`watchlist-modal__btn`,onClick:i,children:`CLEAR`})]}),(0,I.jsxs)(`div`,{className:`watchlist-modal__list`,children:[c.map(e=>(0,I.jsxs)(`label`,{className:`watchlist-modal__row`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:e.enabled,onChange:()=>n(e.symbol),className:`watchlist-modal__checkbox`}),(0,I.jsx)(`span`,{className:`watchlist-modal__name`,children:x(e.symbol)})]},e.symbol)),c.length===0&&(0,I.jsx)(`div`,{className:`watchlist-modal__empty`,children:`No sectors found.`})]}),(0,I.jsx)(`div`,{className:`watchlist-modal__footer`,children:(0,I.jsx)(`button`,{className:`watchlist-modal__btn watchlist-modal__btn--primary`,onClick:e,children:`DONE`})})]})})},Wr=(0,v.memo)(()=>{let{enrichedData:e,watchlist:t,selectedSector:n,setSelectedSector:r,hoveredSector:i,setHoveredSector:a,hiddenSectors:o,toggleHiddenSector:s,hideSectors:c,showSectors:l}=F(),[u,d]=(0,v.useState)(``),[f,p]=(0,v.useState)(!1),m=(0,v.useMemo)(()=>{if(!e)return[];if(!u)return e;let t=u.toLowerCase();return e.filter(e=>x(e.symbol).toLowerCase().includes(t))},[e,u]),h=(0,v.useMemo)(()=>{let e={LEADING:[],WEAKENING:[],LAGGING:[],IMPROVING:[]};return m.forEach(t=>{let n=t.quadrant?.toUpperCase();e[n]&&e[n].push(t)}),e.LEADING.sort((e,t)=>t.distance-e.distance),e.WEAKENING.sort((e,t)=>t.x-e.x),e.IMPROVING.sort((e,t)=>t.momentumRoc-e.momentumRoc),e.LAGGING.sort((e,t)=>e.x+e.y-(t.x+t.y)),e},[m]),g=({title:e,items:t,colorVar:u})=>t.length===0?null:(0,I.jsxs)(`div`,{className:`watchlist__section`,children:[(0,I.jsxs)(`div`,{className:`watchlist__section-header`,style:{color:u,display:`flex`,alignItems:`center`},children:[(0,I.jsxs)(`span`,{style:{flex:1},children:[e,` (`,t.length,`)`]}),(0,I.jsx)(`button`,{onClick:()=>l(t.map(e=>e.symbol)),style:{background:`none`,border:`none`,color:u,cursor:`pointer`,fontSize:`0.8em`,opacity:.8,padding:`0 4px`,fontWeight:`bold`},title:`Select All`,children:`All`}),(0,I.jsx)(`span`,{style:{opacity:.5},children:`|`}),(0,I.jsx)(`button`,{onClick:()=>c(t.map(e=>e.symbol)),style:{background:`none`,border:`none`,color:u,cursor:`pointer`,fontSize:`0.8em`,opacity:.8,padding:`0 4px`,fontWeight:`bold`},title:`Clear All`,children:`None`})]}),t.map(e=>{let t=n===e.symbol,c=i===e.symbol,l=o.includes(e.symbol);return(0,I.jsxs)(`div`,{className:`watchlist__row ${t?`watchlist__row--selected`:``} ${c&&!t?`watchlist__row--hovered`:``}`,onClick:()=>r?.(t?null:e.symbol),onMouseEnter:()=>a?.(e.symbol),onMouseLeave:()=>a?.(null),children:[(0,I.jsx)(`div`,{className:`watchlist__indicator`,style:{backgroundColor:u}}),(0,I.jsx)(`span`,{className:`watchlist__name`,children:x(e.symbol)}),(0,I.jsx)(`input`,{type:`checkbox`,checked:!l,onChange:t=>{t.stopPropagation(),s(e.symbol)},className:`watchlist__checkbox`,style:{marginLeft:`auto`,cursor:`pointer`}})]},e.symbol)})]});return(0,I.jsxs)(`div`,{className:`watchlist`,children:[(0,I.jsxs)(`div`,{className:`watchlist__header`,children:[(0,I.jsxs)(`span`,{children:[`SECTORS (`,t.filter(e=>e.enabled).length,`/`,t.length,`)`]}),(0,I.jsx)(`button`,{className:`watchlist__settings-btn`,onClick:()=>p(!0),children:`⚙`})]}),(0,I.jsx)(`div`,{className:`watchlist__search-container`,children:(0,I.jsx)(`input`,{type:`text`,className:`watchlist__search`,placeholder:`Search sectors...`,value:u,onChange:e=>d(e.target.value)})}),(0,I.jsx)(`div`,{className:`watchlist__divider`}),(0,I.jsxs)(`div`,{className:`watchlist__list`,children:[(0,I.jsx)(g,{title:`LEADING`,items:h.LEADING,colorVar:`var(--quadrant-leading-text, #2ECC71)`}),(0,I.jsx)(g,{title:`WEAKENING`,items:h.WEAKENING,colorVar:`var(--quadrant-weakening-text, #F1C40F)`}),(0,I.jsx)(g,{title:`LAGGING`,items:h.LAGGING,colorVar:`var(--quadrant-lagging-text, #E74C3C)`}),(0,I.jsx)(g,{title:`IMPROVING`,items:h.IMPROVING,colorVar:`var(--quadrant-improving-text, #3498DB)`})]}),f&&(0,I.jsx)(Ur,{onClose:()=>p(!1)})]})}),Gr=(0,v.memo)(()=>{let{connectionStatus:e,lastUpdate:t,latency:n,quadrantDistribution:r}=F(),i=()=>{switch(e){case`CONNECTED`:return`status-bar__dot--connected`;case`DISCONNECTED`:return`status-bar__dot--disconnected`;case`RECONNECTING`:return`status-bar__dot--reconnecting`;default:return`status-bar__dot--disconnected`}},a=r?.leading||0,o=r?.weakening||0,s=r?.lagging||0,c=r?.improving||0,l=a+o+s+c,u=e=>l>0?Math.round(e/l*100):0;return(0,I.jsxs)(`div`,{className:`status-bar`,children:[(0,I.jsxs)(`div`,{className:`status-bar__left`,children:[(0,I.jsx)(`div`,{className:`status-bar__dot ${i()}`}),(0,I.jsx)(`span`,{className:`status-bar__connection`,children:e||`DISCONNECTED`})]}),(0,I.jsx)(`div`,{className:`status-bar__center`,children:e===`CONNECTED`&&(0,I.jsxs)(`span`,{className:`status-bar__live`,children:[(0,I.jsx)(`span`,{className:`status-bar__live-dot`}),` LIVE`]})}),(0,I.jsxs)(`div`,{className:`status-bar__right`,children:[(0,I.jsxs)(`div`,{className:`status-bar__info`,children:[`LAST UPDATE: `,t||`---`,` | LATENCY: `,n==null?`---`:`${n}ms`]}),(0,I.jsxs)(`div`,{className:`status-bar__breadth`,children:[(0,I.jsxs)(`span`,{style:{color:`var(--quadrant-leading-text, var(--quadrant-leading, #0f0))`},children:[`L:`,u(a),`%`]}),(0,I.jsxs)(`span`,{style:{color:`var(--quadrant-weakening-text, var(--quadrant-weakening, #ff0))`},children:[`W:`,u(o),`%`]}),(0,I.jsxs)(`span`,{style:{color:`var(--quadrant-lagging-text, var(--quadrant-lagging, #f00))`},children:[`I:`,u(s),`%`]}),(0,I.jsxs)(`span`,{style:{color:`var(--quadrant-improving-text, var(--quadrant-improving, #00f))`},children:[`G:`,u(c),`%`]})]})]})]})}),Kr=(0,v.memo)(()=>{let{selectedSector:e,hoveredSector:t,enrichedData:n}=F(),r=t||e,i=(0,v.useMemo)(()=>!r||!n?null:n.find(e=>e.symbol===r),[r,n]);if(!i)return(0,I.jsx)(`div`,{className:`metrics metrics__empty`,children:`Select a sector`});let a=e=>{switch(e?.toUpperCase()){case`LEADING`:return`var(--quadrant-leading-text, var(--quadrant-leading))`;case`WEAKENING`:return`var(--quadrant-weakening-text, var(--quadrant-weakening))`;case`LAGGING`:return`var(--quadrant-lagging-text, var(--quadrant-lagging))`;case`IMPROVING`:return`var(--quadrant-improving-text, var(--quadrant-improving))`;default:return`inherit`}},o=e=>e==null?`---`:e.toFixed(2);return(0,I.jsxs)(`div`,{className:`metrics`,children:[(0,I.jsxs)(`div`,{className:`metrics__header`,children:[`SECTOR: `,x(i.symbol)]}),(0,I.jsx)(`div`,{className:`metrics__divider`,children:`─────────────────`}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`RS-RATIO`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.x)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`RS-MOMENTUM`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.y)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`QUADRANT`}),(0,I.jsx)(`span`,{className:`metrics__value`,style:{color:a(i.quadrant)},children:i.quadrant?.toUpperCase()})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`VELOCITY`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.velocity)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`HEADING`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:i.heading||`---`})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`DISTANCE`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.distance)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`CURVATURE`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.curvature)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`MOM ROC`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.momentumRoc)})]}),(0,I.jsxs)(`div`,{className:`metrics__row`,children:[(0,I.jsx)(`span`,{className:`metrics__label`,children:`STRENGTH`}),(0,I.jsx)(`span`,{className:`metrics__value`,children:o(i.trendStrength)})]})]})}),qr=(0,v.memo)(()=>{let{enrichedData:e,selectedSector:t,setSelectedSector:n,hoveredSector:r,setHoveredSector:i}=F(),[a,o]=(0,v.useState)(`x`),[s,c]=(0,v.useState)(!0),l=e=>{a===e?c(!s):(o(e),c(!0))},u=(0,v.useMemo)(()=>e?[...e].sort((e,t)=>{let n=e[a],r=t[a];return a===`rank`&&(n=e.trendStrength||e.x||0,r=t.trendStrength||t.x||0),typeof n==`string`&&typeof r==`string`?s?r.localeCompare(n):n.localeCompare(r):s?r-n:n-r}):[],[e,a,s]),d=e=>a===e?s?`▼`:`▲`:``;return(0,I.jsxs)(`div`,{className:`ranking`,children:[(0,I.jsxs)(`div`,{className:`ranking__header`,children:[(0,I.jsx)(`div`,{className:`ranking__col ranking__col--num`,children:`#`}),(0,I.jsxs)(`div`,{className:`ranking__col ranking__col--sector`,onClick:()=>l(`symbol`),children:[`SECTOR `,d(`symbol`)]}),(0,I.jsxs)(`div`,{className:`ranking__col ranking__col--num`,onClick:()=>l(`x`),children:[`RS-R `,d(`x`)]}),(0,I.jsxs)(`div`,{className:`ranking__col ranking__col--num`,onClick:()=>l(`y`),children:[`MOM `,d(`y`)]}),(0,I.jsxs)(`div`,{className:`ranking__col ranking__col--num`,onClick:()=>l(`rank`),children:[`RANK `,d(`rank`)]})]}),(0,I.jsx)(`div`,{className:`ranking__body`,children:u.map((e,a)=>{let o=t===e.symbol,s=r===e.symbol;return(0,I.jsxs)(`div`,{className:`ranking__row ${o?`ranking__row--selected`:``} ${s&&!o?`ranking__row--hovered`:``}`,onClick:()=>n?.(e.symbol),onMouseEnter:()=>i?.(e.symbol),onMouseLeave:()=>i?.(null),children:[(0,I.jsx)(`div`,{className:`ranking__col ranking__col--num`,children:a+1}),(0,I.jsx)(`div`,{className:`ranking__col ranking__col--sector`,title:x(e.symbol),children:x(e.symbol)}),(0,I.jsx)(`div`,{className:`ranking__col ranking__col--num`,children:Number(e.x||0).toFixed(2)}),(0,I.jsx)(`div`,{className:`ranking__col ranking__col--num`,children:Number(e.y||0).toFixed(2)}),(0,I.jsx)(`div`,{className:`ranking__col ranking__col--num`,children:e.rank||a+1})]},e.symbol)})})]})});function Jr(e,t){return e==null||t==null?NaN:e<t?-1:e>t?1:e>=t?0:NaN}function Yr(e,t){return e==null||t==null?NaN:t<e?-1:t>e?1:t>=e?0:NaN}function Xr(e){let t,n,r;e.length===2?(t=e===Jr||e===Yr?e:Zr,n=e,r=e):(t=Jr,n=(t,n)=>Jr(e(t),n),r=(t,n)=>e(t)-n);function i(e,r,i=0,a=e.length){if(i<a){if(t(r,r)!==0)return a;do{let t=i+a>>>1;n(e[t],r)<0?i=t+1:a=t}while(i<a)}return i}function a(e,r,i=0,a=e.length){if(i<a){if(t(r,r)!==0)return a;do{let t=i+a>>>1;n(e[t],r)<=0?i=t+1:a=t}while(i<a)}return i}function o(e,t,n=0,a=e.length){let o=i(e,t,n,a-1);return o>n&&r(e[o-1],t)>-r(e[o],t)?o-1:o}return{left:i,center:o,right:a}}function Zr(){return 0}function Qr(e){return e===null?NaN:+e}var $r=Xr(Jr),ei=$r.right;$r.left,Xr(Qr).center;var ti=Math.sqrt(50),ni=Math.sqrt(10),ri=Math.sqrt(2);function ii(e,t,n){let r=(t-e)/Math.max(0,n),i=Math.floor(Math.log10(r)),a=r/10**i,o=a>=ti?10:a>=ni?5:a>=ri?2:1,s,c,l;return i<0?(l=10**-i/o,s=Math.round(e*l),c=Math.round(t*l),s/l<e&&++s,c/l>t&&--c,l=-l):(l=10**i*o,s=Math.round(e/l),c=Math.round(t/l),s*l<e&&++s,c*l>t&&--c),c<s&&.5<=n&&n<2?ii(e,t,n*2):[s,c,l]}function ai(e,t,n){if(t=+t,e=+e,n=+n,!(n>0))return[];if(e===t)return[e];let r=t<e,[i,a,o]=r?ii(t,e,n):ii(e,t,n);if(!(a>=i))return[];let s=a-i+1,c=Array(s);if(r)if(o<0)for(let e=0;e<s;++e)c[e]=(a-e)/-o;else for(let e=0;e<s;++e)c[e]=(a-e)*o;else if(o<0)for(let e=0;e<s;++e)c[e]=(i+e)/-o;else for(let e=0;e<s;++e)c[e]=(i+e)*o;return c}function oi(e,t,n){return t=+t,e=+e,n=+n,ii(e,t,n)[2]}function si(e,t,n){t=+t,e=+e,n=+n;let r=t<e,i=r?oi(t,e,n):oi(e,t,n);return(r?-1:1)*(i<0?1/-i:i)}var ci={value:()=>{}};function li(){for(var e=0,t=arguments.length,n={},r;e<t;++e){if(!(r=arguments[e]+``)||r in n||/[\s.]/.test(r))throw Error(`illegal type: `+r);n[r]=[]}return new ui(n)}function ui(e){this._=e}function di(e,t){return e.trim().split(/^|\s+/).map(function(e){var n=``,r=e.indexOf(`.`);if(r>=0&&(n=e.slice(r+1),e=e.slice(0,r)),e&&!t.hasOwnProperty(e))throw Error(`unknown type: `+e);return{type:e,name:n}})}ui.prototype=li.prototype={constructor:ui,on:function(e,t){var n=this._,r=di(e+``,n),i,a=-1,o=r.length;if(arguments.length<2){for(;++a<o;)if((i=(e=r[a]).type)&&(i=fi(n[i],e.name)))return i;return}if(t!=null&&typeof t!=`function`)throw Error(`invalid callback: `+t);for(;++a<o;)if(i=(e=r[a]).type)n[i]=pi(n[i],e.name,t);else if(t==null)for(i in n)n[i]=pi(n[i],e.name,null);return this},copy:function(){var e={},t=this._;for(var n in t)e[n]=t[n].slice();return new ui(e)},call:function(e,t){if((i=arguments.length-2)>0)for(var n=Array(i),r=0,i,a;r<i;++r)n[r]=arguments[r+2];if(!this._.hasOwnProperty(e))throw Error(`unknown type: `+e);for(a=this._[e],r=0,i=a.length;r<i;++r)a[r].value.apply(t,n)},apply:function(e,t,n){if(!this._.hasOwnProperty(e))throw Error(`unknown type: `+e);for(var r=this._[e],i=0,a=r.length;i<a;++i)r[i].value.apply(t,n)}};function fi(e,t){for(var n=0,r=e.length,i;n<r;++n)if((i=e[n]).name===t)return i.value}function pi(e,t,n){for(var r=0,i=e.length;r<i;++r)if(e[r].name===t){e[r]=ci,e=e.slice(0,r).concat(e.slice(r+1));break}return n!=null&&e.push({name:t,value:n}),e}var mi={svg:`http://www.w3.org/2000/svg`,xhtml:`http://www.w3.org/1999/xhtml`,xlink:`http://www.w3.org/1999/xlink`,xml:`http://www.w3.org/XML/1998/namespace`,xmlns:`http://www.w3.org/2000/xmlns/`};function hi(e){var t=e+=``,n=t.indexOf(`:`);return n>=0&&(t=e.slice(0,n))!==`xmlns`&&(e=e.slice(n+1)),mi.hasOwnProperty(t)?{space:mi[t],local:e}:e}function gi(e){return function(){var t=this.ownerDocument,n=this.namespaceURI;return n===`http://www.w3.org/1999/xhtml`&&t.documentElement.namespaceURI===`http://www.w3.org/1999/xhtml`?t.createElement(e):t.createElementNS(n,e)}}function _i(e){return function(){return this.ownerDocument.createElementNS(e.space,e.local)}}function vi(e){var t=hi(e);return(t.local?_i:gi)(t)}function yi(){}function bi(e){return e==null?yi:function(){return this.querySelector(e)}}function xi(e){typeof e!=`function`&&(e=bi(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=Array(o),c,l,u=0;u<o;++u)(c=a[u])&&(l=e.call(c,c.__data__,u,a))&&(`__data__`in c&&(l.__data__=c.__data__),s[u]=l);return new so(r,this._parents)}function Si(e){return e==null?[]:Array.isArray(e)?e:Array.from(e)}function Ci(){return[]}function wi(e){return e==null?Ci:function(){return this.querySelectorAll(e)}}function Ti(e){return function(){return Si(e.apply(this,arguments))}}function Ei(e){e=typeof e==`function`?Ti(e):wi(e);for(var t=this._groups,n=t.length,r=[],i=[],a=0;a<n;++a)for(var o=t[a],s=o.length,c,l=0;l<s;++l)(c=o[l])&&(r.push(e.call(c,c.__data__,l,o)),i.push(c));return new so(r,i)}function Di(e){return function(){return this.matches(e)}}function Oi(e){return function(t){return t.matches(e)}}var ki=Array.prototype.find;function Ai(e){return function(){return ki.call(this.children,e)}}function ji(){return this.firstElementChild}function Mi(e){return this.select(e==null?ji:Ai(typeof e==`function`?e:Oi(e)))}var Ni=Array.prototype.filter;function Pi(){return Array.from(this.children)}function Fi(e){return function(){return Ni.call(this.children,e)}}function L(e){return this.selectAll(e==null?Pi:Fi(typeof e==`function`?e:Oi(e)))}function R(e){typeof e!=`function`&&(e=Di(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=[],c,l=0;l<o;++l)(c=a[l])&&e.call(c,c.__data__,l,a)&&s.push(c);return new so(r,this._parents)}function Ii(e){return Array(e.length)}function Li(){return new so(this._enter||this._groups.map(Ii),this._parents)}function Ri(e,t){this.ownerDocument=e.ownerDocument,this.namespaceURI=e.namespaceURI,this._next=null,this._parent=e,this.__data__=t}Ri.prototype={constructor:Ri,appendChild:function(e){return this._parent.insertBefore(e,this._next)},insertBefore:function(e,t){return this._parent.insertBefore(e,t)},querySelector:function(e){return this._parent.querySelector(e)},querySelectorAll:function(e){return this._parent.querySelectorAll(e)}};function zi(e){return function(){return e}}function Bi(e,t,n,r,i,a){for(var o=0,s,c=t.length,l=a.length;o<l;++o)(s=t[o])?(s.__data__=a[o],r[o]=s):n[o]=new Ri(e,a[o]);for(;o<c;++o)(s=t[o])&&(i[o]=s)}function Vi(e,t,n,r,i,a,o){var s,c,l=new Map,u=t.length,d=a.length,f=Array(u),p;for(s=0;s<u;++s)(c=t[s])&&(f[s]=p=o.call(c,c.__data__,s,t)+``,l.has(p)?i[s]=c:l.set(p,c));for(s=0;s<d;++s)p=o.call(e,a[s],s,a)+``,(c=l.get(p))?(r[s]=c,c.__data__=a[s],l.delete(p)):n[s]=new Ri(e,a[s]);for(s=0;s<u;++s)(c=t[s])&&l.get(f[s])===c&&(i[s]=c)}function Hi(e){return e.__data__}function Ui(e,t){if(!arguments.length)return Array.from(this,Hi);var n=t?Vi:Bi,r=this._parents,i=this._groups;typeof e!=`function`&&(e=zi(e));for(var a=i.length,o=Array(a),s=Array(a),c=Array(a),l=0;l<a;++l){var u=r[l],d=i[l],f=d.length,p=Wi(e.call(u,u&&u.__data__,l,r)),m=p.length,h=s[l]=Array(m),g=o[l]=Array(m);n(u,d,h,g,c[l]=Array(f),p,t);for(var _=0,v=0,y,b;_<m;++_)if(y=h[_]){for(_>=v&&(v=_+1);!(b=g[v])&&++v<m;);y._next=b||null}}return o=new so(o,r),o._enter=s,o._exit=c,o}function Wi(e){return typeof e==`object`&&`length`in e?e:Array.from(e)}function Gi(){return new so(this._exit||this._groups.map(Ii),this._parents)}function Ki(e,t,n){var r=this.enter(),i=this,a=this.exit();return typeof e==`function`?(r=e(r),r&&=r.selection()):r=r.append(e+``),t!=null&&(i=t(i),i&&=i.selection()),n==null?a.remove():n(a),r&&i?r.merge(i).order():i}function qi(e){for(var t=e.selection?e.selection():e,n=this._groups,r=t._groups,i=n.length,a=r.length,o=Math.min(i,a),s=Array(i),c=0;c<o;++c)for(var l=n[c],u=r[c],d=l.length,f=s[c]=Array(d),p,m=0;m<d;++m)(p=l[m]||u[m])&&(f[m]=p);for(;c<i;++c)s[c]=n[c];return new so(s,this._parents)}function Ji(){for(var e=this._groups,t=-1,n=e.length;++t<n;)for(var r=e[t],i=r.length-1,a=r[i],o;--i>=0;)(o=r[i])&&(a&&o.compareDocumentPosition(a)^4&&a.parentNode.insertBefore(o,a),a=o);return this}function Yi(e){e||=Xi;function t(t,n){return t&&n?e(t.__data__,n.__data__):!t-!n}for(var n=this._groups,r=n.length,i=Array(r),a=0;a<r;++a){for(var o=n[a],s=o.length,c=i[a]=Array(s),l,u=0;u<s;++u)(l=o[u])&&(c[u]=l);c.sort(t)}return new so(i,this._parents).order()}function Xi(e,t){return e<t?-1:e>t?1:e>=t?0:NaN}function Zi(){var e=arguments[0];return arguments[0]=this,e.apply(null,arguments),this}function Qi(){return Array.from(this)}function $i(){for(var e=this._groups,t=0,n=e.length;t<n;++t)for(var r=e[t],i=0,a=r.length;i<a;++i){var o=r[i];if(o)return o}return null}function ea(){let e=0;for(let t of this)++e;return e}function ta(){return!this.node()}function na(e){for(var t=this._groups,n=0,r=t.length;n<r;++n)for(var i=t[n],a=0,o=i.length,s;a<o;++a)(s=i[a])&&e.call(s,s.__data__,a,i);return this}function ra(e){return function(){this.removeAttribute(e)}}function ia(e){return function(){this.removeAttributeNS(e.space,e.local)}}function aa(e,t){return function(){this.setAttribute(e,t)}}function oa(e,t){return function(){this.setAttributeNS(e.space,e.local,t)}}function sa(e,t){return function(){var n=t.apply(this,arguments);n==null?this.removeAttribute(e):this.setAttribute(e,n)}}function ca(e,t){return function(){var n=t.apply(this,arguments);n==null?this.removeAttributeNS(e.space,e.local):this.setAttributeNS(e.space,e.local,n)}}function la(e,t){var n=hi(e);if(arguments.length<2){var r=this.node();return n.local?r.getAttributeNS(n.space,n.local):r.getAttribute(n)}return this.each((t==null?n.local?ia:ra:typeof t==`function`?n.local?ca:sa:n.local?oa:aa)(n,t))}function ua(e){return e.ownerDocument&&e.ownerDocument.defaultView||e.document&&e||e.defaultView}function da(e){return function(){this.style.removeProperty(e)}}function fa(e,t,n){return function(){this.style.setProperty(e,t,n)}}function pa(e,t,n){return function(){var r=t.apply(this,arguments);r==null?this.style.removeProperty(e):this.style.setProperty(e,r,n)}}function ma(e,t,n){return arguments.length>1?this.each((t==null?da:typeof t==`function`?pa:fa)(e,t,n??``)):ha(this.node(),e)}function ha(e,t){return e.style.getPropertyValue(t)||ua(e).getComputedStyle(e,null).getPropertyValue(t)}function ga(e){return function(){delete this[e]}}function _a(e,t){return function(){this[e]=t}}function va(e,t){return function(){var n=t.apply(this,arguments);n==null?delete this[e]:this[e]=n}}function ya(e,t){return arguments.length>1?this.each((t==null?ga:typeof t==`function`?va:_a)(e,t)):this.node()[e]}function ba(e){return e.trim().split(/^|\s+/)}function xa(e){return e.classList||new Sa(e)}function Sa(e){this._node=e,this._names=ba(e.getAttribute(`class`)||``)}Sa.prototype={add:function(e){this._names.indexOf(e)<0&&(this._names.push(e),this._node.setAttribute(`class`,this._names.join(` `)))},remove:function(e){var t=this._names.indexOf(e);t>=0&&(this._names.splice(t,1),this._node.setAttribute(`class`,this._names.join(` `)))},contains:function(e){return this._names.indexOf(e)>=0}};function Ca(e,t){for(var n=xa(e),r=-1,i=t.length;++r<i;)n.add(t[r])}function wa(e,t){for(var n=xa(e),r=-1,i=t.length;++r<i;)n.remove(t[r])}function Ta(e){return function(){Ca(this,e)}}function Ea(e){return function(){wa(this,e)}}function Da(e,t){return function(){(t.apply(this,arguments)?Ca:wa)(this,e)}}function Oa(e,t){var n=ba(e+``);if(arguments.length<2){for(var r=xa(this.node()),i=-1,a=n.length;++i<a;)if(!r.contains(n[i]))return!1;return!0}return this.each((typeof t==`function`?Da:t?Ta:Ea)(n,t))}function ka(){this.textContent=``}function Aa(e){return function(){this.textContent=e}}function ja(e){return function(){var t=e.apply(this,arguments);this.textContent=t??``}}function Ma(e){return arguments.length?this.each(e==null?ka:(typeof e==`function`?ja:Aa)(e)):this.node().textContent}function Na(){this.innerHTML=``}function Pa(e){return function(){this.innerHTML=e}}function Fa(e){return function(){var t=e.apply(this,arguments);this.innerHTML=t??``}}function Ia(e){return arguments.length?this.each(e==null?Na:(typeof e==`function`?Fa:Pa)(e)):this.node().innerHTML}function La(){this.nextSibling&&this.parentNode.appendChild(this)}function Ra(){return this.each(La)}function za(){this.previousSibling&&this.parentNode.insertBefore(this,this.parentNode.firstChild)}function Ba(){return this.each(za)}function Va(e){var t=typeof e==`function`?e:vi(e);return this.select(function(){return this.appendChild(t.apply(this,arguments))})}function Ha(){return null}function Ua(e,t){var n=typeof e==`function`?e:vi(e),r=t==null?Ha:typeof t==`function`?t:bi(t);return this.select(function(){return this.insertBefore(n.apply(this,arguments),r.apply(this,arguments)||null)})}function Wa(){var e=this.parentNode;e&&e.removeChild(this)}function Ga(){return this.each(Wa)}function Ka(){var e=this.cloneNode(!1),t=this.parentNode;return t?t.insertBefore(e,this.nextSibling):e}function qa(){var e=this.cloneNode(!0),t=this.parentNode;return t?t.insertBefore(e,this.nextSibling):e}function Ja(e){return this.select(e?qa:Ka)}function Ya(e){return arguments.length?this.property(`__data__`,e):this.node().__data__}function Xa(e){return function(t){e.call(this,t,this.__data__)}}function Za(e){return e.trim().split(/^|\s+/).map(function(e){var t=``,n=e.indexOf(`.`);return n>=0&&(t=e.slice(n+1),e=e.slice(0,n)),{type:e,name:t}})}function Qa(e){return function(){var t=this.__on;if(t){for(var n=0,r=-1,i=t.length,a;n<i;++n)a=t[n],(!e.type||a.type===e.type)&&a.name===e.name?this.removeEventListener(a.type,a.listener,a.options):t[++r]=a;++r?t.length=r:delete this.__on}}}function $a(e,t,n){return function(){var r=this.__on,i,a=Xa(t);if(r){for(var o=0,s=r.length;o<s;++o)if((i=r[o]).type===e.type&&i.name===e.name){this.removeEventListener(i.type,i.listener,i.options),this.addEventListener(i.type,i.listener=a,i.options=n),i.value=t;return}}this.addEventListener(e.type,a,n),i={type:e.type,name:e.name,value:t,listener:a,options:n},r?r.push(i):this.__on=[i]}}function eo(e,t,n){var r=Za(e+``),i,a=r.length,o;if(arguments.length<2){var s=this.node().__on;if(s){for(var c=0,l=s.length,u;c<l;++c)for(i=0,u=s[c];i<a;++i)if((o=r[i]).type===u.type&&o.name===u.name)return u.value}return}for(s=t?$a:Qa,i=0;i<a;++i)this.each(s(r[i],t,n));return this}function to(e,t,n){var r=ua(e),i=r.CustomEvent;typeof i==`function`?i=new i(t,n):(i=r.document.createEvent(`Event`),n?(i.initEvent(t,n.bubbles,n.cancelable),i.detail=n.detail):i.initEvent(t,!1,!1)),e.dispatchEvent(i)}function no(e,t){return function(){return to(this,e,t)}}function ro(e,t){return function(){return to(this,e,t.apply(this,arguments))}}function io(e,t){return this.each((typeof t==`function`?ro:no)(e,t))}function*ao(){for(var e=this._groups,t=0,n=e.length;t<n;++t)for(var r=e[t],i=0,a=r.length,o;i<a;++i)(o=r[i])&&(yield o)}var oo=[null];function so(e,t){this._groups=e,this._parents=t}function co(){return new so([[document.documentElement]],oo)}function lo(){return this}so.prototype=co.prototype={constructor:so,select:xi,selectAll:Ei,selectChild:Mi,selectChildren:L,filter:R,data:Ui,enter:Li,exit:Gi,join:Ki,merge:qi,selection:lo,order:Ji,sort:Yi,call:Zi,nodes:Qi,node:$i,size:ea,empty:ta,each:na,attr:la,style:ma,property:ya,classed:Oa,text:Ma,html:Ia,raise:Ra,lower:Ba,append:Va,insert:Ua,remove:Ga,clone:Ja,datum:Ya,on:eo,dispatch:io,[Symbol.iterator]:ao};function uo(e,t,n){e.prototype=t.prototype=n,n.constructor=e}function fo(e,t){var n=Object.create(e.prototype);for(var r in t)n[r]=t[r];return n}function po(){}var mo=.7,z=1/mo,B=`\\s*([+-]?\\d+)\\s*`,V=`\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*`,ho=`\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*`,go=/^#([0-9a-f]{3,8})$/,_o=RegExp(`^rgb\\(${B},${B},${B}\\)$`),vo=RegExp(`^rgb\\(${ho},${ho},${ho}\\)$`),yo=RegExp(`^rgba\\(${B},${B},${B},${V}\\)$`),bo=RegExp(`^rgba\\(${ho},${ho},${ho},${V}\\)$`),xo=RegExp(`^hsl\\(${V},${ho},${ho}\\)$`),So=RegExp(`^hsla\\(${V},${ho},${ho},${V}\\)$`),Co={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074};uo(po,Oo,{copy(e){return Object.assign(new this.constructor,this,e)},displayable(){return this.rgb().displayable()},hex:wo,formatHex:wo,formatHex8:To,formatHsl:Eo,formatRgb:Do,toString:Do});function wo(){return this.rgb().formatHex()}function To(){return this.rgb().formatHex8()}function Eo(){return Bo(this).formatHsl()}function Do(){return this.rgb().formatRgb()}function Oo(e){var t,n;return e=(e+``).trim().toLowerCase(),(t=go.exec(e))?(n=t[1].length,t=parseInt(t[1],16),n===6?ko(t):n===3?new Mo(t>>8&15|t>>4&240,t>>4&15|t&240,(t&15)<<4|t&15,1):n===8?Ao(t>>24&255,t>>16&255,t>>8&255,(t&255)/255):n===4?Ao(t>>12&15|t>>8&240,t>>8&15|t>>4&240,t>>4&15|t&240,((t&15)<<4|t&15)/255):null):(t=_o.exec(e))?new Mo(t[1],t[2],t[3],1):(t=vo.exec(e))?new Mo(t[1]*255/100,t[2]*255/100,t[3]*255/100,1):(t=yo.exec(e))?Ao(t[1],t[2],t[3],t[4]):(t=bo.exec(e))?Ao(t[1]*255/100,t[2]*255/100,t[3]*255/100,t[4]):(t=xo.exec(e))?zo(t[1],t[2]/100,t[3]/100,1):(t=So.exec(e))?zo(t[1],t[2]/100,t[3]/100,t[4]):Co.hasOwnProperty(e)?ko(Co[e]):e===`transparent`?new Mo(NaN,NaN,NaN,0):null}function ko(e){return new Mo(e>>16&255,e>>8&255,e&255,1)}function Ao(e,t,n,r){return r<=0&&(e=t=n=NaN),new Mo(e,t,n,r)}function jo(e){return e instanceof po||(e=Oo(e)),e?(e=e.rgb(),new Mo(e.r,e.g,e.b,e.opacity)):new Mo}function H(e,t,n,r){return arguments.length===1?jo(e):new Mo(e,t,n,r??1)}function Mo(e,t,n,r){this.r=+e,this.g=+t,this.b=+n,this.opacity=+r}uo(Mo,H,fo(po,{brighter(e){return e=e==null?z:z**+e,new Mo(this.r*e,this.g*e,this.b*e,this.opacity)},darker(e){return e=e==null?mo:mo**+e,new Mo(this.r*e,this.g*e,this.b*e,this.opacity)},rgb(){return this},clamp(){return new Mo(Lo(this.r),Lo(this.g),Lo(this.b),Io(this.opacity))},displayable(){return-.5<=this.r&&this.r<255.5&&-.5<=this.g&&this.g<255.5&&-.5<=this.b&&this.b<255.5&&0<=this.opacity&&this.opacity<=1},hex:No,formatHex:No,formatHex8:Po,formatRgb:Fo,toString:Fo}));function No(){return`#${Ro(this.r)}${Ro(this.g)}${Ro(this.b)}`}function Po(){return`#${Ro(this.r)}${Ro(this.g)}${Ro(this.b)}${Ro((isNaN(this.opacity)?1:this.opacity)*255)}`}function Fo(){let e=Io(this.opacity);return`${e===1?`rgb(`:`rgba(`}${Lo(this.r)}, ${Lo(this.g)}, ${Lo(this.b)}${e===1?`)`:`, ${e})`}`}function Io(e){return isNaN(e)?1:Math.max(0,Math.min(1,e))}function Lo(e){return Math.max(0,Math.min(255,Math.round(e)||0))}function Ro(e){return e=Lo(e),(e<16?`0`:``)+e.toString(16)}function zo(e,t,n,r){return r<=0?e=t=n=NaN:n<=0||n>=1?e=t=NaN:t<=0&&(e=NaN),new Ho(e,t,n,r)}function Bo(e){if(e instanceof Ho)return new Ho(e.h,e.s,e.l,e.opacity);if(e instanceof po||(e=Oo(e)),!e)return new Ho;if(e instanceof Ho)return e;e=e.rgb();var t=e.r/255,n=e.g/255,r=e.b/255,i=Math.min(t,n,r),a=Math.max(t,n,r),o=NaN,s=a-i,c=(a+i)/2;return s?(o=t===a?(n-r)/s+(n<r)*6:n===a?(r-t)/s+2:(t-n)/s+4,s/=c<.5?a+i:2-a-i,o*=60):s=c>0&&c<1?0:o,new Ho(o,s,c,e.opacity)}function Vo(e,t,n,r){return arguments.length===1?Bo(e):new Ho(e,t,n,r??1)}function Ho(e,t,n,r){this.h=+e,this.s=+t,this.l=+n,this.opacity=+r}uo(Ho,Vo,fo(po,{brighter(e){return e=e==null?z:z**+e,new Ho(this.h,this.s,this.l*e,this.opacity)},darker(e){return e=e==null?mo:mo**+e,new Ho(this.h,this.s,this.l*e,this.opacity)},rgb(){var e=this.h%360+(this.h<0)*360,t=isNaN(e)||isNaN(this.s)?0:this.s,n=this.l,r=n+(n<.5?n:1-n)*t,i=2*n-r;return new Mo(Go(e>=240?e-240:e+120,i,r),Go(e,i,r),Go(e<120?e+240:e-120,i,r),this.opacity)},clamp(){return new Ho(Uo(this.h),Wo(this.s),Wo(this.l),Io(this.opacity))},displayable(){return(0<=this.s&&this.s<=1||isNaN(this.s))&&0<=this.l&&this.l<=1&&0<=this.opacity&&this.opacity<=1},formatHsl(){let e=Io(this.opacity);return`${e===1?`hsl(`:`hsla(`}${Uo(this.h)}, ${Wo(this.s)*100}%, ${Wo(this.l)*100}%${e===1?`)`:`, ${e})`}`}}));function Uo(e){return e=(e||0)%360,e<0?e+360:e}function Wo(e){return Math.max(0,Math.min(1,e||0))}function Go(e,t,n){return(e<60?t+(n-t)*e/60:e<180?n:e<240?t+(n-t)*(240-e)/60:t)*255}var Ko=e=>()=>e;function qo(e,t){return function(n){return e+n*t}}function Jo(e,t,n){return e**=+n,t=t**+n-e,n=1/n,function(r){return(e+r*t)**+n}}function Yo(e){return(e=+e)==1?Xo:function(t,n){return n-t?Jo(t,n,e):Ko(isNaN(t)?n:t)}}function Xo(e,t){var n=t-e;return n?qo(e,n):Ko(isNaN(e)?t:e)}var Zo=(function e(t){var n=Yo(t);function r(e,t){var r=n((e=H(e)).r,(t=H(t)).r),i=n(e.g,t.g),a=n(e.b,t.b),o=Xo(e.opacity,t.opacity);return function(t){return e.r=r(t),e.g=i(t),e.b=a(t),e.opacity=o(t),e+``}}return r.gamma=e,r})(1);function Qo(e,t){t||=[];var n=e?Math.min(t.length,e.length):0,r=t.slice(),i;return function(a){for(i=0;i<n;++i)r[i]=e[i]*(1-a)+t[i]*a;return r}}function $o(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function es(e,t){var n=t?t.length:0,r=e?Math.min(n,e.length):0,i=Array(r),a=Array(n),o;for(o=0;o<r;++o)i[o]=ls(e[o],t[o]);for(;o<n;++o)a[o]=t[o];return function(e){for(o=0;o<r;++o)a[o]=i[o](e);return a}}function ts(e,t){var n=new Date;return e=+e,t=+t,function(r){return n.setTime(e*(1-r)+t*r),n}}function ns(e,t){return e=+e,t=+t,function(n){return e*(1-n)+t*n}}function rs(e,t){var n={},r={},i;for(i in(typeof e!=`object`||!e)&&(e={}),(typeof t!=`object`||!t)&&(t={}),t)i in e?n[i]=ls(e[i],t[i]):r[i]=t[i];return function(e){for(i in n)r[i]=n[i](e);return r}}var is=/[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,as=new RegExp(is.source,`g`);function os(e){return function(){return e}}function ss(e){return function(t){return e(t)+``}}function cs(e,t){var n=is.lastIndex=as.lastIndex=0,r,i,a,o=-1,s=[],c=[];for(e+=``,t+=``;(r=is.exec(e))&&(i=as.exec(t));)(a=i.index)>n&&(a=t.slice(n,a),s[o]?s[o]+=a:s[++o]=a),(r=r[0])===(i=i[0])?s[o]?s[o]+=i:s[++o]=i:(s[++o]=null,c.push({i:o,x:ns(r,i)})),n=as.lastIndex;return n<t.length&&(a=t.slice(n),s[o]?s[o]+=a:s[++o]=a),s.length<2?c[0]?ss(c[0].x):os(t):(t=c.length,function(e){for(var n=0,r;n<t;++n)s[(r=c[n]).i]=r.x(e);return s.join(``)})}function ls(e,t){var n=typeof t,r;return t==null||n===`boolean`?Ko(t):(n===`number`?ns:n===`string`?(r=Oo(t))?(t=r,Zo):cs:t instanceof Oo?Zo:t instanceof Date?ts:$o(t)?Qo:Array.isArray(t)?es:typeof t.valueOf!=`function`&&typeof t.toString!=`function`||isNaN(t)?rs:ns)(e,t)}function us(e,t){return e=+e,t=+t,function(n){return Math.round(e*(1-n)+t*n)}}var ds=180/Math.PI,fs={translateX:0,translateY:0,rotate:0,skewX:0,scaleX:1,scaleY:1};function ps(e,t,n,r,i,a){var o,s,c;return(o=Math.sqrt(e*e+t*t))&&(e/=o,t/=o),(c=e*n+t*r)&&(n-=e*c,r-=t*c),(s=Math.sqrt(n*n+r*r))&&(n/=s,r/=s,c/=s),e*r<t*n&&(e=-e,t=-t,c=-c,o=-o),{translateX:i,translateY:a,rotate:Math.atan2(t,e)*ds,skewX:Math.atan(c)*ds,scaleX:o,scaleY:s}}var ms;function hs(e){let t=new(typeof DOMMatrix==`function`?DOMMatrix:WebKitCSSMatrix)(e+``);return t.isIdentity?fs:ps(t.a,t.b,t.c,t.d,t.e,t.f)}function gs(e){return e==null||(ms||=document.createElementNS(`http://www.w3.org/2000/svg`,`g`),ms.setAttribute(`transform`,e),!(e=ms.transform.baseVal.consolidate()))?fs:(e=e.matrix,ps(e.a,e.b,e.c,e.d,e.e,e.f))}function _s(e,t,n,r){function i(e){return e.length?e.pop()+` `:``}function a(e,r,i,a,o,s){if(e!==i||r!==a){var c=o.push(`translate(`,null,t,null,n);s.push({i:c-4,x:ns(e,i)},{i:c-2,x:ns(r,a)})}else (i||a)&&o.push(`translate(`+i+t+a+n)}function o(e,t,n,a){e===t?t&&n.push(i(n)+`rotate(`+t+r):(e-t>180?t+=360:t-e>180&&(e+=360),a.push({i:n.push(i(n)+`rotate(`,null,r)-2,x:ns(e,t)}))}function s(e,t,n,a){e===t?t&&n.push(i(n)+`skewX(`+t+r):a.push({i:n.push(i(n)+`skewX(`,null,r)-2,x:ns(e,t)})}function c(e,t,n,r,a,o){if(e!==n||t!==r){var s=a.push(i(a)+`scale(`,null,`,`,null,`)`);o.push({i:s-4,x:ns(e,n)},{i:s-2,x:ns(t,r)})}else (n!==1||r!==1)&&a.push(i(a)+`scale(`+n+`,`+r+`)`)}return function(t,n){var r=[],i=[];return t=e(t),n=e(n),a(t.translateX,t.translateY,n.translateX,n.translateY,r,i),o(t.rotate,n.rotate,r,i),s(t.skewX,n.skewX,r,i),c(t.scaleX,t.scaleY,n.scaleX,n.scaleY,r,i),t=n=null,function(e){for(var t=-1,n=i.length,a;++t<n;)r[(a=i[t]).i]=a.x(e);return r.join(``)}}}var vs=_s(hs,`px, `,`px)`,`deg)`),ys=_s(gs,`, `,`)`,`)`),bs=0,xs=0,Ss=0,Cs=1e3,ws,Ts,Es=0,Ds=0,Os=0,ks=typeof performance==`object`&&performance.now?performance:Date,As=typeof window==`object`&&window.requestAnimationFrame?window.requestAnimationFrame.bind(window):function(e){setTimeout(e,17)};function js(){return Ds||=(As(Ms),ks.now()+Os)}function Ms(){Ds=0}function Ns(){this._call=this._time=this._next=null}Ns.prototype=Ps.prototype={constructor:Ns,restart:function(e,t,n){if(typeof e!=`function`)throw TypeError(`callback is not a function`);n=(n==null?js():+n)+(t==null?0:+t),!this._next&&Ts!==this&&(Ts?Ts._next=this:ws=this,Ts=this),this._call=e,this._time=n,zs()},stop:function(){this._call&&(this._call=null,this._time=1/0,zs())}};function Ps(e,t,n){var r=new Ns;return r.restart(e,t,n),r}function Fs(){js(),++bs;for(var e=ws,t;e;)(t=Ds-e._time)>=0&&e._call.call(void 0,t),e=e._next;--bs}function Is(){Ds=(Es=ks.now())+Os,bs=xs=0;try{Fs()}finally{bs=0,Rs(),Ds=0}}function Ls(){var e=ks.now(),t=e-Es;t>Cs&&(Os-=t,Es=e)}function Rs(){for(var e,t=ws,n,r=1/0;t;)t._call?(r>t._time&&(r=t._time),e=t,t=t._next):(n=t._next,t._next=null,t=e?e._next=n:ws=n);Ts=e,zs(r)}function zs(e){bs||(xs&&=clearTimeout(xs),e-Ds>24?(e<1/0&&(xs=setTimeout(Is,e-ks.now()-Os)),Ss&&=clearInterval(Ss)):(Ss||=(Es=ks.now(),setInterval(Ls,Cs)),bs=1,As(Is)))}function Bs(e,t,n){var r=new Ns;return t=t==null?0:+t,r.restart(n=>{r.stop(),e(n+t)},t,n),r}var Vs=li(`start`,`end`,`cancel`,`interrupt`),Hs=[];function Us(e,t,n,r,i,a){var o=e.__transition;if(!o)e.__transition={};else if(n in o)return;qs(e,n,{name:t,index:r,group:i,on:Vs,tween:Hs,time:a.time,delay:a.delay,duration:a.duration,ease:a.ease,timer:null,state:0})}function Ws(e,t){var n=Ks(e,t);if(n.state>0)throw Error(`too late; already scheduled`);return n}function Gs(e,t){var n=Ks(e,t);if(n.state>3)throw Error(`too late; already running`);return n}function Ks(e,t){var n=e.__transition;if(!n||!(n=n[t]))throw Error(`transition not found`);return n}function qs(e,t,n){var r=e.__transition,i;r[t]=n,n.timer=Ps(a,0,n.time);function a(e){n.state=1,n.timer.restart(o,n.delay,n.time),n.delay<=e&&o(e-n.delay)}function o(a){var l,u,d,f;if(n.state!==1)return c();for(l in r)if(f=r[l],f.name===n.name){if(f.state===3)return Bs(o);f.state===4?(f.state=6,f.timer.stop(),f.on.call(`interrupt`,e,e.__data__,f.index,f.group),delete r[l]):+l<t&&(f.state=6,f.timer.stop(),f.on.call(`cancel`,e,e.__data__,f.index,f.group),delete r[l])}if(Bs(function(){n.state===3&&(n.state=4,n.timer.restart(s,n.delay,n.time),s(a))}),n.state=2,n.on.call(`start`,e,e.__data__,n.index,n.group),n.state===2){for(n.state=3,i=Array(d=n.tween.length),l=0,u=-1;l<d;++l)(f=n.tween[l].value.call(e,e.__data__,n.index,n.group))&&(i[++u]=f);i.length=u+1}}function s(t){for(var r=t<n.duration?n.ease.call(null,t/n.duration):(n.timer.restart(c),n.state=5,1),a=-1,o=i.length;++a<o;)i[a].call(e,r);n.state===5&&(n.on.call(`end`,e,e.__data__,n.index,n.group),c())}function c(){for(var i in n.state=6,n.timer.stop(),delete r[t],r)return;delete e.__transition}}function Js(e,t){var n=e.__transition,r,i,a=!0,o;if(n){for(o in t=t==null?null:t+``,n){if((r=n[o]).name!==t){a=!1;continue}i=r.state>2&&r.state<5,r.state=6,r.timer.stop(),r.on.call(i?`interrupt`:`cancel`,e,e.__data__,r.index,r.group),delete n[o]}a&&delete e.__transition}}function Ys(e){return this.each(function(){Js(this,e)})}function Xs(e,t){var n,r;return function(){var i=Gs(this,e),a=i.tween;if(a!==n){r=n=a;for(var o=0,s=r.length;o<s;++o)if(r[o].name===t){r=r.slice(),r.splice(o,1);break}}i.tween=r}}function Zs(e,t,n){var r,i;if(typeof n!=`function`)throw Error();return function(){var a=Gs(this,e),o=a.tween;if(o!==r){i=(r=o).slice();for(var s={name:t,value:n},c=0,l=i.length;c<l;++c)if(i[c].name===t){i[c]=s;break}c===l&&i.push(s)}a.tween=i}}function Qs(e,t){var n=this._id;if(e+=``,arguments.length<2){for(var r=Ks(this.node(),n).tween,i=0,a=r.length,o;i<a;++i)if((o=r[i]).name===e)return o.value;return null}return this.each((t==null?Xs:Zs)(n,e,t))}function $s(e,t,n){var r=e._id;return e.each(function(){var e=Gs(this,r);(e.value||={})[t]=n.apply(this,arguments)}),function(e){return Ks(e,r).value[t]}}function ec(e,t){var n;return(typeof t==`number`?ns:t instanceof Oo?Zo:(n=Oo(t))?(t=n,Zo):cs)(e,t)}function tc(e){return function(){this.removeAttribute(e)}}function nc(e){return function(){this.removeAttributeNS(e.space,e.local)}}function rc(e,t,n){var r,i=n+``,a;return function(){var o=this.getAttribute(e);return o===i?null:o===r?a:a=t(r=o,n)}}function ic(e,t,n){var r,i=n+``,a;return function(){var o=this.getAttributeNS(e.space,e.local);return o===i?null:o===r?a:a=t(r=o,n)}}function ac(e,t,n){var r,i,a;return function(){var o,s=n(this),c;return s==null?void this.removeAttribute(e):(o=this.getAttribute(e),c=s+``,o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s)))}}function oc(e,t,n){var r,i,a;return function(){var o,s=n(this),c;return s==null?void this.removeAttributeNS(e.space,e.local):(o=this.getAttributeNS(e.space,e.local),c=s+``,o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s)))}}function sc(e,t){var n=hi(e),r=n===`transform`?ys:ec;return this.attrTween(e,typeof t==`function`?(n.local?oc:ac)(n,r,$s(this,`attr.`+e,t)):t==null?(n.local?nc:tc)(n):(n.local?ic:rc)(n,r,t))}function cc(e,t){return function(n){this.setAttribute(e,t.call(this,n))}}function lc(e,t){return function(n){this.setAttributeNS(e.space,e.local,t.call(this,n))}}function uc(e,t){var n,r;function i(){var i=t.apply(this,arguments);return i!==r&&(n=(r=i)&&lc(e,i)),n}return i._value=t,i}function dc(e,t){var n,r;function i(){var i=t.apply(this,arguments);return i!==r&&(n=(r=i)&&cc(e,i)),n}return i._value=t,i}function fc(e,t){var n=`attr.`+e;if(arguments.length<2)return(n=this.tween(n))&&n._value;if(t==null)return this.tween(n,null);if(typeof t!=`function`)throw Error();var r=hi(e);return this.tween(n,(r.local?uc:dc)(r,t))}function pc(e,t){return function(){Ws(this,e).delay=+t.apply(this,arguments)}}function mc(e,t){return t=+t,function(){Ws(this,e).delay=t}}function hc(e){var t=this._id;return arguments.length?this.each((typeof e==`function`?pc:mc)(t,e)):Ks(this.node(),t).delay}function gc(e,t){return function(){Gs(this,e).duration=+t.apply(this,arguments)}}function _c(e,t){return t=+t,function(){Gs(this,e).duration=t}}function vc(e){var t=this._id;return arguments.length?this.each((typeof e==`function`?gc:_c)(t,e)):Ks(this.node(),t).duration}function yc(e,t){if(typeof t!=`function`)throw Error();return function(){Gs(this,e).ease=t}}function bc(e){var t=this._id;return arguments.length?this.each(yc(t,e)):Ks(this.node(),t).ease}function xc(e,t){return function(){var n=t.apply(this,arguments);if(typeof n!=`function`)throw Error();Gs(this,e).ease=n}}function Sc(e){if(typeof e!=`function`)throw Error();return this.each(xc(this._id,e))}function Cc(e){typeof e!=`function`&&(e=Di(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=[],c,l=0;l<o;++l)(c=a[l])&&e.call(c,c.__data__,l,a)&&s.push(c);return new Zc(r,this._parents,this._name,this._id)}function wc(e){if(e._id!==this._id)throw Error();for(var t=this._groups,n=e._groups,r=t.length,i=n.length,a=Math.min(r,i),o=Array(r),s=0;s<a;++s)for(var c=t[s],l=n[s],u=c.length,d=o[s]=Array(u),f,p=0;p<u;++p)(f=c[p]||l[p])&&(d[p]=f);for(;s<r;++s)o[s]=t[s];return new Zc(o,this._parents,this._name,this._id)}function Tc(e){return(e+``).trim().split(/^|\s+/).every(function(e){var t=e.indexOf(`.`);return t>=0&&(e=e.slice(0,t)),!e||e===`start`})}function Ec(e,t,n){var r,i,a=Tc(t)?Ws:Gs;return function(){var o=a(this,e),s=o.on;s!==r&&(i=(r=s).copy()).on(t,n),o.on=i}}function Dc(e,t){var n=this._id;return arguments.length<2?Ks(this.node(),n).on.on(e):this.each(Ec(n,e,t))}function Oc(e){return function(){var t=this.parentNode;for(var n in this.__transition)if(+n!==e)return;t&&t.removeChild(this)}}function kc(){return this.on(`end.remove`,Oc(this._id))}function Ac(e){var t=this._name,n=this._id;typeof e!=`function`&&(e=bi(e));for(var r=this._groups,i=r.length,a=Array(i),o=0;o<i;++o)for(var s=r[o],c=s.length,l=a[o]=Array(c),u,d,f=0;f<c;++f)(u=s[f])&&(d=e.call(u,u.__data__,f,s))&&(`__data__`in u&&(d.__data__=u.__data__),l[f]=d,Us(l[f],t,n,f,l,Ks(u,n)));return new Zc(a,this._parents,t,n)}function jc(e){var t=this._name,n=this._id;typeof e!=`function`&&(e=wi(e));for(var r=this._groups,i=r.length,a=[],o=[],s=0;s<i;++s)for(var c=r[s],l=c.length,u,d=0;d<l;++d)if(u=c[d]){for(var f=e.call(u,u.__data__,d,c),p,m=Ks(u,n),h=0,g=f.length;h<g;++h)(p=f[h])&&Us(p,t,n,h,f,m);a.push(f),o.push(u)}return new Zc(a,o,t,n)}var Mc=co.prototype.constructor;function Nc(){return new Mc(this._groups,this._parents)}function Pc(e,t){var n,r,i;return function(){var a=ha(this,e),o=(this.style.removeProperty(e),ha(this,e));return a===o?null:a===n&&o===r?i:i=t(n=a,r=o)}}function Fc(e){return function(){this.style.removeProperty(e)}}function Ic(e,t,n){var r,i=n+``,a;return function(){var o=ha(this,e);return o===i?null:o===r?a:a=t(r=o,n)}}function Lc(e,t,n){var r,i,a;return function(){var o=ha(this,e),s=n(this),c=s+``;return s??(c=s=(this.style.removeProperty(e),ha(this,e))),o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s))}}function Rc(e,t){var n,r,i,a=`style.`+t,o=`end.`+a,s;return function(){var c=Gs(this,e),l=c.on,u=c.value[a]==null?s||=Fc(t):void 0;(l!==n||i!==u)&&(r=(n=l).copy()).on(o,i=u),c.on=r}}function U(e,t,n){var r=(e+=``)==`transform`?vs:ec;return t==null?this.styleTween(e,Pc(e,r)).on(`end.style.`+e,Fc(e)):typeof t==`function`?this.styleTween(e,Lc(e,r,$s(this,`style.`+e,t))).each(Rc(this._id,e)):this.styleTween(e,Ic(e,r,t),n).on(`end.style.`+e,null)}function zc(e,t,n){return function(r){this.style.setProperty(e,t.call(this,r),n)}}function Bc(e,t,n){var r,i;function a(){var a=t.apply(this,arguments);return a!==i&&(r=(i=a)&&zc(e,a,n)),r}return a._value=t,a}function Vc(e,t,n){var r=`style.`+(e+=``);if(arguments.length<2)return(r=this.tween(r))&&r._value;if(t==null)return this.tween(r,null);if(typeof t!=`function`)throw Error();return this.tween(r,Bc(e,t,n??``))}function Hc(e){return function(){this.textContent=e}}function Uc(e){return function(){var t=e(this);this.textContent=t??``}}function Wc(e){return this.tween(`text`,typeof e==`function`?Uc($s(this,`text`,e)):Hc(e==null?``:e+``))}function Gc(e){return function(t){this.textContent=e.call(this,t)}}function Kc(e){var t,n;function r(){var r=e.apply(this,arguments);return r!==n&&(t=(n=r)&&Gc(r)),t}return r._value=e,r}function qc(e){var t=`text`;if(arguments.length<1)return(t=this.tween(t))&&t._value;if(e==null)return this.tween(t,null);if(typeof e!=`function`)throw Error();return this.tween(t,Kc(e))}function Jc(){for(var e=this._name,t=this._id,n=$c(),r=this._groups,i=r.length,a=0;a<i;++a)for(var o=r[a],s=o.length,c,l=0;l<s;++l)if(c=o[l]){var u=Ks(c,t);Us(c,e,n,l,o,{time:u.time+u.delay+u.duration,delay:0,duration:u.duration,ease:u.ease})}return new Zc(r,this._parents,e,n)}function Yc(){var e,t,n=this,r=n._id,i=n.size();return new Promise(function(a,o){var s={value:o},c={value:function(){--i===0&&a()}};n.each(function(){var n=Gs(this,r),i=n.on;i!==e&&(t=(e=i).copy(),t._.cancel.push(s),t._.interrupt.push(s),t._.end.push(c)),n.on=t}),i===0&&a()})}var Xc=0;function Zc(e,t,n,r){this._groups=e,this._parents=t,this._name=n,this._id=r}function Qc(e){return co().transition(e)}function $c(){return++Xc}var el=co.prototype;Zc.prototype=Qc.prototype={constructor:Zc,select:Ac,selectAll:jc,selectChild:el.selectChild,selectChildren:el.selectChildren,filter:Cc,merge:wc,selection:Nc,transition:Jc,call:el.call,nodes:el.nodes,node:el.node,size:el.size,empty:el.empty,each:el.each,on:Dc,attr:sc,attrTween:fc,style:U,styleTween:Vc,text:Wc,textTween:qc,remove:kc,tween:Qs,delay:hc,duration:vc,ease:bc,easeVarying:Sc,end:Yc,[Symbol.iterator]:el[Symbol.iterator]};function tl(e){return((e*=2)<=1?e*e*e:(e-=2)*e*e+2)/2}var nl={time:null,delay:0,duration:250,ease:tl};function rl(e,t){for(var n;!(n=e.__transition)||!(n=n[t]);)if(!(e=e.parentNode))throw Error(`transition ${t} not found`);return n}function il(e){var t,n;e instanceof Zc?(t=e._id,e=e._name):(t=$c(),(n=nl).time=js(),e=e==null?null:e+``);for(var r=this._groups,i=r.length,a=0;a<i;++a)for(var o=r[a],s=o.length,c,l=0;l<s;++l)(c=o[l])&&Us(c,e,t,l,o,n||rl(c,t));return new Zc(r,this._parents,e,t)}co.prototype.interrupt=Ys,co.prototype.transition=il;var{abs:al,max:ol,min:sl}=Math;[`w`,`e`].map(cl),[`n`,`s`].map(cl),[`n`,`w`,`e`,`s`,`nw`,`ne`,`sw`,`se`].map(cl);function cl(e){return{type:e}}var W=Math.PI,ll=2*W,ul=1e-6,dl=ll-ul;function fl(e){this._+=e[0];for(let t=1,n=e.length;t<n;++t)this._+=arguments[t]+e[t]}function pl(e){let t=Math.floor(e);if(!(t>=0))throw Error(`invalid digits: ${e}`);if(t>15)return fl;let n=10**t;return function(e){this._+=e[0];for(let t=1,r=e.length;t<r;++t)this._+=Math.round(arguments[t]*n)/n+e[t]}}var ml=class{constructor(e){this._x0=this._y0=this._x1=this._y1=null,this._=``,this._append=e==null?fl:pl(e)}moveTo(e,t){this._append`M${this._x0=this._x1=+e},${this._y0=this._y1=+t}`}closePath(){this._x1!==null&&(this._x1=this._x0,this._y1=this._y0,this._append`Z`)}lineTo(e,t){this._append`L${this._x1=+e},${this._y1=+t}`}quadraticCurveTo(e,t,n,r){this._append`Q${+e},${+t},${this._x1=+n},${this._y1=+r}`}bezierCurveTo(e,t,n,r,i,a){this._append`C${+e},${+t},${+n},${+r},${this._x1=+i},${this._y1=+a}`}arcTo(e,t,n,r,i){if(e=+e,t=+t,n=+n,r=+r,i=+i,i<0)throw Error(`negative radius: ${i}`);let a=this._x1,o=this._y1,s=n-e,c=r-t,l=a-e,u=o-t,d=l*l+u*u;if(this._x1===null)this._append`M${this._x1=e},${this._y1=t}`;else if(d>ul)if(!(Math.abs(u*s-c*l)>ul)||!i)this._append`L${this._x1=e},${this._y1=t}`;else{let f=n-a,p=r-o,m=s*s+c*c,h=f*f+p*p,g=Math.sqrt(m),_=Math.sqrt(d),v=i*Math.tan((W-Math.acos((m+d-h)/(2*g*_)))/2),y=v/_,b=v/g;Math.abs(y-1)>ul&&this._append`L${e+y*l},${t+y*u}`,this._append`A${i},${i},0,0,${+(u*f>l*p)},${this._x1=e+b*s},${this._y1=t+b*c}`}}arc(e,t,n,r,i,a){if(e=+e,t=+t,n=+n,a=!!a,n<0)throw Error(`negative radius: ${n}`);let o=n*Math.cos(r),s=n*Math.sin(r),c=e+o,l=t+s,u=1^a,d=a?r-i:i-r;this._x1===null?this._append`M${c},${l}`:(Math.abs(this._x1-c)>ul||Math.abs(this._y1-l)>ul)&&this._append`L${c},${l}`,n&&(d<0&&(d=d%ll+ll),d>dl?this._append`A${n},${n},0,1,${u},${e-o},${t-s}A${n},${n},0,1,${u},${this._x1=c},${this._y1=l}`:d>ul&&this._append`A${n},${n},0,${+(d>=W)},${u},${this._x1=e+n*Math.cos(i)},${this._y1=t+n*Math.sin(i)}`)}rect(e,t,n,r){this._append`M${this._x0=this._x1=+e},${this._y0=this._y1=+t}h${n=+n}v${+r}h${-n}Z`}toString(){return this._}};function hl(){return new ml}hl.prototype=ml.prototype;function gl(e){return Math.abs(e=Math.round(e))>=1e21?e.toLocaleString(`en`).replace(/,/g,``):e.toString(10)}function _l(e,t){if(!isFinite(e)||e===0)return null;var n=(e=t?e.toExponential(t-1):e.toExponential()).indexOf(`e`),r=e.slice(0,n);return[r.length>1?r[0]+r.slice(2):r,+e.slice(n+1)]}function vl(e){return e=_l(Math.abs(e)),e?e[1]:NaN}function yl(e,t){return function(n,r){for(var i=n.length,a=[],o=0,s=e[0],c=0;i>0&&s>0&&(c+s+1>r&&(s=Math.max(1,r-c)),a.push(n.substring(i-=s,i+s)),!((c+=s+1)>r));)s=e[o=(o+1)%e.length];return a.reverse().join(t)}}function bl(e){return function(t){return t.replace(/[0-9]/g,function(t){return e[+t]})}}var xl=/^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;function Sl(e){if(!(t=xl.exec(e)))throw Error(`invalid format: `+e);var t;return new Cl({fill:t[1],align:t[2],sign:t[3],symbol:t[4],zero:t[5],width:t[6],comma:t[7],precision:t[8]&&t[8].slice(1),trim:t[9],type:t[10]})}Sl.prototype=Cl.prototype;function Cl(e){this.fill=e.fill===void 0?` `:e.fill+``,this.align=e.align===void 0?`>`:e.align+``,this.sign=e.sign===void 0?`-`:e.sign+``,this.symbol=e.symbol===void 0?``:e.symbol+``,this.zero=!!e.zero,this.width=e.width===void 0?void 0:+e.width,this.comma=!!e.comma,this.precision=e.precision===void 0?void 0:+e.precision,this.trim=!!e.trim,this.type=e.type===void 0?``:e.type+``}Cl.prototype.toString=function(){return this.fill+this.align+this.sign+this.symbol+(this.zero?`0`:``)+(this.width===void 0?``:Math.max(1,this.width|0))+(this.comma?`,`:``)+(this.precision===void 0?``:`.`+Math.max(0,this.precision|0))+(this.trim?`~`:``)+this.type};function wl(e){out:for(var t=e.length,n=1,r=-1,i;n<t;++n)switch(e[n]){case`.`:r=i=n;break;case`0`:r===0&&(r=n),i=n;break;default:if(!+e[n])break out;r>0&&(r=0);break}return r>0?e.slice(0,r)+e.slice(i+1):e}var Tl;function El(e,t){var n=_l(e,t);if(!n)return Tl=void 0,e.toPrecision(t);var r=n[0],i=n[1],a=i-(Tl=Math.max(-8,Math.min(8,Math.floor(i/3)))*3)+1,o=r.length;return a===o?r:a>o?r+Array(a-o+1).join(`0`):a>0?r.slice(0,a)+`.`+r.slice(a):`0.`+Array(1-a).join(`0`)+_l(e,Math.max(0,t+a-1))[0]}function Dl(e,t){var n=_l(e,t);if(!n)return e+``;var r=n[0],i=n[1];return i<0?`0.`+Array(-i).join(`0`)+r:r.length>i+1?r.slice(0,i+1)+`.`+r.slice(i+1):r+Array(i-r.length+2).join(`0`)}var Ol={"%":(e,t)=>(e*100).toFixed(t),b:e=>Math.round(e).toString(2),c:e=>e+``,d:gl,e:(e,t)=>e.toExponential(t),f:(e,t)=>e.toFixed(t),g:(e,t)=>e.toPrecision(t),o:e=>Math.round(e).toString(8),p:(e,t)=>Dl(e*100,t),r:Dl,s:El,X:e=>Math.round(e).toString(16).toUpperCase(),x:e=>Math.round(e).toString(16)};function kl(e){return e}var Al=Array.prototype.map,jl=[`y`,`z`,`a`,`f`,`p`,`n`,`µ`,`m`,``,`k`,`M`,`G`,`T`,`P`,`E`,`Z`,`Y`];function Ml(e){var t=e.grouping===void 0||e.thousands===void 0?kl:yl(Al.call(e.grouping,Number),e.thousands+``),n=e.currency===void 0?``:e.currency[0]+``,r=e.currency===void 0?``:e.currency[1]+``,i=e.decimal===void 0?`.`:e.decimal+``,a=e.numerals===void 0?kl:bl(Al.call(e.numerals,String)),o=e.percent===void 0?`%`:e.percent+``,s=e.minus===void 0?`−`:e.minus+``,c=e.nan===void 0?`NaN`:e.nan+``;function l(e,l){e=Sl(e);var u=e.fill,d=e.align,f=e.sign,p=e.symbol,m=e.zero,h=e.width,g=e.comma,_=e.precision,v=e.trim,y=e.type;y===`n`?(g=!0,y=`g`):Ol[y]||(_===void 0&&(_=12),v=!0,y=`g`),(m||u===`0`&&d===`=`)&&(m=!0,u=`0`,d=`=`);var b=(l&&l.prefix!==void 0?l.prefix:``)+(p===`$`?n:p===`#`&&/[boxX]/.test(y)?`0`+y.toLowerCase():``),x=(p===`$`?r:/[%p]/.test(y)?o:``)+(l&&l.suffix!==void 0?l.suffix:``),S=Ol[y],C=/[defgprs%]/.test(y);_=_===void 0?6:/[gprs]/.test(y)?Math.max(1,Math.min(21,_)):Math.max(0,Math.min(20,_));function w(e){var n=b,r=x,o,l,p;if(y===`c`)r=S(e)+r,e=``;else{e=+e;var w=e<0||1/e<0;if(e=isNaN(e)?c:S(Math.abs(e),_),v&&(e=wl(e)),w&&+e==0&&f!==`+`&&(w=!1),n=(w?f===`(`?f:s:f===`-`||f===`(`?``:f)+n,r=(y===`s`&&!isNaN(e)&&Tl!==void 0?jl[8+Tl/3]:``)+r+(w&&f===`(`?`)`:``),C){for(o=-1,l=e.length;++o<l;)if(p=e.charCodeAt(o),48>p||p>57){r=(p===46?i+e.slice(o+1):e.slice(o))+r,e=e.slice(0,o);break}}}g&&!m&&(e=t(e,1/0));var ee=n.length+e.length+r.length,T=ee<h?Array(h-ee+1).join(u):``;switch(g&&m&&(e=t(T+e,T.length?h-r.length:1/0),T=``),d){case`<`:e=n+e+r+T;break;case`=`:e=n+T+e+r;break;case`^`:e=T.slice(0,ee=T.length>>1)+n+e+r+T.slice(ee);break;default:e=T+n+e+r;break}return a(e)}return w.toString=function(){return e+``},w}function u(e,t){var n=Math.max(-8,Math.min(8,Math.floor(vl(t)/3)))*3,r=10**-n,i=l((e=Sl(e),e.type=`f`,e),{suffix:jl[8+n/3]});return function(e){return i(r*e)}}return{format:l,formatPrefix:u}}var Nl,Pl,Fl;Il({thousands:`,`,grouping:[3],currency:[`$`,``]});function Il(e){return Nl=Ml(e),Pl=Nl.format,Fl=Nl.formatPrefix,Nl}function Ll(e){return Math.max(0,-vl(Math.abs(e)))}function Rl(e,t){return Math.max(0,Math.max(-8,Math.min(8,Math.floor(vl(t)/3)))*3-vl(Math.abs(e)))}function zl(e,t){return e=Math.abs(e),t=Math.abs(t)-e,Math.max(0,vl(t)-vl(e))+1}function G(e,t){switch(arguments.length){case 0:break;case 1:this.range(e);break;default:this.range(t).domain(e);break}return this}function K(e){return function(){return e}}function q(e){return+e}var J=[0,1];function Y(e){return e}function Bl(e,t){return(t-=e=+e)?function(n){return(n-e)/t}:K(isNaN(t)?NaN:.5)}function Vl(e,t){var n;return e>t&&(n=e,e=t,t=n),function(n){return Math.max(e,Math.min(t,n))}}function Hl(e,t,n){var r=e[0],i=e[1],a=t[0],o=t[1];return i<r?(r=Bl(i,r),a=n(o,a)):(r=Bl(r,i),a=n(a,o)),function(e){return a(r(e))}}function Ul(e,t,n){var r=Math.min(e.length,t.length)-1,i=Array(r),a=Array(r),o=-1;for(e[r]<e[0]&&(e=e.slice().reverse(),t=t.slice().reverse());++o<r;)i[o]=Bl(e[o],e[o+1]),a[o]=n(t[o],t[o+1]);return function(t){var n=ei(e,t,1,r)-1;return a[n](i[n](t))}}function Wl(e,t){return t.domain(e.domain()).range(e.range()).interpolate(e.interpolate()).clamp(e.clamp()).unknown(e.unknown())}function Gl(){var e=J,t=J,n=ls,r,i,a,o=Y,s,c,l;function u(){var n=Math.min(e.length,t.length);return o!==Y&&(o=Vl(e[0],e[n-1])),s=n>2?Ul:Hl,c=l=null,d}function d(i){return i==null||isNaN(i=+i)?a:(c||=s(e.map(r),t,n))(r(o(i)))}return d.invert=function(n){return o(i((l||=s(t,e.map(r),ns))(n)))},d.domain=function(t){return arguments.length?(e=Array.from(t,q),u()):e.slice()},d.range=function(e){return arguments.length?(t=Array.from(e),u()):t.slice()},d.rangeRound=function(e){return t=Array.from(e),n=us,u()},d.clamp=function(e){return arguments.length?(o=e?!0:Y,u()):o!==Y},d.interpolate=function(e){return arguments.length?(n=e,u()):n},d.unknown=function(e){return arguments.length?(a=e,d):a},function(e,t){return r=e,i=t,u()}}function Kl(){return Gl()(Y,Y)}function ql(e,t,n,r){var i=si(e,t,n),a;switch(r=Sl(r??`,f`),r.type){case`s`:var o=Math.max(Math.abs(e),Math.abs(t));return r.precision==null&&!isNaN(a=Rl(i,o))&&(r.precision=a),Fl(r,o);case``:case`e`:case`g`:case`p`:case`r`:r.precision==null&&!isNaN(a=zl(i,Math.max(Math.abs(e),Math.abs(t))))&&(r.precision=a-(r.type===`e`));break;case`f`:case`%`:r.precision==null&&!isNaN(a=Ll(i))&&(r.precision=a-(r.type===`%`)*2);break}return Pl(r)}function Jl(e){var t=e.domain;return e.ticks=function(e){var n=t();return ai(n[0],n[n.length-1],e??10)},e.tickFormat=function(e,n){var r=t();return ql(r[0],r[r.length-1],e??10,n)},e.nice=function(n){n??=10;var r=t(),i=0,a=r.length-1,o=r[i],s=r[a],c,l,u=10;for(s<o&&(l=o,o=s,s=l,l=i,i=a,a=l);u-- >0;){if(l=oi(o,s,n),l===c)return r[i]=o,r[a]=s,t(r);if(l>0)o=Math.floor(o/l)*l,s=Math.ceil(s/l)*l;else if(l<0)o=Math.ceil(o*l)/l,s=Math.floor(s*l)/l;else break;c=l}return e},e}function Yl(){var e=Kl();return e.copy=function(){return Wl(e,Yl())},G.apply(e,arguments),Jl(e)}function Xl(e){return function(){return e}}function Zl(e){let t=3;return e.digits=function(n){if(!arguments.length)return t;if(n==null)t=null;else{let e=Math.floor(n);if(!(e>=0))throw RangeError(`invalid digits: ${n}`);t=e}return e},()=>new ml(t)}Array.prototype.slice;function Ql(e){return typeof e==`object`&&`length`in e?e:Array.from(e)}function $l(e){this._context=e}$l.prototype={areaStart:function(){this._line=0},areaEnd:function(){this._line=NaN},lineStart:function(){this._point=0},lineEnd:function(){(this._line||this._line!==0&&this._point===1)&&this._context.closePath(),this._line=1-this._line},point:function(e,t){switch(e=+e,t=+t,this._point){case 0:this._point=1,this._line?this._context.lineTo(e,t):this._context.moveTo(e,t);break;case 1:this._point=2;default:this._context.lineTo(e,t);break}}};function eu(e){return new $l(e)}function tu(e){return e[0]}function nu(e){return e[1]}function ru(e,t){var n=Xl(!0),r=null,i=eu,a=null,o=Zl(s);e=typeof e==`function`?e:e===void 0?tu:Xl(e),t=typeof t==`function`?t:t===void 0?nu:Xl(t);function s(s){var c,l=(s=Ql(s)).length,u,d=!1,f;for(r??(a=i(f=o())),c=0;c<=l;++c)!(c<l&&n(u=s[c],c,s))===d&&((d=!d)?a.lineStart():a.lineEnd()),d&&a.point(+e(u,c,s),+t(u,c,s));if(f)return a=null,f+``||null}return s.x=function(t){return arguments.length?(e=typeof t==`function`?t:Xl(+t),s):e},s.y=function(e){return arguments.length?(t=typeof e==`function`?e:Xl(+e),s):t},s.defined=function(e){return arguments.length?(n=typeof e==`function`?e:Xl(!!e),s):n},s.curve=function(e){return arguments.length?(i=e,r!=null&&(a=i(r)),s):i},s.context=function(e){return arguments.length?(e==null?r=a=null:a=i(r=e),s):r},s}function iu(e,t,n){e._context.bezierCurveTo(e._x1+e._k*(e._x2-e._x0),e._y1+e._k*(e._y2-e._y0),e._x2+e._k*(e._x1-t),e._y2+e._k*(e._y1-n),e._x2,e._y2)}function au(e,t){this._context=e,this._k=(1-t)/6}au.prototype={areaStart:function(){this._line=0},areaEnd:function(){this._line=NaN},lineStart:function(){this._x0=this._x1=this._x2=this._y0=this._y1=this._y2=NaN,this._point=0},lineEnd:function(){switch(this._point){case 2:this._context.lineTo(this._x2,this._y2);break;case 3:iu(this,this._x1,this._y1);break}(this._line||this._line!==0&&this._point===1)&&this._context.closePath(),this._line=1-this._line},point:function(e,t){switch(e=+e,t=+t,this._point){case 0:this._point=1,this._line?this._context.lineTo(e,t):this._context.moveTo(e,t);break;case 1:this._point=2,this._x1=e,this._y1=t;break;case 2:this._point=3;default:iu(this,e,t);break}this._x0=this._x1,this._x1=this._x2,this._x2=e,this._y0=this._y1,this._y1=this._y2,this._y2=t}};var ou=(function e(t){function n(e){return new au(e,t)}return n.tension=function(t){return e(+t)},n})(0);function su(e,t,n){this.k=e,this.x=t,this.y=n}su.prototype={constructor:su,scale:function(e){return e===1?this:new su(this.k*e,this.x,this.y)},translate:function(e,t){return e===0&t===0?this:new su(this.k,this.x+this.k*e,this.y+this.k*t)},apply:function(e){return[e[0]*this.k+this.x,e[1]*this.k+this.y]},applyX:function(e){return e*this.k+this.x},applyY:function(e){return e*this.k+this.y},invert:function(e){return[(e[0]-this.x)/this.k,(e[1]-this.y)/this.k]},invertX:function(e){return(e-this.x)/this.k},invertY:function(e){return(e-this.y)/this.k},rescaleX:function(e){return e.copy().domain(e.range().map(this.invertX,this).map(e.invert,e))},rescaleY:function(e){return e.copy().domain(e.range().map(this.invertY,this).map(e.invert,e))},toString:function(){return`translate(`+this.x+`,`+this.y+`) scale(`+this.k+`)`}};var cu=new su(1,0,0);lu.prototype=su.prototype;function lu(e){for(;!e.__zoom;)if(!(e=e.parentNode))return cu;return e.__zoom}function uu(e,t,n,r=100){return{xScale:Yl().domain(e).range([0,n.innerWidth]),yScale:Yl().domain(t).range([n.innerHeight,0]),center:r}}function du(e,t,n=.125){if(e.length===0)return{xDomain:[0,100],yDomain:[0,100],step:1};let r=Math.min(...e),i=Math.max(...e),a=Math.min(...t),o=Math.max(...t),s=Math.max(i-r,.001),c=Math.max(o-a,.001),l=Math.max(s,c),u=10**Math.floor(Math.log10(l)),d=l/u,f=u;f=d<=2?.2*u:d<=5?.5*u:1*u;let p=Math.max(s*n,f*.5),m=Math.max(c*n,f*.5),h=Math.floor((r-p)/f)*f,g=Math.ceil((i+p)/f)*f,_=Math.floor((a-m)/f)*f,v=Math.ceil((o+m)/f)*f;return{xDomain:[h,g],yDomain:[_,v],step:f}}function fu(e,t){let n=[],r=Math.ceil(e[0]/t)*t,i=2;t<.1&&(i=3),t<.01&&(i=4),t<.001&&(i=5);let a=10**i;for(let i=r;i<=e[1]+t*.1;i+=t)n.push(Math.round(i*a)/a);return n}var pu=D((e,t)=>({targetFitZoom:1,targetFitOffsetX:0,targetFitOffsetY:0,targetInteractionZoom:1,targetInteractionOffsetX:0,targetInteractionOffsetY:0,contentBounds:null,viewportWidth:800,viewportHeight:600,plotWidth:800,plotHeight:600,isDragging:!1,dragStartX:0,dragStartY:0,setDimensions:(t,n,r,i)=>{e({viewportWidth:t,viewportHeight:n,plotWidth:r,plotHeight:i})},setContentBounds:n=>{let r=t(),i=r.contentBounds;if(i){let e=Math.abs(n.domainWidth-i.domainWidth)/i.domainWidth,t=Math.abs(n.domainHeight-i.domainHeight)/i.domainHeight;if(e<.05&&t<.05)return}let{plotWidth:a,plotHeight:o}=r;a<=0||o<=0||!Number.isFinite(a)||!Number.isFinite(o)||e({contentBounds:n,targetFitZoom:1,targetFitOffsetX:0,targetFitOffsetY:0})},zoomBy:(n,r,i)=>{let a=t(),o=Math.exp(-n*.0015),s=a.targetInteractionZoom*o;s=Math.max(1,s);let{targetFitZoom:c,targetFitOffsetX:l,targetFitOffsetY:u,targetInteractionZoom:d,targetInteractionOffsetX:f,targetInteractionOffsetY:p}=a,m=(r-l)/c,h=(i-u)/c,g=(m-f)/d,_=(h-p)/d,v=m-g*s,y=h-_*s;s===1&&(v=0,y=0),e({targetInteractionZoom:s,targetInteractionOffsetX:v,targetInteractionOffsetY:y})},panBy:(n,r)=>{let i=t();e({targetInteractionOffsetX:i.targetInteractionOffsetX+n/i.targetFitZoom,targetInteractionOffsetY:i.targetInteractionOffsetY+r/i.targetFitZoom})},startDrag:(t,n)=>{e({isDragging:!0,dragStartX:t,dragStartY:n})},updateDrag:(n,r)=>{let i=t();if(!i.isDragging)return;let a=n-i.dragStartX,o=r-i.dragStartY;e({targetInteractionOffsetX:i.targetInteractionOffsetX+a/i.targetFitZoom,targetInteractionOffsetY:i.targetInteractionOffsetY+o/i.targetFitZoom,dragStartX:n,dragStartY:r})},endDrag:()=>{e({isDragging:!1})},resetToFit:()=>{e({targetInteractionZoom:1,targetInteractionOffsetX:0,targetInteractionOffsetY:0})},screenToWorld:(e,t,n,r,i,a,o,s)=>({x:((e-r)/n-o)/a,y:((t-i)/n-s)/a})})),mu=e=>Symbol.iterator in e,hu=e=>`entries`in e,gu=(e,t)=>{let n=e instanceof Map?e:new Map(e.entries()),r=t instanceof Map?t:new Map(t.entries());if(n.size!==r.size)return!1;for(let[e,t]of n)if(!r.has(e)||!Object.is(t,r.get(e)))return!1;return!0},_u=(e,t)=>{let n=e[Symbol.iterator](),r=t[Symbol.iterator](),i=n.next(),a=r.next();for(;!i.done&&!a.done;){if(!Object.is(i.value,a.value))return!1;i=n.next(),a=r.next()}return!!i.done&&!!a.done};function vu(e,t){return Object.is(e,t)?!0:typeof e!=`object`||!e||typeof t!=`object`||!t||Object.getPrototypeOf(e)!==Object.getPrototypeOf(t)?!1:mu(e)&&mu(t)?hu(e)&&hu(t)?gu(e,t):_u(e,t):gu({entries:()=>Object.entries(e)},{entries:()=>Object.entries(t)})}function yu(e){let t=v.useRef(void 0);return n=>{let r=e(n);return vu(t.current,r)?t.current:t.current=r}}var X={bg:{primary:`#000000`,secondary:`#050505`,panel:`#0B0B0B`,command:`#111111`},border:{primary:`#1F1F1F`,grid:`#1E1E1E`,gridMajor:`#2A2A2A`},text:{primary:`#E0E0E0`,secondary:`#909090`,muted:`#606060`,label:`#707070`},accent:{orange:`#FF9900`,orangeDim:`rgba(255,153,0,0.3)`},quadrant:{leading:{bg:`#0D5C2A`,text:`#2ECC71`},weakening:{bg:`#8A7A00`,text:`#F1C40F`},lagging:{bg:`#5A120F`,text:`#E74C3C`},improving:{bg:`#0B3D5A`,text:`#3498DB`}},axis:{center:`#707070`}};function bu(e){return{LEADING:X.quadrant.leading,WEAKENING:X.quadrant.weakening,LAGGING:X.quadrant.lagging,IMPROVING:X.quadrant.improving}[e]}var xu=v.memo(({scales:e,xDomain:t,yDomain:n,step:r})=>{let i=(0,v.useMemo)(()=>fu(t,r/2),[t,r]),a=(0,v.useMemo)(()=>fu(t,r),[t,r]),o=(0,v.useMemo)(()=>fu(n,r/2),[n,r]),s=(0,v.useMemo)(()=>fu(n,r),[n,r]);return(0,I.jsxs)(`g`,{className:`grid-layer`,children:[i.map(t=>(0,I.jsx)(`line`,{x1:e.xScale(t),x2:e.xScale(t),y1:-5e3,y2:5e3,stroke:`rgba(255,255,255,0.04)`,strokeWidth:.5,vectorEffect:`non-scaling-stroke`},`minor-x-${t}`)),o.map(t=>(0,I.jsx)(`line`,{x1:-5e3,x2:5e3,y1:e.yScale(t),y2:e.yScale(t),stroke:`rgba(255,255,255,0.04)`,strokeWidth:.5,vectorEffect:`non-scaling-stroke`},`minor-y-${t}`)),a.map(t=>(0,I.jsx)(`line`,{x1:e.xScale(t),x2:e.xScale(t),y1:-5e3,y2:5e3,stroke:`rgba(255,255,255,0.10)`,strokeWidth:1,vectorEffect:`non-scaling-stroke`},`major-x-${t}`)),s.map(t=>(0,I.jsx)(`line`,{x1:-5e3,x2:5e3,y1:e.yScale(t),y2:e.yScale(t),stroke:`rgba(255,255,255,0.10)`,strokeWidth:1,vectorEffect:`non-scaling-stroke`},`major-y-${t}`))]})}),Su=v.memo(({scales:e})=>{let t=e.xScale(e.center),n=e.yScale(e.center),r=1e4;return(0,I.jsxs)(`g`,{className:`quadrant-backgrounds`,children:[(0,I.jsxs)(`defs`,{children:[(0,I.jsxs)(`radialGradient`,{id:`grad-leading`,cx:`0%`,cy:`100%`,r:`100%`,children:[(0,I.jsx)(`stop`,{offset:`0%`,stopColor:X.quadrant.leading.bg,stopOpacity:.15}),(0,I.jsx)(`stop`,{offset:`100%`,stopColor:X.quadrant.leading.bg,stopOpacity:0})]}),(0,I.jsxs)(`radialGradient`,{id:`grad-weakening`,cx:`0%`,cy:`0%`,r:`100%`,children:[(0,I.jsx)(`stop`,{offset:`0%`,stopColor:X.quadrant.weakening.bg,stopOpacity:.15}),(0,I.jsx)(`stop`,{offset:`100%`,stopColor:X.quadrant.weakening.bg,stopOpacity:0})]}),(0,I.jsxs)(`radialGradient`,{id:`grad-lagging`,cx:`100%`,cy:`0%`,r:`100%`,children:[(0,I.jsx)(`stop`,{offset:`0%`,stopColor:X.quadrant.lagging.bg,stopOpacity:.15}),(0,I.jsx)(`stop`,{offset:`100%`,stopColor:X.quadrant.lagging.bg,stopOpacity:0})]}),(0,I.jsxs)(`radialGradient`,{id:`grad-improving`,cx:`100%`,cy:`100%`,r:`100%`,children:[(0,I.jsx)(`stop`,{offset:`0%`,stopColor:X.quadrant.improving.bg,stopOpacity:.15}),(0,I.jsx)(`stop`,{offset:`100%`,stopColor:X.quadrant.improving.bg,stopOpacity:0})]})]}),(0,I.jsx)(`rect`,{x:t,y:n-r,width:r,height:r,fill:`url(#grad-leading)`}),(0,I.jsx)(`rect`,{x:t,y:n,width:r,height:r,fill:`url(#grad-weakening)`}),(0,I.jsx)(`rect`,{x:t-r,y:n,width:r,height:r,fill:`url(#grad-lagging)`}),(0,I.jsx)(`rect`,{x:t-r,y:n-r,width:r,height:r,fill:`url(#grad-improving)`})]})}),Cu=v.memo(({dims:e})=>{let{innerWidth:t,innerHeight:n}=e;return(0,I.jsxs)(`g`,{className:`quadrant-labels`,children:[(0,I.jsx)(`text`,{x:t-20,y:40,fontSize:30,fontWeight:700,opacity:.22,letterSpacing:2,fill:`#1b6f38`,textAnchor:`end`,children:`LEADING`}),(0,I.jsx)(`text`,{x:t-20,y:n-20,fontSize:30,fontWeight:700,opacity:.22,letterSpacing:2,fill:`#7f6900`,textAnchor:`end`,children:`WEAKENING`}),(0,I.jsx)(`text`,{x:20,y:n-20,fontSize:30,fontWeight:700,opacity:.22,letterSpacing:2,fill:`#6a1511`,textAnchor:`start`,children:`LAGGING`}),(0,I.jsx)(`text`,{x:20,y:40,fontSize:30,fontWeight:700,opacity:.22,letterSpacing:2,fill:`#0f4663`,textAnchor:`start`,children:`IMPROVING`})]})}),wu=v.memo(({scales:e})=>{let t=e.xScale(e.center),n=e.yScale(e.center),r=1e4;return(0,I.jsxs)(`g`,{className:`crosshair-center-layer`,children:[(0,I.jsx)(`line`,{x1:t-r,x2:t+r,y1:n,y2:n,stroke:`#707070`,strokeWidth:1.5,strokeDasharray:`6,4`,vectorEffect:`non-scaling-stroke`}),(0,I.jsx)(`line`,{x1:t,x2:t,y1:n-r,y2:n+r,stroke:`#707070`,strokeWidth:1.5,strokeDasharray:`6,4`,vectorEffect:`non-scaling-stroke`})]})}),Tu=v.memo(({scales:e,dims:t})=>{let n=(0,v.useMemo)(()=>e.xScale.ticks(8),[e.xScale]),r=(0,v.useMemo)(()=>e.yScale.ticks(8),[e.yScale]);return(0,I.jsxs)(`g`,{className:`axis-layer`,children:[n.map(n=>(0,I.jsxs)(`g`,{transform:`translate(${e.xScale(n)}, 0)`,children:[(0,I.jsx)(`line`,{y1:t.innerHeight,y2:t.innerHeight+4,stroke:`#444`,strokeWidth:1}),(0,I.jsx)(`text`,{x:0,y:t.innerHeight+14,textAnchor:`middle`,fontSize:9,fill:`#7a5c22`,fontFamily:`'IBM Plex Mono', monospace`,fontWeight:500,children:n.toFixed(1)})]},`xt-${n}`)),r.map(t=>(0,I.jsxs)(`g`,{transform:`translate(0, ${e.yScale(t)})`,children:[(0,I.jsx)(`line`,{x1:-4,x2:0,stroke:`#444`,strokeWidth:1}),(0,I.jsx)(`text`,{x:-8,y:0,textAnchor:`end`,dominantBaseline:`middle`,fontSize:9,fill:`#7a5c22`,fontFamily:`'IBM Plex Mono', monospace`,fontWeight:500,children:t.toFixed(1)})]},`yt-${t}`)),(0,I.jsxs)(`text`,{x:t.innerWidth/2,y:t.innerHeight+32,textAnchor:`middle`,fontSize:10,fill:`#606060`,fontFamily:`'IBM Plex Mono', monospace`,fontWeight:600,letterSpacing:2,style:{cursor:`help`},children:[(0,I.jsx)(`title`,{children:`RS-Ratio: Measures relative performance against the benchmark. Values > 100 indicate outperformance, while < 100 indicate underperformance.`}),`RS-RATIO`]}),(0,I.jsxs)(`text`,{x:-t.innerHeight/2,y:-40,textAnchor:`middle`,fontSize:10,fill:`#606060`,fontFamily:`'IBM Plex Mono', monospace`,fontWeight:600,letterSpacing:2,transform:`rotate(-90)`,style:{cursor:`help`},children:[(0,I.jsx)(`title`,{children:`RS-Momentum: Measures the momentum (rate of change) of the RS-Ratio. Values > 100 indicate accelerating momentum, while < 100 indicate decelerating momentum.`}),`RS-MOMENTUM`]})]})});function Eu(e,t=.5){return e.length<2?``:ru().x(e=>e.x).y(e=>e.y).curve(ou.tension(t))(e)||``}function Du(e){return e<=1?[1]:Array.from({length:e},(t,n)=>.2+.8*(n/(e-1)))}function Ou(e){return e<=1?[2]:Array.from({length:e},(t,n)=>1+1.5*(n/(e-1)))}var ku=(e,t,n=100)=>e>=n&&t>=n?`LEADING`:e>=n&&t<n?`WEAKENING`:e<n&&t<n?`LAGGING`:`IMPROVING`,Au=v.memo(({d:e,scales:t,timeframe:n,isSelected:r,isHovered:i,isFaded:a,isStressed:o,zoom:s})=>{let c=Cr(e=>e.semanticZoom),l=`intraday`;try{l=Or(n).timeframeScaleClass}catch{}let u=!0;c&&(l===`ultra_intraday`&&s<2||l===`intraday`&&s<1.2)&&!r&&!i&&(u=!1);let d=o,f=Math.max(.1,s),p=(0,v.useMemo)(()=>{let n=e.trail;d&&!r&&!i&&(n=n.filter((e,t)=>t%2==0||t===n.length-1));let a=n.map(e=>({x:t.xScale(e.x),y:t.yScale(e.y),quadrant:ku(e.x,e.y,t.center)})),o=n[n.length-1];o&&(o.x!==e.x||o.y!==e.y)&&a.push({x:t.xScale(e.x),y:t.yScale(e.y),quadrant:ku(e.x,e.y,t.center)});let s=Du(a.length),c=Ou(a.length);return a.slice(0,a.length-1).map((e,t)=>{let n=a[t+1];return{key:`segment-${t}`,pathD:Eu([e,n]),segmentColor:bu(n.quadrant).text,width:c[t]||1.5,opacity:s[t]||.5,nextQuadrant:n.quadrant}})},[e,t,n,r,i,d]);if(!p)return null;let m=e.computedAt?Date.now()-e.computedAt:0,h=.3;e.stale&&(h=m>6e5?.15:m>12e4?.2:.25);let g=.3;return g=a?.15:r||i?1:h,(0,I.jsx)(`g`,{opacity:g,onMouseEnter:()=>e.setHoveredSector?.(e.symbol),onMouseLeave:()=>e.setHoveredSector?.(null),style:{cursor:`pointer`},children:p.map(e=>{let t=(i?e.width*1.5:e.width)/f;return(0,I.jsx)(`path`,{d:e.pathD,stroke:e.segmentColor,strokeWidth:t,strokeOpacity:e.opacity,fill:`none`,markerEnd:u?`url(#arrowhead-${e.nextQuadrant})`:void 0,style:r||i?{filter:`url(#glow)`,pointerEvents:`stroke`}:{pointerEvents:`stroke`}},e.key)})})}),ju=v.memo(({data:e,scales:t,showTrail:n,selectedSector:r,hoveredSector:i,zoom:a,isStressed:o,setHoveredSector:s})=>{let c=jr(e=>e.timeframe);return n?(0,I.jsx)(`g`,{className:`trail-layer`,children:e.map(e=>{if(!e.trail||e.trail.length<2)return null;let n=r===e.symbol,l=i===e.symbol,u=!!(r||i)&&!n&&!l;return(0,I.jsx)(Au,{d:{...e,setHoveredSector:s},scales:t,timeframe:c,isSelected:n,isHovered:l,isFaded:u,zoom:a,isStressed:o},`trail-${e.symbol}`)})}):null}),Mu=v.memo(({data:e,scales:t,selectedSector:n,hoveredSector:r,zoom:i,setHoveredSector:a})=>{let o=Math.max(.1,i);return(0,I.jsx)(`g`,{className:`point-layer`,children:e.map(e=>{let i=t.xScale(e.x),s=t.yScale(e.y),c=n===e.symbol,l=r===e.symbol,u=(n||r)&&!c&&!l,d=(c||l?8:6)/o,f=d/2,p=bu(e.quadrant).text,m=e.computedAt?Date.now()-e.computedAt:0,h=1;e.stale&&(h=m>6e5?.5:m>12e4?.7:.9);let g=1;g=u?.15:c||l?1:h;let _=1/o;return(0,I.jsxs)(`g`,{transform:`translate(${i}, ${s})`,opacity:g,onMouseEnter:()=>a(e.symbol),onMouseLeave:()=>a(null),style:{cursor:`pointer`},children:[c&&(0,I.jsx)(`rect`,{x:-f-3/o,y:-f-3/o,width:d+6/o,height:d+6/o,fill:`none`,stroke:p,strokeWidth:1.5/o,opacity:.8}),(0,I.jsx)(`rect`,{x:-f,y:-f,width:d,height:d,fill:l?`#FFFFFF`:p,stroke:`#000000`,strokeWidth:_})]},`point-${e.symbol}`)})})});function Nu(e,t=18){let n=e.map(e=>({...e}));for(let e=0;e<3;e++){let e=!1;for(let r=0;r<n.length;r++)for(let i=r+1;i<n.length;i++){let a=n[r],o=n[i];if(a.x<o.x+o.width&&a.x+a.width>o.x&&a.y<o.y+a.height&&a.y+a.height>o.y){let n=o.x+o.width/2-(a.x+a.width/2),r=o.y+o.height/2-(a.y+a.height/2);Math.abs(n)>Math.abs(r)?n>0?(o.x+=2,a.x-=2):(o.x-=2,a.x+=2):r>0?(o.y+=2,a.y-=2):(o.y-=2,a.y+=2),a.x=Math.max(a.anchorX-t,Math.min(a.anchorX+t,a.x)),a.y=Math.max(a.anchorY-t,Math.min(a.anchorY+t,a.y)),o.x=Math.max(o.anchorX-t,Math.min(o.anchorX+t,o.x)),o.y=Math.max(o.anchorY-t,Math.min(o.anchorY+t,o.y)),a.x=Math.round(a.x),a.y=Math.round(a.y),o.x=Math.round(o.x),o.y=Math.round(o.y),e=!0}}if(!e)break}return n}function Pu(e,t,n,r,i,a,o,s){if(e>=i&&e<=i+o&&t>=a&&t<=a+s||n>=i&&n<=i+o&&r>=a&&r<=a+s)return!0;let c=(e,t,n,r,i,a,o,s)=>{let c=(s-a)*(n-e)-(o-i)*(r-t);if(c===0)return!1;let l=((o-i)*(t-a)-(s-a)*(e-i))/c,u=((n-e)*(t-a)-(r-t)*(e-i))/c;return l>=0&&l<=1&&u>=0&&u<=1};return!!(c(e,t,n,r,i,a,i+o,a)||c(e,t,n,r,i,a+s,i+o,a+s)||c(e,t,n,r,i,a,i,a+s)||c(e,t,n,r,i+o,a,i+o,a+s))}function Fu(e){e.sort((e,t)=>t.priority-e.priority);let t=[],n=[];for(let t of e)t.trailSegments&&n.push(...t.trailSegments);let r=(e,t)=>Math.max(0,Math.min(e.x+e.width,t.x+t.width)-Math.max(e.x,t.x))*Math.max(0,Math.min(e.y+e.height,t.y+t.height)-Math.max(e.y,t.y)),i=e=>{let i=0;for(let n of t)i+=r(e,n)*10;for(let t of n)Pu(t.x1,t.y1,t.x2,t.y2,e.x,e.y,e.width,e.height)&&(i+=50);return i};for(let n of e){let{cx:e,cy:r,width:a,height:o}=n,s=[{x:e+6,y:r-o/2},{x:e-a/2,y:r+6},{x:e-a/2,y:r-o-6},{x:e-a-6,y:r-o/2}],c=s[0],l=1/0;for(let e of s){let t=i({x:e.x,y:e.y,width:a,height:o});if(t===0){c=e,l=0;break}t<l&&(l=t,c=e)}n.x=c.x,n.y=c.y,n.anchorX=c.x,n.anchorY=c.y,t.push(n)}return Nu(t,8)}var Iu=v.memo(({data:e,scales:t,selectedSector:n,hoveredSector:r,zoom:i,isStressed:a,renderState:o,setHoveredSector:s,setSelectedSector:c})=>{let l=pu(e=>e.viewportWidth),u=pu(e=>e.viewportHeight),d=Cr(e=>e.showLabels),f=Cr(e=>e.semanticZoom),p=jr(e=>e.timeframe);return d?(0,I.jsx)(`g`,{className:`label-layer`,children:(0,v.useMemo)(()=>{let s=`intraday`;try{s=Or(p).timeframeScaleClass}catch{}let c=e.map(e=>{let i=x(e.symbol),a=n===e.symbol,s=r===e.symbol,c=t.xScale(e.x),l=t.yScale(e.y),u=c*o.intZoom+o.intOffsetX,d=l*o.intZoom+o.intOffsetY,f=u*o.fitZoom+o.fitOffsetX,p=d*o.fitZoom+o.fitOffsetY,m=a?1e3:0,h=s?500:0,g=e.momentumRoc*10,_=e.velocity*5,v=m+h+g+_,y=[];if(e.trail&&e.trail.length>0){for(let n=0;n<e.trail.length-1;n++){let r=e.trail[n],i=e.trail[n+1],a=t.xScale(r.x),s=t.yScale(r.y),c=t.xScale(i.x),l=t.yScale(i.y),u=(a*o.intZoom+o.intOffsetX)*o.fitZoom+o.fitOffsetX,d=(s*o.intZoom+o.intOffsetY)*o.fitZoom+o.fitOffsetY,f=(c*o.intZoom+o.intOffsetX)*o.fitZoom+o.fitOffsetX,p=(l*o.intZoom+o.intOffsetY)*o.fitZoom+o.fitOffsetY;y.push({x1:u,y1:d,x2:f,y2:p})}y.push({x1:(t.xScale(e.trail[e.trail.length-1].x)*o.intZoom+o.intOffsetX)*o.fitZoom+o.fitOffsetX,y1:(t.yScale(e.trail[e.trail.length-1].y)*o.intZoom+o.intOffsetY)*o.fitZoom+o.fitOffsetY,x2:f,y2:p})}return{id:e.symbol,cx:f,cy:p,width:i.length*6,height:12,text:i,priority:v,isSelected:a,isHovered:s,trailSegments:y,stale:e.stale,computedAt:e.computedAt}});return c=c.filter(e=>{if(e.isSelected||e.isHovered)return!0;if(a)return!1;if(f){if(s===`ultra_intraday`&&i<2){if(e.priority<50)return!1}else if(s===`intraday`&&i<1.2&&e.priority<30)return!1}return!(e.cx<-20||e.cx>l+20||e.cy<-20||e.cy>u+20)}),Fu(c)},[e,t,i,a,o,l,u,r,n,p,f]).map(e=>{let t=(n||r)&&!e.isSelected&&!e.isHovered,i=e.computedAt?Date.now()-e.computedAt:0,a=.6;e.stale&&(a=i>6e5?.3:i>12e4?.4:.5);let o=.6;o=t?.1:e.isSelected||e.isHovered?1:a;let l=e.isSelected||e.isHovered?600:400;return(0,I.jsx)(`g`,{transform:`translate(${e.x}, ${e.y})`,children:(0,I.jsx)(`text`,{x:0,y:0,dominantBaseline:`hanging`,fontSize:10,fontWeight:l,fill:X.text.primary,opacity:o,style:{pointerEvents:`auto`,cursor:`pointer`,textShadow:`1px 1px 2px rgba(0,0,0,0.8)`},onMouseEnter:()=>s(e.id),onMouseLeave:()=>s(null),onMouseUp:t=>{t.stopPropagation(),c(e.isSelected?null:e.id)},onMouseDown:e=>e.stopPropagation(),children:e.text})},`label-${e.id}`)})}):null}),Lu=v.memo(({dims:e,scales:t})=>{let n=F(e=>e.crosshairX),r=F(e=>e.crosshairY);if(n===null||r===null)return null;let i=t.xScale(n),a=t.yScale(r),o=e=>e.toFixed(2);return(0,I.jsxs)(`g`,{className:`crosshair-layer`,pointerEvents:`none`,children:[(0,I.jsx)(`line`,{x1:0,x2:e.innerWidth,y1:a,y2:a,stroke:`#505050`,strokeWidth:.5,strokeDasharray:`4,4`}),(0,I.jsx)(`line`,{x1:i,x2:i,y1:0,y2:e.innerHeight,stroke:`#505050`,strokeWidth:.5,strokeDasharray:`4,4`}),(0,I.jsxs)(`g`,{transform:`translate(${i}, ${e.innerHeight})`,children:[(0,I.jsx)(`rect`,{x:-25,y:0,width:50,height:16,fill:X.bg.panel,stroke:X.border.primary}),(0,I.jsx)(`text`,{x:0,y:12,fontSize:10,fill:X.text.primary,textAnchor:`middle`,children:o(n)})]}),(0,I.jsxs)(`g`,{transform:`translate(0, ${a})`,children:[(0,I.jsx)(`rect`,{x:-35,y:-8,width:35,height:16,fill:X.bg.panel,stroke:X.border.primary}),(0,I.jsx)(`text`,{x:-4,y:3,fontSize:10,fill:X.text.primary,textAnchor:`end`,children:o(r)})]})]})}),Ru=v.memo(({data:e,scales:t,dims:n})=>{let r=F(e=>e.hoveredSector);if(!r)return null;let i=e.find(e=>e.symbol===r);if(!i)return null;let a=t.xScale(i.x),o=t.yScale(i.y),s=a+15,c=o+15;return s+180>n.width&&(s=a-180-15),c+130>n.height&&(c=o-130-15),(0,I.jsx)(`g`,{className:`tooltip-layer`,pointerEvents:`none`,children:(0,I.jsx)(`foreignObject`,{x:s,y:c,width:180,height:130,children:(0,I.jsxs)(`div`,{style:{background:`#111111`,border:`1px solid #333333`,padding:`8px`,borderRadius:`4px`,color:`#E0E0E0`,fontFamily:`monospace`,fontSize:`11px`,lineHeight:`1.4`},children:[(0,I.jsx)(`div`,{style:{fontWeight:`bold`,marginBottom:`4px`,borderBottom:`1px solid #333`,paddingBottom:`4px`},children:x(i.symbol)}),(0,I.jsxs)(`div`,{children:[`RS-Ratio: `,i.x.toFixed(2)]}),(0,I.jsxs)(`div`,{children:[`RS-Momentum: `,i.y.toFixed(2)]}),(0,I.jsxs)(`div`,{children:[`Quadrant: `,i.quadrant]}),(0,I.jsxs)(`div`,{children:[`Velocity: `,i.velocity?.toFixed(2)||`N/A`]}),(0,I.jsxs)(`div`,{children:[`Heading: `,i.heading||`N/A`]}),(0,I.jsxs)(`div`,{children:[`Distance: `,i.distance?.toFixed(2)||`N/A`]}),i.stale&&i.computedAt&&(0,I.jsxs)(`div`,{style:{color:`#FFB74D`,marginTop:`4px`,borderTop:`1px solid #333`,paddingTop:`4px`,fontStyle:`italic`},children:[`Last Updated: `,Math.round((Date.now()-i.computedAt)/1e3),`s ago (Stale)`]})]})})})});function zu(e,t){let{zoomBy:n,resetToFit:r}=pu(yu(e=>({zoomBy:e.zoomBy,resetToFit:e.resetToFit})));return(0,v.useEffect)(()=>{let r=e.current;if(!r)return;let i=e=>{e.preventDefault();let i=r.getBoundingClientRect(),a=e.clientX-i.left-t.margin.left,o=e.clientY-i.top-t.margin.top;n(e.deltaY,a,o)};return r.addEventListener(`wheel`,i,{passive:!1}),()=>r.removeEventListener(`wheel`,i)},[e,n,t.margin.left,t.margin.top]),{onDoubleClick:r}}function Bu(e,t,n,r,i,a){let[o,s]=(0,v.useState)({fitZoom:e,fitOffsetX:t,fitOffsetY:n,intZoom:r,intOffsetX:i,intOffsetY:a,isStressed:!1}),c=(0,v.useRef)(o);return(0,v.useEffect)(()=>{let o,l=performance.now(),u=d=>{let f=d-l;l=d;let p=c.current,m=(e,t,n=.25)=>{let r=t-e;return Math.abs(r)<.001?t:e+r*n},h=m(p.fitZoom,e),g=m(p.fitOffsetX,t),_=m(p.fitOffsetY,n),v=m(p.intZoom,r),y=m(p.intOffsetX,i),b=m(p.intOffsetY,a),x=e=>Math.round(e*1e3)/1e3,S=e=>Math.round(e*100)/100,C=(e,t)=>Number.isFinite(e)?e:t,w={fitZoom:C(x(h),1),fitOffsetX:C(S(g),0),fitOffsetY:C(S(_),0),intZoom:C(x(v),1),intOffsetX:C(S(y),0),intOffsetY:C(S(b),0),isStressed:f>16};w.fitZoom!==p.fitZoom||w.fitOffsetX!==p.fitOffsetX||w.fitOffsetY!==p.fitOffsetY||w.intZoom!==p.intZoom||w.intOffsetX!==p.intOffsetX||w.intOffsetY!==p.intOffsetY||w.isStressed!==p.isStressed?(c.current=w,s(w),o=requestAnimationFrame(u)):w.isStressed&&(c.current.isStressed=!1,s({...w,isStressed:!1}))};return o=requestAnimationFrame(u),()=>cancelAnimationFrame(o)},[e,t,n,r,i,a]),{renderState:o,stateRef:c}}var Vu=v.memo(()=>{let e=(0,v.useRef)(null),t=(0,v.useRef)(null),[n,r]=(0,v.useState)({width:800,height:600});(0,v.useEffect)(()=>{if(!e.current)return;let t=new ResizeObserver(e=>{for(let t of e)r({width:t.contentRect.width,height:t.contentRect.height})});return t.observe(e.current),()=>t.disconnect()},[]);let i={top:30,right:30,bottom:48,left:56},a=(0,v.useMemo)(()=>({width:n.width,height:n.height,margin:i,innerWidth:n.width-i.left-i.right,innerHeight:n.height-i.top-i.bottom}),[n.width,n.height]),o=F(e=>e.enrichedData),s=F(e=>e.hiddenSectors),c=(0,v.useMemo)(()=>o.filter(e=>!s.includes(e.symbol)),[o,s]),{selectedSector:l,hoveredSector:u,setHoveredSector:d,setSelectedSector:f,setCrosshair:p,watchlist:m}=F(yu(e=>({selectedSector:e.selectedSector,hoveredSector:e.hoveredSector,setHoveredSector:e.setHoveredSector,setSelectedSector:e.setSelectedSector,setCrosshair:e.setCrosshair,watchlist:e.watchlist}))),h=jr(e=>e.showTrails),g=jr(e=>e.normalized),{targetFitZoom:_,targetFitOffsetX:y,targetFitOffsetY:x,targetInteractionZoom:S,targetInteractionOffsetX:C,targetInteractionOffsetY:w,setDimensions:ee,startDrag:T,updateDrag:te,endDrag:E,screenToWorld:ne}=pu(yu(e=>({targetFitZoom:e.targetFitZoom,targetFitOffsetX:e.targetFitOffsetX,targetFitOffsetY:e.targetFitOffsetY,targetInteractionZoom:e.targetInteractionZoom,targetInteractionOffsetX:e.targetInteractionOffsetX,targetInteractionOffsetY:e.targetInteractionOffsetY,setDimensions:e.setDimensions,startDrag:e.startDrag,updateDrag:e.updateDrag,endDrag:e.endDrag,screenToWorld:e.screenToWorld}))),{renderState:re,stateRef:ie}=Bu(_,y,x,S,C,w),ae=re.fitZoom*re.intZoom;(0,v.useEffect)(()=>{ee(a.innerWidth,a.innerHeight,a.innerWidth,a.innerHeight)},[a,ee]);let oe=(0,v.useMemo)(()=>m.filter(e=>e.enabled).length,[m]),{xDomain:se,yDomain:ce,step:D}=(0,v.useMemo)(()=>{let e=[],t=[];return c.forEach(n=>{e.push(n.x),t.push(n.y),n.trail&&n.trail.forEach(n=>{e.push(n.x),t.push(n.y)})}),e.length===0?{xDomain:[90,110],yDomain:[90,110],step:1}:du(e,t,.001)},[c]),O=(0,v.useMemo)(()=>uu(se,ce,a,g?100:1),[se,ce,a,g]),le=pu(e=>e.setContentBounds);(0,v.useEffect)(()=>{c.length>0&&Vr(async()=>{let{computeDataBounds:e}=await Promise.resolve().then(()=>b);return{computeDataBounds:e}},void 0).then(({computeDataBounds:e})=>{le(e(c))})},[c,le]);let ue=`translate(${i.left}, ${i.top})`,{onDoubleClick:de}=zu(t,a),fe=(0,v.useRef)(null),k=(0,v.useCallback)(e=>{fe.current={x:e.clientX,y:e.clientY},T(e.clientX,e.clientY)},[T]),A=(0,v.useCallback)(e=>{if(E(),fe.current){let t=Math.abs(e.clientX-fe.current.x),n=Math.abs(e.clientY-fe.current.y);t<5&&n<5&&f(null)}fe.current=null},[E,f]),pe=(0,v.useCallback)(t=>{if(!e.current)return;te(t.clientX,t.clientY);let n=e.current.getBoundingClientRect(),r=t.clientX-n.left-i.left,a=t.clientY-n.top-i.top,{fitZoom:o,fitOffsetX:s,fitOffsetY:c,intZoom:l,intOffsetX:u,intOffsetY:d}=ie.current,f=(r-s)/o,m=(a-c)/o,h=(f-u)/l,g=(m-d)/l;p(O.xScale.invert(h),O.yScale.invert(g))},[O,p,i.left,i.top,te,ne,ie]),me=(0,v.useCallback)(()=>{E(),p(null,null)},[p,E]);return(0,I.jsx)(`div`,{id:`rrg-scene-container`,ref:e,style:{width:`100%`,height:`100%`,overflow:`hidden`},children:(0,I.jsxs)(`svg`,{id:`rrg-scene-svg`,ref:t,width:a.width,height:a.height,viewBox:`0 0 ${a.width} ${a.height}`,preserveAspectRatio:`xMidYMid meet`,style:{cursor:re.intZoom>1?`grab`:`crosshair`,background:`transparent`,display:`block`},onDoubleClick:de,onMouseDown:k,onMouseUp:A,onMouseMove:pe,onMouseLeave:me,children:[(0,I.jsxs)(`defs`,{children:[(0,I.jsx)(`clipPath`,{id:`plot-clip`,children:(0,I.jsx)(`rect`,{x:0,y:0,width:a.innerWidth,height:a.innerHeight})}),[`LEADING`,`WEAKENING`,`LAGGING`,`IMPROVING`].map(e=>{let t=bu(e).text;return(0,I.jsx)(`marker`,{id:`arrowhead-${e}`,viewBox:`0 -5 10 10`,refX:`8`,refY:`0`,markerUnits:`strokeWidth`,orient:`auto`,markerWidth:`6`,markerHeight:`6`,children:(0,I.jsx)(`path`,{d:`M 0,-5 L 10,0 L 0,5`,fill:t,style:{stroke:`none`}})},`arrow-${e}`)}),(0,I.jsxs)(`filter`,{id:`glow`,x:`-50%`,y:`-50%`,width:`200%`,height:`200%`,children:[(0,I.jsx)(`feGaussianBlur`,{stdDeviation:`3`,result:`blur`}),(0,I.jsx)(`feComposite`,{in:`SourceGraphic`,in2:`blur`,operator:`over`})]})]}),(0,I.jsx)(`g`,{transform:ue,children:(0,I.jsx)(`g`,{className:`export-layer`,children:oe===0?(0,I.jsx)(`text`,{x:a.innerWidth/2,y:a.innerHeight/2,textAnchor:`middle`,dominantBaseline:`middle`,fill:`var(--text-muted)`,fontFamily:`var(--font-mono)`,fontSize:`24px`,fontWeight:`bold`,children:`NO SECTORS SELECTED`}):(0,I.jsxs)(I.Fragment,{children:[(0,I.jsxs)(`g`,{className:`ui-layer`,children:[(0,I.jsx)(Cu,{dims:a}),(0,I.jsx)(Tu,{scales:O,dims:a})]}),(0,I.jsxs)(`g`,{clipPath:`url(#plot-clip)`,children:[(0,I.jsx)(`g`,{transform:`translate(${re.fitOffsetX}, ${re.fitOffsetY})`,children:(0,I.jsx)(`g`,{transform:`scale(${re.fitZoom})`,children:(0,I.jsx)(`g`,{transform:`translate(${re.intOffsetX}, ${re.intOffsetY})`,children:(0,I.jsxs)(`g`,{transform:`scale(${re.intZoom})`,children:[(0,I.jsx)(Su,{scales:O}),(0,I.jsx)(xu,{scales:O,dims:a,xDomain:se,yDomain:ce,step:D}),(0,I.jsx)(wu,{scales:O}),(0,I.jsx)(ju,{data:c,scales:O,showTrail:h,selectedSector:l,hoveredSector:u,zoom:ae,isStressed:re.isStressed,setHoveredSector:d}),(0,I.jsx)(Mu,{data:c,scales:O,selectedSector:l,hoveredSector:u,zoom:ae,setHoveredSector:d})]})})})}),(0,I.jsx)(Iu,{data:c,scales:O,selectedSector:l,hoveredSector:u,zoom:ae,isStressed:re.isStressed,renderState:re,setHoveredSector:d,setSelectedSector:f})]}),(0,I.jsxs)(`g`,{className:`overlay-layer`,children:[(0,I.jsx)(Lu,{dims:a,scales:O}),(0,I.jsx)(Ru,{data:c,scales:O,dims:a})]})]})})})]})})}),Hu=e=>{switch(e){case`1min`:return 15e3;case`5min`:return 3e4;case`15min`:return 6e4;case`30min`:return 12e4;case`1h`:return 3e5;default:return 0}};function Uu(){let e=F(e=>e.fetchData),t=F(e=>e.fetchSectorList),n=Cr(e=>e.benchmark),r=jr(e=>e.timeframe),i=jr(e=>e.trailLength),a=jr(e=>e.normalized),o=F(e=>e.watchlist.filter(e=>e.enabled).map(e=>e.symbol).join(`,`));(0,v.useEffect)(()=>{t()},[t]),(0,v.useEffect)(()=>{let t=new AbortController,n=setTimeout(()=>{console.log(`[AutoFetch] Querying API with:`,{timeframe:r,trailLength:i,normalized:a}),e(t.signal)},250),o=Hu(r),s=null;return o>0&&(s=setInterval(()=>{e(t.signal)},o)),()=>{clearTimeout(n),t.abort(),s&&clearInterval(s)}},[e,n,r,i,a,o])}function Wu(){let e=F(e=>e.setIsPlaying),t=F(e=>e.isPlaying),n=F(e=>e.enrichedData),r=F(e=>e.selectedSector),i=F(e=>e.setSelectedSector);(0,v.useEffect)(()=>{let a=a=>{switch(a.key){case`+`:case`=`:pu.getState().zoomBy(-100,pu.getState().viewportWidth/2,pu.getState().viewportHeight/2);break;case`-`:pu.getState().zoomBy(100,pu.getState().viewportWidth/2,pu.getState().viewportHeight/2);break;case`ArrowUp`:a.preventDefault(),pu.getState().panBy(0,30);break;case`ArrowDown`:a.preventDefault(),pu.getState().panBy(0,-30);break;case`ArrowLeft`:pu.getState().panBy(30,0);break;case`ArrowRight`:pu.getState().panBy(-30,0);break;case` `:a.preventDefault(),e(!t);break;case`F2`:a.preventDefault(),pu.getState().resetToFit();break;case`Tab`:{if(a.preventDefault(),n.length===0)break;let e=n.map(e=>e.symbol),t=e[((r?e.indexOf(r):-1)+1)%e.length];i(t);break}case`0`:a.ctrlKey&&(a.preventDefault(),pu.getState().resetToFit());break}};return window.addEventListener(`keydown`,a),()=>window.removeEventListener(`keydown`,a)},[t,n,r,e,i])}function Z(){return Uu(),Wu(),(0,I.jsxs)(`div`,{className:`app`,children:[(0,I.jsx)(`div`,{className:`app__command`,children:(0,I.jsx)(Hr,{})}),(0,I.jsxs)(`div`,{className:`app__left`,children:[(0,I.jsx)(qr,{}),(0,I.jsx)(Kr,{})]}),(0,I.jsx)(`div`,{className:`app__chart`,children:(0,I.jsx)(Vu,{})}),(0,I.jsx)(`div`,{className:`app__watchlist`,children:(0,I.jsx)(Wr,{})}),(0,I.jsx)(`div`,{className:`app__status`,children:(0,I.jsx)(Gr,{})})]})}(0,y.createRoot)(document.getElementById(`root`)).render((0,I.jsx)(v.StrictMode,{children:(0,I.jsx)(Z,{})}));
```

```html
// File: dist\index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="VEGA RRG — Professional Relative Rotation Graph analysis for Indian equity sectors. Bloomberg Terminal-grade visualization." />
    <title>VEGA RRG — Relative Rotation Graph</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script type="module" crossorigin src="/assets/index-GnJ0tZ3o.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Dk8xVSF8.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

```javascript
// File: eslint.config.js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
```

```
// File: fix_props.cjs
const fs = require('fs');

function replaceAll(file, replacements) {
    let text = fs.readFileSync(file, 'utf8');
    for (const [from, to] of replacements) {
        text = text.split(from).join(to);
    }
    fs.writeFileSync(file, text);
}

replaceAll('src/components/terminal/WatchlistPanel.tsx', [
    ['item.sector', 'item.symbol']
]);

replaceAll('src/components/RankingPanel.tsx', [
    ["'sector' | 'rsRatio' | 'rsMomentum' | 'rank'", "'symbol' | 'x' | 'y' | 'rank'"],
    ["useState<SortKey>('rsRatio')", "useState<SortKey>('x')"],
    ["a.strength || a.rsRatio || 0", "a.trendStrength || a.x || 0"],
    ["b.strength || b.rsRatio || 0", "b.trendStrength || b.x || 0"],
    ["handleSort('sector')", "handleSort('symbol')"],
    ["renderSortArrow('sector')", "renderSortArrow('symbol')"],
    ["handleSort('rsRatio')", "handleSort('x')"],
    ["renderSortArrow('rsRatio')", "renderSortArrow('x')"],
    ["handleSort('rsMomentum')", "handleSort('y')"],
    ["renderSortArrow('rsMomentum')", "renderSortArrow('y')"],
    ["item.sector", "item.symbol"],
    ["item.rsRatio", "item.x"],
    ["item.rsMomentum", "item.y"],
    ["selectedSector === item.symbol", "selectedSector === item.symbol"]
]);
console.log("Fixed sector vs symbol property names");
```

```
// File: fix_ts.cjs
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const { from, to } of replacements) {
        content = content.replace(from, to);
    }
    fs.writeFileSync(filePath, content, 'utf8');
}

// 1. App.tsx
replaceInFile('src/App.tsx', [
    { from: /import React from 'react';\r?\n/, to: '' },
    { from: /import { CommandBar }/g, to: "import CommandBar" },
    { from: /import { WatchlistPanel }/g, to: "import WatchlistPanel" },
    { from: /import { StatusBar }/g, to: "import StatusBar" },
    { from: /import { MetricsPanel }/g, to: "import MetricsPanel" },
    { from: /import { RankingPanel }/g, to: "import RankingPanel" }
]);

// 2. Layers (type imports)
const layerFiles = fs.readdirSync('src/components/chart/layers').filter(f => f.endsWith('.tsx'));
for (const file of layerFiles) {
    const filePath = path.join('src/components/chart/layers', file);
    replaceInFile(filePath, [
        { from: /import \{\s*([^}]*?(?:RrgScales|ChartDimensions|EnrichedRrgPoint)[^}]*?)\s*\}/g, to: "import type { $1 }" },
        { from: /import React, \{([^}]*?)\} from 'react';/g, to: "import React, { $1 } from 'react';" }
    ]);
    
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/import {([^}]*)} from '([^']*(?:\.\.\/)+types)';/g, "import type {$1} from '$2';");
    content = content.replace(/import {([^}]*)} from '([^']*(?:\.\.\/)+core\/scales)';/g, (match, p1, p2) => {
        if (p1.includes('RrgScales')) {
            const types = p1.split(',').map(s => s.trim());
            const typeNames = types.filter(t => t === 'RrgScales' || t === 'ChartDimensions');
            const otherNames = types.filter(t => t !== 'RrgScales' && t !== 'ChartDimensions');
            if (otherNames.length > 0) {
                return `import type { ${typeNames.join(', ')} } from '${p2}';\nimport { ${otherNames.join(', ')} } from '${p2}';`;
            } else {
                return `import type { ${typeNames.join(', ')} } from '${p2}';`;
            }
        }
        return match;
    });
    fs.writeFileSync(filePath, content, 'utf8');
}

// Additional fix for RrgScene
replaceInFile('src/components/chart/RrgScene.tsx', [
    { from: /import {([^}]*)} from '([^']*(?:\.\.\/)+types)';/g, to: "import type {$1} from '$2';" }
]);

// 3. MetricsPanel
replaceInFile('src/components/MetricsPanel.tsx', [
    { from: /\.sector/g, to: '.symbol' },
    { from: /\.rsRatio/g, to: '.x' },
    { from: /\.rsMomentum/g, to: '.y' },
    { from: /\.momRoc/g, to: '.momentumRoc' },
    { from: /\.strength/g, to: '.trendStrength' }
]);

// 4. StatusBar
replaceInFile('src/components/terminal/StatusBar.tsx', [
    { from: /\.LEADING/g, to: '.leading' },
    { from: /\.WEAKENING/g, to: '.weakening' },
    { from: /\.LAGGING/g, to: '.lagging' },
    { from: /\.IMPROVING/g, to: '.improving' }
]);

// 5. geometry.ts
replaceInFile('src/core/geometry.ts', [
    { from: /import \{ LabelRect \} from '\.\.\/types';\r?\n/g, to: '' },
    { from: /export function resolveCollisions/g, to: "export interface LabelRect { id: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; }\n\nexport function resolveCollisions" }
]);

// 6. math.ts
replaceInFile('src/core/math.ts', [
    { from: /QuadrantDistribution, Quadrant/g, to: 'QuadrantDistribution' }
]);

// 7. api.ts
replaceInFile('src/services/api.ts', [
    { from: /const latency = Math\.round\(performance\.now\(\) - start\);\r?\n\s*return response\.data;/g, to: "return response.data;" }
]);

// Fix the unused useMemo in TrailLayer
replaceInFile('src/components/chart/layers/TrailLayer.tsx', [
    { from: /import React, \{([^}]*)useMemo([^}]*)\} from 'react';/, to: (match, p1, p2) => {
        let inside = `${p1}${p2}`.replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
        if (inside) return `import React, { ${inside} } from 'react';`;
        return `import React from 'react';`;
    }}
]);

console.log("Fixes applied.");
```

```html
// File: index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="VEGA RRG — Professional Relative Rotation Graph analysis for Indian equity sectors. Bloomberg Terminal-grade visualization." />
    <title>VEGA RRG — Relative Rotation Graph</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```json
// File: package-lock.json
{
  "name": "vega-rrg",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "vega-rrg",
      "version": "1.0.0",
      "dependencies": {
        "@types/d3": "^7.4.3",
        "axios": "^1.16.1",
        "d3": "^7.9.0",
        "html-to-image": "^1.11.13",
        "react": "^19.2.6",
        "react-dom": "^19.2.6",
        "zustand": "^5.0.0"
      },
      "devDependencies": {
        "@eslint/js": "^10.0.1",
        "@types/node": "^24.12.3",
        "@types/react": "^19.2.14",
        "@types/react-dom": "^19.2.3",
        "@vitejs/plugin-react": "^6.0.1",
        "eslint": "^10.3.0",
        "eslint-plugin-react-hooks": "^7.1.1",
        "eslint-plugin-react-refresh": "^0.5.2",
        "globals": "^17.6.0",
        "typescript": "~6.0.2",
        "typescript-eslint": "^8.59.2",
        "vite": "^8.0.12"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz",
      "integrity": "sha512-9NhCeYjq9+3uxgdtp20LSiJXJvN0FeCtNGpJxuMFZ1Kv3cWUNb6DOhJwUvcVCzKGR66cw4njwM6hrJLqgOwbcw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.28.5",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/compat-data": {
      "version": "7.29.3",
      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.3.tgz",
      "integrity": "sha512-LIVqM46zQWZhj17qA8wb4nW/ixr2y1Nw+r1etiAWgRM6U1IqP+LNhL1yg440jYZR72jCWcWbLWzIosH+uP1fqg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/core": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.0.tgz",
      "integrity": "sha512-CGOfOJqWjg2qW/Mb6zNsDm+u5vFQ8DxXfbM09z69p5Z6+mE1ikP2jUXw+j42Pf1XTYED2Rni5f95npYeuwMDQA==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@babel/code-frame": "^7.29.0",
        "@babel/generator": "^7.29.0",
        "@babel/helper-compilation-targets": "^7.28.6",
        "@babel/helper-module-transforms": "^7.28.6",
        "@babel/helpers": "^7.28.6",
        "@babel/parser": "^7.29.0",
        "@babel/template": "^7.28.6",
        "@babel/traverse": "^7.29.0",
        "@babel/types": "^7.29.0",
        "@jridgewell/remapping": "^2.3.5",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "node_modules/@babel/generator": {
      "version": "7.29.1",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.1.tgz",
      "integrity": "sha512-qsaF+9Qcm2Qv8SRIMMscAvG4O3lJ0F1GuMo5HR/Bp02LopNgnZBC/EkbevHFeGs4ls/oPz9v+Bsmzbkbe+0dUw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.29.0",
        "@babel/types": "^7.29.0",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets": {
      "version": "7.28.6",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.28.6.tgz",
      "integrity": "sha512-JYtls3hqi15fcx5GaSNL7SCTJ2MNmjrkHXg4FSpOA/grxK8KwyZ5bubHsCq8FXCkua6xhuaaBit+3b7+VZRfcA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.28.6",
        "@babel/helper-validator-option": "^7.27.1",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-globals": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
      "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-imports": {
      "version": "7.28.6",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.28.6.tgz",
      "integrity": "sha512-l5XkZK7r7wa9LucGw9LwZyyCUscb4x37JWTPz7swwFE/0FMQAGpiWUZn8u9DzkSBWEcK25jmvubfpw2dnAMdbw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/traverse": "^7.28.6",
        "@babel/types": "^7.28.6"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-transforms": {
      "version": "7.28.6",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.6.tgz",
      "integrity": "sha512-67oXFAYr2cDLDVGLXTEABjdBJZ6drElUSI7WKp70NrpyISso3plG9SAGEF6y7zbha/wOzUByWWTJvEDVNIUGcA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.28.6",
        "@babel/helper-validator-identifier": "^7.28.5",
        "@babel/traverse": "^7.28.6"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "node_modules/@babel/helper-string-parser": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz",
      "integrity": "sha512-qMlSxKbpRlAridDExk92nSobyDdpPijUq2DW6oDnUqd0iOGxmQjyqhMIihI9+zv4LPyZdRje2cavWPbCbWm3eA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-identifier": {
      "version": "7.28.5",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz",
      "integrity": "sha512-qSs4ifwzKJSV39ucNjsvc6WVHs6b7S03sOh2OcHF9UHfVPqWWALUsNUVzhSBiItjRZoLHx7nIarVjqKVusUZ1Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-option": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz",
      "integrity": "sha512-YvjJow9FxbhFFKDSuFnVCe2WxXk1zWc22fFePVNEaWJEu8IrZVlda6N0uHwzZrUM1il7NC9Mlp4MaJYbYd9JSg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helpers": {
      "version": "7.29.2",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.2.tgz",
      "integrity": "sha512-HoGuUs4sCZNezVEKdVcwqmZN8GoHirLUcLaYVNBK2J0DadGtdcqgr3BCbvH8+XUo4NGjNl3VOtSjEKNzqfFgKw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.28.6",
        "@babel/types": "^7.29.0"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/parser": {
      "version": "7.29.3",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.3.tgz",
      "integrity": "sha512-b3ctpQwp+PROvU/cttc4OYl4MzfJUWy6FZg+PMXfzmt/+39iHVF0sDfqay8TQM3JA2EUOyKcFZt75jWriQijsA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.29.0"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/template": {
      "version": "7.28.6",
      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.28.6.tgz",
      "integrity": "sha512-YA6Ma2KsCdGb+WC6UpBVFJGXL58MDA6oyONbjyF/+5sBgxY/dwkhLogbMT2GXXyU84/IhRw/2D1Os1B/giz+BQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.28.6",
        "@babel/parser": "^7.28.6",
        "@babel/types": "^7.28.6"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/traverse": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.0.tgz",
      "integrity": "sha512-4HPiQr0X7+waHfyXPZpWPfWL/J7dcN1mx9gL6WdQVMbPnF3+ZhSMs8tCxN7oHddJE9fhNE7+lxdnlyemKfJRuA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.0",
        "@babel/generator": "^7.29.0",
        "@babel/helper-globals": "^7.28.0",
        "@babel/parser": "^7.29.0",
        "@babel/template": "^7.28.6",
        "@babel/types": "^7.29.0",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/types": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.0.tgz",
      "integrity": "sha512-LwdZHpScM4Qz8Xw2iKSzS+cfglZzJGvofQICy7W7v4caru4EaAmyUuO6BGrbyQ2mYV11W0U8j5mBhd14dd3B0A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.28.5"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@emnapi/wasi-threads": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/@emnapi/wasi-threads/-/wasi-threads-1.2.1.tgz",
      "integrity": "sha512-uTII7OYF+/Mes/MrcIOYp5yOtSMLBWSIoLPpcgwipoiKbli6k322tcoFsxoIIxPDqW01SQGAgko4EzZi2BNv2w==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@eslint-community/eslint-utils": {
      "version": "4.9.1",
      "resolved": "https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.9.1.tgz",
      "integrity": "sha512-phrYmNiYppR7znFEdqgfWHXR6NCkZEK7hwWDHZUjit/2/U0r6XvkDl0SYnoM51Hq7FhCGdLDT6zxCCOY1hexsQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "eslint-visitor-keys": "^3.4.3"
      },
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      },
      "peerDependencies": {
        "eslint": "^6.0.0 || ^7.0.0 || >=8.0.0"
      }
    },
    "node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys": {
      "version": "3.4.3",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz",
      "integrity": "sha512-wpc+LXeiyiisxPlEkUzU6svyS1frIO3Mgxj1fdy7Pm8Ygzguax2N3Fa/D/ag1WqbOprdI+uY6wMUl8/a2G+iag==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^12.22.0 || ^14.17.0 || >=16.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/@eslint-community/regexpp": {
      "version": "4.12.2",
      "resolved": "https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.2.tgz",
      "integrity": "sha512-EriSTlt5OC9/7SXkRSCAhfSxxoSUgBm33OH+IkwbdpgoqsSsUg7y3uh+IICI/Qg4BBWr3U2i39RpmycbxMq4ew==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^12.0.0 || ^14.0.0 || >=16.0.0"
      }
    },
    "node_modules/@eslint/config-array": {
      "version": "0.23.5",
      "resolved": "https://registry.npmjs.org/@eslint/config-array/-/config-array-0.23.5.tgz",
      "integrity": "sha512-Y3kKLvC1dvTOT+oGlqNQ1XLqK6D1HU2YXPc52NmAlJZbMMWDzGYXMiPRJ8TYD39muD/OTjlZmNJ4ib7dvSrMBA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/object-schema": "^3.0.5",
        "debug": "^4.3.1",
        "minimatch": "^10.2.4"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      }
    },
    "node_modules/@eslint/config-helpers": {
      "version": "0.6.0",
      "resolved": "https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.6.0.tgz",
      "integrity": "sha512-ii6Bw9jJ2zi2cWA2Z+9/QZ/+3DX6kwaV5Q986D/CdP3Lap3w/pgQZ373FV7byY/i7L4IRH/G43I5dz1ClsCbpA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^1.2.1"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      }
    },
    "node_modules/@eslint/core": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/@eslint/core/-/core-1.2.1.tgz",
      "integrity": "sha512-MwcE1P+AZ4C6DWlpin/OmOA54mmIZ/+xZuJiQd4SyB29oAJjN30UW9wkKNptW2ctp4cEsvhlLY/CsQ1uoHDloQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@types/json-schema": "^7.0.15"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      }
    },
    "node_modules/@eslint/js": {
      "version": "10.0.1",
      "resolved": "https://registry.npmjs.org/@eslint/js/-/js-10.0.1.tgz",
      "integrity": "sha512-zeR9k5pd4gxjZ0abRoIaxdc7I3nDktoXZk2qOv9gCNWx3mVwEn32VRhyLaRsDiJjTs0xq/T8mfPtyuXu7GWBcA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "eslint": "^10.0.0"
      },
      "peerDependenciesMeta": {
        "eslint": {
          "optional": true
        }
      }
    },
    "node_modules/@eslint/object-schema": {
      "version": "3.0.5",
      "resolved": "https://registry.npmjs.org/@eslint/object-schema/-/object-schema-3.0.5.tgz",
      "integrity": "sha512-vqTaUEgxzm+YDSdElad6PiRoX4t8VGDjCtt05zn4nU810UIx/uNEV7/lZJ6KwFThKZOzOxzXy48da+No7HZaMw==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      }
    },
    "node_modules/@eslint/plugin-kit": {
      "version": "0.7.1",
      "resolved": "https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.7.1.tgz",
      "integrity": "sha512-rZAP3aVgB9ds9KOeUSL+zZ21hPmo8dh6fnIFwRQj5EAZl9gzR7wxYbYXYysAM8CTqGmUGyp2S4kUdV17MnGuWQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@eslint/core": "^1.2.1",
        "levn": "^0.4.1"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      }
    },
    "node_modules/@humanfs/core": {
      "version": "0.19.2",
      "resolved": "https://registry.npmjs.org/@humanfs/core/-/core-0.19.2.tgz",
      "integrity": "sha512-UhXNm+CFMWcbChXywFwkmhqjs3PRCmcSa/hfBgLIb7oQ5HNb1wS0icWsGtSAUNgefHeI+eBrA8I1fxmbHsGdvA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@humanfs/types": "^0.15.0"
      },
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanfs/node": {
      "version": "0.16.8",
      "resolved": "https://registry.npmjs.org/@humanfs/node/-/node-0.16.8.tgz",
      "integrity": "sha512-gE1eQNZ3R++kTzFUpdGlpmy8kDZD/MLyHqDwqjkVQI0JMdI1D51sy1H958PNXYkM2rAac7e5/CnIKZrHtPh3BQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@humanfs/core": "^0.19.2",
        "@humanfs/types": "^0.15.0",
        "@humanwhocodes/retry": "^0.4.0"
      },
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanfs/types": {
      "version": "0.15.0",
      "resolved": "https://registry.npmjs.org/@humanfs/types/-/types-0.15.0.tgz",
      "integrity": "sha512-ZZ1w0aoQkwuUuC7Yf+7sdeaNfqQiiLcSRbfI08oAxqLtpXQr9AIVX7Ay7HLDuiLYAaFPu8oBYNq/QIi9URHJ3Q==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18.0"
      }
    },
    "node_modules/@humanwhocodes/module-importer": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz",
      "integrity": "sha512-bxveV4V8v5Yb4ncFTT3rPSgZBOpCkjfK0y4oVVVJwIuDVBRMDXrPyXRL988i5ap9m9bnyEEjWfm5WkBmtffLfA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=12.22"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@humanwhocodes/retry": {
      "version": "0.4.3",
      "resolved": "https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz",
      "integrity": "sha512-bV0Tgo9K4hfPCek+aMAn81RppFKv2ySDQeMoSZuvTASywNTnVJCArCZE2FWqpvIatKu7VMRLWlR1EazvVhDyhQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.18"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/nzakas"
      }
    },
    "node_modules/@jridgewell/gen-mapping": {
      "version": "0.3.13",
      "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
      "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.0",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/remapping": {
      "version": "2.3.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz",
      "integrity": "sha512-LI9u/+laYG4Ds1TDKSJW2YPrIlcVYOwi2fUC6xB43lueCjgxV4lffOCZCtYFiH6TNOX+tQKXx97T4IKHbhyHEQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.5.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.31",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
      "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    },
    "node_modules/@napi-rs/wasm-runtime": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/@napi-rs/wasm-runtime/-/wasm-runtime-1.1.4.tgz",
      "integrity": "sha512-3NQNNgA1YSlJb/kMH1ildASP9HW7/7kYnRI2szWJaofaS1hWmbGI4H+d3+22aGzXXN9IJ+n+GiFVcGipJP18ow==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@tybys/wasm-util": "^0.10.1"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/Brooooooklyn"
      },
      "peerDependencies": {
        "@emnapi/core": "^1.7.1",
        "@emnapi/runtime": "^1.7.1"
      }
    },
    "node_modules/@oxc-project/types": {
      "version": "0.130.0",
      "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.130.0.tgz",
      "integrity": "sha512-ibD2usx9JRu7f5pu2tMKMI4cpA4NgXJQoYRP4pQ7Pxmn1l6k/53qWtQWZayhYy3X4QZkt90Ot+mJEaeXouio6Q==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/Boshen"
      }
    },
    "node_modules/@rolldown/binding-android-arm64": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.0.1.tgz",
      "integrity": "sha512-fJI3I0r3C3Oj/zdBCpaCmBRZYf07xpaq4yCfDDoSFm+beWNzbIl26puW8RraUdugoJw/95zerNOn6jasAhzSmg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-darwin-arm64": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.0.1.tgz",
      "integrity": "sha512-cKnAhWEsV7TPcA/5EAteDp6KcJZBQ2G+BqE7zayMMi7kMvwRsbv7WT9aOnn0WNl4SKEIf43vjS31iUPu80nzXg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-darwin-x64": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.0.1.tgz",
      "integrity": "sha512-YKrVwQjIRBPo+5G/u03wGjbdy4q7pyzCe93DK9VJ7zkVmeg8LJ7GbgsiHWdR4xSoe4CAXRD7Bcjgbtr64bkXNg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-freebsd-x64": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.0.1.tgz",
      "integrity": "sha512-z/oBsREo46SsFqBwYtFe0kpJeBijAT48O/WXLI4suiCLBkr03RTtTJMCzSdDd2znlh8VJizL09XVkQgk8IZonw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm-gnueabihf": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.0.1.tgz",
      "integrity": "sha512-ik8q7GM11zxvYxFc2PeDcT6TBvhCQMaUxfph/M5l9sKuTs/Sjg3L+Byw0F7w0ZVLBZmx30P+gG0ECzzN+MFcmQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm64-gnu": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.0.1.tgz",
      "integrity": "sha512-QoSx2EkyrrdZ6kcyE8stqZ62t0Yra8Fs5ia9lOxJrh6TMQJK7gQKmscdTHf7pOXKREKrVwOtJcQG3qVSfc866A==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-arm64-musl": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.0.1.tgz",
      "integrity": "sha512-uwNwFpwKeNiZawfAWBgg0VIztPTV3ihhh1vV334h9ivnNLorxnQMU6Fz8wG1Zb4Qh9LC1/MkcyT3YlDXG3Rsgg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-ppc64-gnu": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.0.1.tgz",
      "integrity": "sha512-zY1bul7OWr7DFBiJ++wofXvnr8B45ce3QsQUhKrIhXsygAh7bTkwyeM1bi1a2g5C/yC/N8TZyGDEoMfm/l9mpg==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-s390x-gnu": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.0.1.tgz",
      "integrity": "sha512-0frlsT/f4Ft6I7SMESTKnF3cZsdicQn1dCMkF/jT9wDLE+gGoiQfv1nmT9e+s7s/fekvvy6tZM2jHvI2tkbJDQ==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-x64-gnu": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.0.1.tgz",
      "integrity": "sha512-XABVmGp9Tg0WspTVvwduTc4fpqy6JnAUrSQe6OuyqD/03nI7r0O9OWUkMIwFrjKAIqolvqoA4ZrJppgwE0Gxmw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-linux-x64-musl": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.0.1.tgz",
      "integrity": "sha512-bV4fzswuzVcKD90o/VM6QqKxnxlDq0g2BISDLNVmxrnhpv1DDbyPhCIjYfvzYLV+MvkKKnQt2Q6AO86SEBULUQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-openharmony-arm64": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.0.1.tgz",
      "integrity": "sha512-/Mh0Zhq3OP7fVs0kcQHZP6lZEthMGTaSf8UBQYSFEZDWGXXlEC+nJ6EqenaK2t4LBXMe3A+K/G2BVXXdtOr4PQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-wasm32-wasi": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-wasm32-wasi/-/binding-wasm32-wasi-1.0.1.tgz",
      "integrity": "sha512-+1xc9X45l8ufsBAm6Gjvx2qDRIY9lTVt0cgWNcJ+1gdhXvkbxePA60yRTwSTuXL09CMhyJmjpV7E3NoyxbqFQQ==",
      "cpu": [
        "wasm32"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/core": "1.10.0",
        "@emnapi/runtime": "1.10.0",
        "@napi-rs/wasm-runtime": "^1.1.4"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-win32-arm64-msvc": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.0.1.tgz",
      "integrity": "sha512-1D+UqZdfnuR+Jy1GgMJwi85bD40H21uNmOPRWQhw4oRSuolZ/B5rixZ45DK2KXOTCvmVCecauWgEhbw8bI7tOw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/binding-win32-x64-msvc": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.0.1.tgz",
      "integrity": "sha512-INAycaWuhlOK3wk4mRHGsdgwYWmd9cChdPdE9bwWmy6rn9VqVNYNFGhOdXrofXUxwHIncSiPNb8tNm8knDVIeQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "node_modules/@rolldown/pluginutils": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz",
      "integrity": "sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@tybys/wasm-util": {
      "version": "0.10.2",
      "resolved": "https://registry.npmjs.org/@tybys/wasm-util/-/wasm-util-0.10.2.tgz",
      "integrity": "sha512-RoBvJ2X0wuKlWFIjrwffGw1IqZHKQqzIchKaadZZfnNpsAYp2mM0h36JtPCjNDAHGgYez/15uMBpfGwchhiMgg==",
      "dev": true,
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/@types/d3": {
      "version": "7.4.3",
      "resolved": "https://registry.npmjs.org/@types/d3/-/d3-7.4.3.tgz",
      "integrity": "sha512-lZXZ9ckh5R8uiFVt8ogUNf+pIrK4EsWrx2Np75WvF/eTpJ0FMHNhjXk8CKEx/+gpHbNQyJWehbFaTvqmHWB3ww==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-array": "*",
        "@types/d3-axis": "*",
        "@types/d3-brush": "*",
        "@types/d3-chord": "*",
        "@types/d3-color": "*",
        "@types/d3-contour": "*",
        "@types/d3-delaunay": "*",
        "@types/d3-dispatch": "*",
        "@types/d3-drag": "*",
        "@types/d3-dsv": "*",
        "@types/d3-ease": "*",
        "@types/d3-fetch": "*",
        "@types/d3-force": "*",
        "@types/d3-format": "*",
        "@types/d3-geo": "*",
        "@types/d3-hierarchy": "*",
        "@types/d3-interpolate": "*",
        "@types/d3-path": "*",
        "@types/d3-polygon": "*",
        "@types/d3-quadtree": "*",
        "@types/d3-random": "*",
        "@types/d3-scale": "*",
        "@types/d3-scale-chromatic": "*",
        "@types/d3-selection": "*",
        "@types/d3-shape": "*",
        "@types/d3-time": "*",
        "@types/d3-time-format": "*",
        "@types/d3-timer": "*",
        "@types/d3-transition": "*",
        "@types/d3-zoom": "*"
      }
    },
    "node_modules/@types/d3-array": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/@types/d3-array/-/d3-array-3.2.2.tgz",
      "integrity": "sha512-hOLWVbm7uRza0BYXpIIW5pxfrKe0W+D5lrFiAEYR+pb6w3N2SwSMaJbXdUfSEv+dT4MfHBLtn5js0LAWaO6otw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-axis": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-axis/-/d3-axis-3.0.6.tgz",
      "integrity": "sha512-pYeijfZuBd87T0hGn0FO1vQ/cgLk6E1ALJjfkC0oJ8cbwkZl3TpgS8bVBLZN+2jjGgg38epgxb2zmoGtSfvgMw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-brush": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-brush/-/d3-brush-3.0.6.tgz",
      "integrity": "sha512-nH60IZNNxEcrh6L1ZSMNA28rj27ut/2ZmI3r96Zd+1jrZD++zD3LsMIjWlvg4AYrHn/Pqz4CF3veCxGjtbqt7A==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-chord": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-chord/-/d3-chord-3.0.6.tgz",
      "integrity": "sha512-LFYWWd8nwfwEmTZG9PfQxd17HbNPksHBiJHaKuY1XeqscXacsS2tyoo6OdRsjf+NQYeB6XrNL3a25E3gH69lcg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-color": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/@types/d3-color/-/d3-color-3.1.3.tgz",
      "integrity": "sha512-iO90scth9WAbmgv7ogoq57O9YpKmFBbmoEoCHDB2xMBY0+/KVrqAaCDyCE16dUspeOvIxFFRI+0sEtqDqy2b4A==",
      "license": "MIT"
    },
    "node_modules/@types/d3-contour": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-contour/-/d3-contour-3.0.6.tgz",
      "integrity": "sha512-BjzLgXGnCWjUSYGfH1cpdo41/hgdWETu4YxpezoztawmqsvCeep+8QGfiY6YbDvfgHz/DkjeIkkZVJavB4a3rg==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-array": "*",
        "@types/geojson": "*"
      }
    },
    "node_modules/@types/d3-delaunay": {
      "version": "6.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-delaunay/-/d3-delaunay-6.0.4.tgz",
      "integrity": "sha512-ZMaSKu4THYCU6sV64Lhg6qjf1orxBthaC161plr5KuPHo3CNm8DTHiLw/5Eq2b6TsNP0W0iJrUOFscY6Q450Hw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-dispatch": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-dispatch/-/d3-dispatch-3.0.7.tgz",
      "integrity": "sha512-5o9OIAdKkhN1QItV2oqaE5KMIiXAvDWBDPrD85e58Qlz1c1kI/J0NcqbEG88CoTwJrYe7ntUCVfeUl2UJKbWgA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-drag": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-drag/-/d3-drag-3.0.7.tgz",
      "integrity": "sha512-HE3jVKlzU9AaMazNufooRJ5ZpWmLIoc90A37WU2JMmeq28w1FQqCZswHZ3xR+SuxYftzHq6WU6KJHvqxKzTxxQ==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-dsv": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-dsv/-/d3-dsv-3.0.7.tgz",
      "integrity": "sha512-n6QBF9/+XASqcKK6waudgL0pf/S5XHPPI8APyMLLUHd8NqouBGLsU8MgtO7NINGtPBtk9Kko/W4ea0oAspwh9g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-ease": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-ease/-/d3-ease-3.0.2.tgz",
      "integrity": "sha512-NcV1JjO5oDzoK26oMzbILE6HW7uVXOHLQvHshBUW4UMdZGfiY6v5BeQwh9a9tCzv+CeefZQHJt5SRgK154RtiA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-fetch": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/@types/d3-fetch/-/d3-fetch-3.0.7.tgz",
      "integrity": "sha512-fTAfNmxSb9SOWNB9IoG5c8Hg6R+AzUHDRlsXsDZsNp6sxAEOP0tkP3gKkNSO/qmHPoBFTxNrjDprVHDQDvo5aA==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-dsv": "*"
      }
    },
    "node_modules/@types/d3-force": {
      "version": "3.0.10",
      "resolved": "https://registry.npmjs.org/@types/d3-force/-/d3-force-3.0.10.tgz",
      "integrity": "sha512-ZYeSaCF3p73RdOKcjj+swRlZfnYpK1EbaDiYICEEp5Q6sUiqFaFQ9qgoshp5CzIyyb/yD09kD9o2zEltCexlgw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-format": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-format/-/d3-format-3.0.4.tgz",
      "integrity": "sha512-fALi2aI6shfg7vM5KiR1wNJnZ7r6UuggVqtDA+xiEdPZQwy/trcQaHnwShLuLdta2rTymCNpxYTiMZX/e09F4g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-geo": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/@types/d3-geo/-/d3-geo-3.1.0.tgz",
      "integrity": "sha512-856sckF0oP/diXtS4jNsiQw/UuK5fQG8l/a9VVLeSouf1/PPbBE1i1W852zVwKwYCBkFJJB7nCFTbk6UMEXBOQ==",
      "license": "MIT",
      "dependencies": {
        "@types/geojson": "*"
      }
    },
    "node_modules/@types/d3-hierarchy": {
      "version": "3.1.7",
      "resolved": "https://registry.npmjs.org/@types/d3-hierarchy/-/d3-hierarchy-3.1.7.tgz",
      "integrity": "sha512-tJFtNoYBtRtkNysX1Xq4sxtjK8YgoWUNpIiUee0/jHGRwqvzYxkq0hGVbbOGSz+JgFxxRu4K8nb3YpG3CMARtg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-interpolate": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-interpolate/-/d3-interpolate-3.0.4.tgz",
      "integrity": "sha512-mgLPETlrpVV1YRJIglr4Ez47g7Yxjl1lj7YKsiMCb27VJH9W8NVM6Bb9d8kkpG/uAQS5AmbA48q2IAolKKo1MA==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-color": "*"
      }
    },
    "node_modules/@types/d3-path": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/@types/d3-path/-/d3-path-3.1.1.tgz",
      "integrity": "sha512-VMZBYyQvbGmWyWVea0EHs/BwLgxc+MKi1zLDCONksozI4YJMcTt8ZEuIR4Sb1MMTE8MMW49v0IwI5+b7RmfWlg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-polygon": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-polygon/-/d3-polygon-3.0.2.tgz",
      "integrity": "sha512-ZuWOtMaHCkN9xoeEMr1ubW2nGWsp4nIql+OPQRstu4ypeZ+zk3YKqQT0CXVe/PYqrKpZAi+J9mTs05TKwjXSRA==",
      "license": "MIT"
    },
    "node_modules/@types/d3-quadtree": {
      "version": "3.0.6",
      "resolved": "https://registry.npmjs.org/@types/d3-quadtree/-/d3-quadtree-3.0.6.tgz",
      "integrity": "sha512-oUzyO1/Zm6rsxKRHA1vH0NEDG58HrT5icx/azi9MF1TWdtttWl0UIUsjEQBBh+SIkrpd21ZjEv7ptxWys1ncsg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-random": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/@types/d3-random/-/d3-random-3.0.3.tgz",
      "integrity": "sha512-Imagg1vJ3y76Y2ea0871wpabqp613+8/r0mCLEBfdtqC7xMSfj9idOnmBYyMoULfHePJyxMAw3nWhJxzc+LFwQ==",
      "license": "MIT"
    },
    "node_modules/@types/d3-scale": {
      "version": "4.0.9",
      "resolved": "https://registry.npmjs.org/@types/d3-scale/-/d3-scale-4.0.9.tgz",
      "integrity": "sha512-dLmtwB8zkAeO/juAMfnV+sItKjlsw2lKdZVVy6LRr0cBmegxSABiLEpGVmSJJ8O08i4+sGR6qQtb6WtuwJdvVw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-time": "*"
      }
    },
    "node_modules/@types/d3-scale-chromatic": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/@types/d3-scale-chromatic/-/d3-scale-chromatic-3.1.0.tgz",
      "integrity": "sha512-iWMJgwkK7yTRmWqRB5plb1kadXyQ5Sj8V/zYlFGMUBbIPKQScw+Dku9cAAMgJG+z5GYDoMjWGLVOvjghDEFnKQ==",
      "license": "MIT"
    },
    "node_modules/@types/d3-selection": {
      "version": "3.0.11",
      "resolved": "https://registry.npmjs.org/@types/d3-selection/-/d3-selection-3.0.11.tgz",
      "integrity": "sha512-bhAXu23DJWsrI45xafYpkQ4NtcKMwWnAC/vKrd2l+nxMFuvOT3XMYTIj2opv8vq8AO5Yh7Qac/nSeP/3zjTK0w==",
      "license": "MIT"
    },
    "node_modules/@types/d3-shape": {
      "version": "3.1.8",
      "resolved": "https://registry.npmjs.org/@types/d3-shape/-/d3-shape-3.1.8.tgz",
      "integrity": "sha512-lae0iWfcDeR7qt7rA88BNiqdvPS5pFVPpo5OfjElwNaT2yyekbM0C9vK+yqBqEmHr6lDkRnYNoTBYlAgJa7a4w==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-path": "*"
      }
    },
    "node_modules/@types/d3-time": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/d3-time/-/d3-time-3.0.4.tgz",
      "integrity": "sha512-yuzZug1nkAAaBlBBikKZTgzCeA+k1uy4ZFwWANOfKw5z5LRhV0gNA7gNkKm7HoK+HRN0wX3EkxGk0fpbWhmB7g==",
      "license": "MIT"
    },
    "node_modules/@types/d3-time-format": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/@types/d3-time-format/-/d3-time-format-4.0.3.tgz",
      "integrity": "sha512-5xg9rC+wWL8kdDj153qZcsJ0FWiFt0J5RB6LYUNZjwSnesfblqrI/bJ1wBdJ8OQfncgbJG5+2F+qfqnqyzYxyg==",
      "license": "MIT"
    },
    "node_modules/@types/d3-timer": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/@types/d3-timer/-/d3-timer-3.0.2.tgz",
      "integrity": "sha512-Ps3T8E8dZDam6fUyNiMkekK3XUsaUEik+idO9/YjPtfj2qruF8tFBXS7XhtE4iIXBLxhmLjP3SXpLhVf21I9Lw==",
      "license": "MIT"
    },
    "node_modules/@types/d3-transition": {
      "version": "3.0.9",
      "resolved": "https://registry.npmjs.org/@types/d3-transition/-/d3-transition-3.0.9.tgz",
      "integrity": "sha512-uZS5shfxzO3rGlu0cC3bjmMFKsXv+SmZZcgp0KD22ts4uGXp5EVYGzu/0YdwZeKmddhcAccYtREJKkPfXkZuCg==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/d3-zoom": {
      "version": "3.0.8",
      "resolved": "https://registry.npmjs.org/@types/d3-zoom/-/d3-zoom-3.0.8.tgz",
      "integrity": "sha512-iqMC4/YlFCSlO8+2Ii1GGGliCAY4XdeG748w5vQUbevlbDu0zSjH/+jojorQVBK/se0j6DUFNPBGSqD3YWYnDw==",
      "license": "MIT",
      "dependencies": {
        "@types/d3-interpolate": "*",
        "@types/d3-selection": "*"
      }
    },
    "node_modules/@types/esrecurse": {
      "version": "4.3.1",
      "resolved": "https://registry.npmjs.org/@types/esrecurse/-/esrecurse-4.3.1.tgz",
      "integrity": "sha512-xJBAbDifo5hpffDBuHl0Y8ywswbiAp/Wi7Y/GtAgSlZyIABppyurxVueOPE8LUQOxdlgi6Zqce7uoEpqNTeiUw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/estree": {
      "version": "1.0.9",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
      "integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/geojson": {
      "version": "7946.0.16",
      "resolved": "https://registry.npmjs.org/@types/geojson/-/geojson-7946.0.16.tgz",
      "integrity": "sha512-6C8nqWur3j98U6+lXDfTUWIfgvZU+EumvpHKcYjujKH7woYyLj2sUmff0tRhrqM7BohUw7Pz3ZB1jj2gW9Fvmg==",
      "license": "MIT"
    },
    "node_modules/@types/json-schema": {
      "version": "7.0.15",
      "resolved": "https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz",
      "integrity": "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/node": {
      "version": "24.12.4",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-24.12.4.tgz",
      "integrity": "sha512-GUUEShf+PBCGW2KaXwcIt3Yk+e3pkKwWKb9GSyM9WQVE+ep2jzmHdGsHzu4wgcZy5fN9FBdVzjpBQsYlpfpgLA==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "undici-types": "~7.16.0"
      }
    },
    "node_modules/@types/react": {
      "version": "19.2.14",
      "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.14.tgz",
      "integrity": "sha512-ilcTH/UniCkMdtexkoCN0bI7pMcJDvmQFPvuPvmEaYA/NSfFTAgdUSLAoVjaRJm7+6PvcM+q1zYOwS4wTYMF9w==",
      "devOptional": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "csstype": "^3.2.2"
      }
    },
    "node_modules/@types/react-dom": {
      "version": "19.2.3",
      "resolved": "https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.3.tgz",
      "integrity": "sha512-jp2L/eY6fn+KgVVQAOqYItbF0VY/YApe5Mz2F0aykSO8gx31bYCZyvSeYxCHKvzHG5eZjc+zyaS5BrBWya2+kQ==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "@types/react": "^19.2.0"
      }
    },
    "node_modules/@typescript-eslint/eslint-plugin": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.59.4.tgz",
      "integrity": "sha512-PegsU+XfyJJNjd4+u/k6f9yTyp0lEXXiPopUNobZcIAUJFGICFLN+sP0Rb3JehVmiij1Ph0dFGYqODoRo/2+6A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/regexpp": "^4.12.2",
        "@typescript-eslint/scope-manager": "8.59.4",
        "@typescript-eslint/type-utils": "8.59.4",
        "@typescript-eslint/utils": "8.59.4",
        "@typescript-eslint/visitor-keys": "8.59.4",
        "ignore": "^7.0.5",
        "natural-compare": "^1.4.0",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "@typescript-eslint/parser": "^8.59.4",
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore": {
      "version": "7.0.5",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.5.tgz",
      "integrity": "sha512-Hs59xBNfUIunMFgWAbGX5cq6893IbWg4KnrjbYwX3tx0ztorVgTDA6B2sxf8ejHJ4wz8BqGUMYlnzNBer5NvGg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/@typescript-eslint/parser": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.59.4.tgz",
      "integrity": "sha512-zORHqO/tuhxY1zWuTvMUqddRxpiFJ72xVfcNoWpqdLjs6lfPbuQBJuW4pk+49/uBMy7Ssr4bzgjiKmmDB1UbZQ==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@typescript-eslint/scope-manager": "8.59.4",
        "@typescript-eslint/types": "8.59.4",
        "@typescript-eslint/typescript-estree": "8.59.4",
        "@typescript-eslint/visitor-keys": "8.59.4",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/project-service": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.59.4.tgz",
      "integrity": "sha512-Ly00Vu4oAacfDeHp2Zg85ioNG6l8HG+tN1D7J+xTHSxu9y0awYKJ2zH1rFBn8ZSfuGK+7FxK3Cgl3uAz0aZZLg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/tsconfig-utils": "^8.59.4",
        "@typescript-eslint/types": "^8.59.4",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/scope-manager": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.59.4.tgz",
      "integrity": "sha512-mUeR/3H1WrTAddJrwut8OoPjfauaztMQmRwV5fQTUyNVJCLiUXXe4lGEyYIL2oFDpP7UtgbGJXCt72wT0z2S3Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.59.4",
        "@typescript-eslint/visitor-keys": "8.59.4"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@typescript-eslint/tsconfig-utils": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.59.4.tgz",
      "integrity": "sha512-DLCpnKgD4alVxTBSKulK+gU1KCqOgUXfDRDXh2mZgzokQKa/70ax93I2uVO3m/LLvIAtWZIFoiifudmIqAxpMA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/type-utils": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.59.4.tgz",
      "integrity": "sha512-uonTuPAAKr9XaBGqJ3LjYTh72zy5DyGesljO9gtmk/eFW0W1fRHjnwVYKB35Lm8d5Q5CluEW3gPHjTvZTmgrfA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.59.4",
        "@typescript-eslint/typescript-estree": "8.59.4",
        "@typescript-eslint/utils": "8.59.4",
        "debug": "^4.4.3",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/types": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/types/-/types-8.59.4.tgz",
      "integrity": "sha512-F1o7WJcCq+bc8dwcO/YsSEOudAH8RDtaOhM6wcAQhcUsFhnWQl81JKy48q1hoxAU0qrzM89+31GYh1515Zde3Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@typescript-eslint/typescript-estree": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.59.4.tgz",
      "integrity": "sha512-F+RuOmcDXo4+TPdfd/TCLS3m2nw8gE9XXyZLrA3JBfaA5tz9TtdkyD3YJFmPxulyc2cKbEok/CvFE3MgSLWnag==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/project-service": "8.59.4",
        "@typescript-eslint/tsconfig-utils": "8.59.4",
        "@typescript-eslint/types": "8.59.4",
        "@typescript-eslint/visitor-keys": "8.59.4",
        "debug": "^4.4.3",
        "minimatch": "^10.2.2",
        "semver": "^7.7.3",
        "tinyglobby": "^0.2.15",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/typescript-estree/node_modules/semver": {
      "version": "7.8.0",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.0.tgz",
      "integrity": "sha512-AcM7dV/5ul4EekoQ29Agm5vri8JNqRyj39o0qpX6vDF2GZrtutZl5RwgD1XnZjiTAfncsJhMI48QQH3sN87YNA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/@typescript-eslint/utils": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.59.4.tgz",
      "integrity": "sha512-cYXeNAUsG4lJo5dbc1FcKm+JwIWrj1/UpTORsC6tGMjEZ81DYcvIr9/ueikhMa/Y/gDQYGp+YX9/xQrXje5BJw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.9.1",
        "@typescript-eslint/scope-manager": "8.59.4",
        "@typescript-eslint/types": "8.59.4",
        "@typescript-eslint/typescript-estree": "8.59.4"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/@typescript-eslint/visitor-keys": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.59.4.tgz",
      "integrity": "sha512-U3gxVaDVnuZKhSspW/MzMxE1kq7zOdc072FcSNoqA1I9p8HyKbBFfEHoWckBAMgNMph4MamwS5iTVzFmrnt8TQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.59.4",
        "eslint-visitor-keys": "^5.0.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "node_modules/@vitejs/plugin-react": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-6.0.2.tgz",
      "integrity": "sha512-DlSMqo4WhThw4vB8Mpn0Woe9J+Jfq1geJ61AKW0QEgLzGMNwtIMdxbDUzLxcun8W7NbJO0e2Jg/Nxm3cCSVzzg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@rolldown/pluginutils": "^1.0.0"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "peerDependencies": {
        "@rolldown/plugin-babel": "^0.1.7 || ^0.2.0",
        "babel-plugin-react-compiler": "^1.0.0",
        "vite": "^8.0.0"
      },
      "peerDependenciesMeta": {
        "@rolldown/plugin-babel": {
          "optional": true
        },
        "babel-plugin-react-compiler": {
          "optional": true
        }
      }
    },
    "node_modules/acorn": {
      "version": "8.16.0",
      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.16.0.tgz",
      "integrity": "sha512-UVJyE9MttOsBQIDKw1skb9nAwQuR5wuGD3+82K6JgJlm/Y+KI92oNsMNGZCYdDsVtRHSak0pcV5Dno5+4jh9sw==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "bin": {
        "acorn": "bin/acorn"
      },
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/acorn-jsx": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz",
      "integrity": "sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "acorn": "^6.0.0 || ^7.0.0 || ^8.0.0"
      }
    },
    "node_modules/agent-base": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "4"
      },
      "engines": {
        "node": ">= 6.0.0"
      }
    },
    "node_modules/ajv": {
      "version": "6.15.0",
      "resolved": "https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz",
      "integrity": "sha512-fgFx7Hfoq60ytK2c7DhnF8jIvzYgOMxfugjLOSMHjLIPgenqa7S7oaagATUq99mV6IYvN2tRmC0wnTYX6iPbMw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fast-deep-equal": "^3.1.1",
        "fast-json-stable-stringify": "^2.0.0",
        "json-schema-traverse": "^0.4.1",
        "uri-js": "^4.2.2"
      },
      "funding": {
        "type": "github",
        "url": "https://github.com/sponsors/epoberezkin"
      }
    },
    "node_modules/asynckit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz",
      "integrity": "sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==",
      "license": "MIT"
    },
    "node_modules/axios": {
      "version": "1.16.1",
      "resolved": "https://registry.npmjs.org/axios/-/axios-1.16.1.tgz",
      "integrity": "sha512-caYkukvroVPO8KrzuJEb50Hm07KwfBZPEC3VeFHTsqWHvKTsy54hjJz9BS/cdaypROE2rH6xvm9mHX4fgWkr3A==",
      "license": "MIT",
      "dependencies": {
        "follow-redirects": "^1.16.0",
        "form-data": "^4.0.5",
        "https-proxy-agent": "^5.0.1",
        "proxy-from-env": "^2.1.0"
      }
    },
    "node_modules/balanced-match": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz",
      "integrity": "sha512-BLrgEcRTwX2o6gGxGOCNyMvGSp35YofuYzw9h1IMTRmKqttAZZVU67bdb9Pr2vUHA8+j3i2tJfjO6C6+4myGTA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "18 || 20 || >=22"
      }
    },
    "node_modules/baseline-browser-mapping": {
      "version": "2.10.31",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.10.31.tgz",
      "integrity": "sha512-MujYO3eP72uvmSE0i4wltsodRfIpZATP3jvzRNRGGxgzId7aVocVJJV3nf01qnzzKFGxQVC9bpWxl5cjxTr/7Q==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.cjs"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/brace-expansion": {
      "version": "5.0.6",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.6.tgz",
      "integrity": "sha512-kLpxurY4Z4r9sgMsyG0Z9uzsBlgiU/EFKhj/h91/8yHu0edo7XuixOIH3VcJ8kkxs6/jPzoI6U9Vj3WqbMQ94g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^4.0.2"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      }
    },
    "node_modules/browserslist": {
      "version": "4.28.2",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.28.2.tgz",
      "integrity": "sha512-48xSriZYYg+8qXna9kwqjIVzuQxi+KYWp2+5nCYnYKPTr0LvD89Jqk2Or5ogxz0NUMfIjhh2lIUX/LyX9B4oIg==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "baseline-browser-mapping": "^2.10.12",
        "caniuse-lite": "^1.0.30001782",
        "electron-to-chromium": "^1.5.328",
        "node-releases": "^2.0.36",
        "update-browserslist-db": "^1.2.3"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/caniuse-lite": {
      "version": "1.0.30001793",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001793.tgz",
      "integrity": "sha512-iwSsYWaCOoh26cV8NwNRViHlrfUvYsHDfRVcbtmw0Kg6PJIZZXwMkj1442FYLBGkeUf1juAsU3DTfxW579mrPA==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "node_modules/combined-stream": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz",
      "integrity": "sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==",
      "license": "MIT",
      "dependencies": {
        "delayed-stream": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/commander": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/commander/-/commander-7.2.0.tgz",
      "integrity": "sha512-QrWXB+ZQSVPmIWIhtEO9H+gwHaMGYiF5ChvoJ+K9ZGHG/sVsa6yiesAD1GC/x46sET00Xlwo1u49RVVVzvcSkw==",
      "license": "MIT",
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/convert-source-map": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/csstype": {
      "version": "3.2.3",
      "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
      "integrity": "sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==",
      "devOptional": true,
      "license": "MIT"
    },
    "node_modules/d3": {
      "version": "7.9.0",
      "resolved": "https://registry.npmjs.org/d3/-/d3-7.9.0.tgz",
      "integrity": "sha512-e1U46jVP+w7Iut8Jt8ri1YsPOvFpg46k+K8TpCb0P+zjCkjkPnV7WzfDJzMHy1LnA+wj5pLT1wjO901gLXeEhA==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "3",
        "d3-axis": "3",
        "d3-brush": "3",
        "d3-chord": "3",
        "d3-color": "3",
        "d3-contour": "4",
        "d3-delaunay": "6",
        "d3-dispatch": "3",
        "d3-drag": "3",
        "d3-dsv": "3",
        "d3-ease": "3",
        "d3-fetch": "3",
        "d3-force": "3",
        "d3-format": "3",
        "d3-geo": "3",
        "d3-hierarchy": "3",
        "d3-interpolate": "3",
        "d3-path": "3",
        "d3-polygon": "3",
        "d3-quadtree": "3",
        "d3-random": "3",
        "d3-scale": "4",
        "d3-scale-chromatic": "3",
        "d3-selection": "3",
        "d3-shape": "3",
        "d3-time": "3",
        "d3-time-format": "4",
        "d3-timer": "3",
        "d3-transition": "3",
        "d3-zoom": "3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-array": {
      "version": "3.2.4",
      "resolved": "https://registry.npmjs.org/d3-array/-/d3-array-3.2.4.tgz",
      "integrity": "sha512-tdQAmyA18i4J7wprpYq8ClcxZy3SC31QMeByyCFyRt7BVHdREQZ5lpzoe5mFEYZUWe+oq8HBvk9JjpibyEV4Jg==",
      "license": "ISC",
      "dependencies": {
        "internmap": "1 - 2"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-axis": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-axis/-/d3-axis-3.0.0.tgz",
      "integrity": "sha512-IH5tgjV4jE/GhHkRV0HiVYPDtvfjHQlQfJHs0usq7M30XcSBvOotpmH1IgkcXsO/5gEQZD43B//fc7SRT5S+xw==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-brush": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-brush/-/d3-brush-3.0.0.tgz",
      "integrity": "sha512-ALnjWlVYkXsVIGlOsuWH1+3udkYFI48Ljihfnh8FZPF2QS9o+PzGLBslO0PjzVoHLZ2KCVgAM8NVkXPJB2aNnQ==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-drag": "2 - 3",
        "d3-interpolate": "1 - 3",
        "d3-selection": "3",
        "d3-transition": "3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-chord": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-chord/-/d3-chord-3.0.1.tgz",
      "integrity": "sha512-VE5S6TNa+j8msksl7HwjxMHDM2yNK3XCkusIlpX5kwauBfXuyLAtNg9jCp/iHH61tgI4sb6R/EIMWCqEIdjT/g==",
      "license": "ISC",
      "dependencies": {
        "d3-path": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-color": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-color/-/d3-color-3.1.0.tgz",
      "integrity": "sha512-zg/chbXyeBtMQ1LbD/WSoW2DpC3I0mpmPdW+ynRTj/x2DAWYrIY7qeZIHidozwV24m4iavr15lNwIwLxRmOxhA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-contour": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/d3-contour/-/d3-contour-4.0.2.tgz",
      "integrity": "sha512-4EzFTRIikzs47RGmdxbeUvLWtGedDUNkTcmzoeyg4sP/dvCexO47AaQL7VKy/gul85TOxw+IBgA8US2xwbToNA==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "^3.2.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-delaunay": {
      "version": "6.0.4",
      "resolved": "https://registry.npmjs.org/d3-delaunay/-/d3-delaunay-6.0.4.tgz",
      "integrity": "sha512-mdjtIZ1XLAM8bm/hx3WwjfHt6Sggek7qH043O8KEjDXN40xi3vx/6pYSVTwLjEgiXQTbvaouWKynLBiUZ6SK6A==",
      "license": "ISC",
      "dependencies": {
        "delaunator": "5"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-dispatch": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-dispatch/-/d3-dispatch-3.0.1.tgz",
      "integrity": "sha512-rzUyPU/S7rwUflMyLc1ETDeBj0NRuHKKAcvukozwhshr6g6c5d8zh4c2gQjY2bZ0dXeGLWc1PF174P2tVvKhfg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-drag": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-drag/-/d3-drag-3.0.0.tgz",
      "integrity": "sha512-pWbUJLdETVA8lQNJecMxoXfH6x+mO2UQo8rSmZ+QqxcbyA3hfeprFgIT//HW2nlHChWeIIMwS2Fq+gEARkhTkg==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-selection": "3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-dsv": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-dsv/-/d3-dsv-3.0.1.tgz",
      "integrity": "sha512-UG6OvdI5afDIFP9w4G0mNq50dSOsXHJaRE8arAS5o9ApWnIElp8GZw1Dun8vP8OyHOZ/QJUKUJwxiiCCnUwm+Q==",
      "license": "ISC",
      "dependencies": {
        "commander": "7",
        "iconv-lite": "0.6",
        "rw": "1"
      },
      "bin": {
        "csv2json": "bin/dsv2json.js",
        "csv2tsv": "bin/dsv2dsv.js",
        "dsv2dsv": "bin/dsv2dsv.js",
        "dsv2json": "bin/dsv2json.js",
        "json2csv": "bin/json2dsv.js",
        "json2dsv": "bin/json2dsv.js",
        "json2tsv": "bin/json2dsv.js",
        "tsv2csv": "bin/dsv2dsv.js",
        "tsv2json": "bin/dsv2json.js"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-ease": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-ease/-/d3-ease-3.0.1.tgz",
      "integrity": "sha512-wR/XK3D3XcLIZwpbvQwQ5fK+8Ykds1ip7A2Txe0yxncXSdq1L9skcG7blcedkOX+ZcgxGAmLX1FrRGbADwzi0w==",
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-fetch": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-fetch/-/d3-fetch-3.0.1.tgz",
      "integrity": "sha512-kpkQIM20n3oLVBKGg6oHrUchHM3xODkTzjMoj7aWQFq5QEM+R6E4WkzT5+tojDY7yjez8KgCBRoj4aEr99Fdqw==",
      "license": "ISC",
      "dependencies": {
        "d3-dsv": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-force": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-force/-/d3-force-3.0.0.tgz",
      "integrity": "sha512-zxV/SsA+U4yte8051P4ECydjD/S+qeYtnaIyAs9tgHCqfguma/aAQDjo85A9Z6EKhBirHRJHXIgJUlffT4wdLg==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-quadtree": "1 - 3",
        "d3-timer": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-format": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/d3-format/-/d3-format-3.1.2.tgz",
      "integrity": "sha512-AJDdYOdnyRDV5b6ArilzCPPwc1ejkHcoyFarqlPqT7zRYjhavcT3uSrqcMvsgh2CgoPbK3RCwyHaVyxYcP2Arg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-geo": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/d3-geo/-/d3-geo-3.1.1.tgz",
      "integrity": "sha512-637ln3gXKXOwhalDzinUgY83KzNWZRKbYubaG+fGVuc/dxO64RRljtCTnf5ecMyE1RIdtqpkVcq0IbtU2S8j2Q==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "2.5.0 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-hierarchy": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/d3-hierarchy/-/d3-hierarchy-3.1.2.tgz",
      "integrity": "sha512-FX/9frcub54beBdugHjDCdikxThEqjnR93Qt7PvQTOHxyiNCAlvMrHhclk3cD5VeAaq9fxmfRp+CnWw9rEMBuA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-interpolate": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-interpolate/-/d3-interpolate-3.0.1.tgz",
      "integrity": "sha512-3bYs1rOD33uo8aqJfKP3JWPAibgw8Zm2+L9vBKEHJ2Rg+viTR7o5Mmv5mZcieN+FRYaAOWX5SJATX6k1PWz72g==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-path": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-path/-/d3-path-3.1.0.tgz",
      "integrity": "sha512-p3KP5HCf/bvjBSSKuXid6Zqijx7wIfNW+J/maPs+iwR35at5JCbLUT0LzF1cnjbCHWhqzQTIN2Jpe8pRebIEFQ==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-polygon": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-polygon/-/d3-polygon-3.0.1.tgz",
      "integrity": "sha512-3vbA7vXYwfe1SYhED++fPUQlWSYTTGmFmQiany/gdbiWgU/iEyQzyymwL9SkJjFFuCS4902BSzewVGsHHmHtXg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-quadtree": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-quadtree/-/d3-quadtree-3.0.1.tgz",
      "integrity": "sha512-04xDrxQTDTCFwP5H6hRhsRcb9xxv2RzkcsygFzmkSIOJy3PeRJP7sNk3VRIbKXcog561P9oU0/rVH6vDROAgUw==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-random": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-random/-/d3-random-3.0.1.tgz",
      "integrity": "sha512-FXMe9GfxTxqd5D6jFsQ+DJ8BJS4E/fT5mqqdjovykEB2oFbTMDVdg1MGFxfQW+FBOGoB++k8swBrgwSHT1cUXQ==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-scale": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/d3-scale/-/d3-scale-4.0.2.tgz",
      "integrity": "sha512-GZW464g1SH7ag3Y7hXjf8RoUuAFIqklOAq3MRl4OaWabTFJY9PN/E1YklhXLh+OQ3fM9yS2nOkCoS+WLZ6kvxQ==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "2.10.0 - 3",
        "d3-format": "1 - 3",
        "d3-interpolate": "1.2.0 - 3",
        "d3-time": "2.1.1 - 3",
        "d3-time-format": "2 - 4"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-scale-chromatic": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-scale-chromatic/-/d3-scale-chromatic-3.1.0.tgz",
      "integrity": "sha512-A3s5PWiZ9YCXFye1o246KoscMWqf8BsD9eRiJ3He7C9OBaxKhAd5TFCdEx/7VbKtxxTsu//1mMJFrEt572cEyQ==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3",
        "d3-interpolate": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-selection": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-selection/-/d3-selection-3.0.0.tgz",
      "integrity": "sha512-fmTRWbNMmsmWq6xJV8D19U/gw/bwrHfNXxrIN+HfZgnzqTHp9jOmKMhsTUjXOJnZOdZY9Q28y4yebKzqDKlxlQ==",
      "license": "ISC",
      "peer": true,
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-shape": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/d3-shape/-/d3-shape-3.2.0.tgz",
      "integrity": "sha512-SaLBuwGm3MOViRq2ABk3eLoxwZELpH6zhl3FbAoJ7Vm1gofKx6El1Ib5z23NUEhF9AsGl7y+dzLe5Cw2AArGTA==",
      "license": "ISC",
      "dependencies": {
        "d3-path": "^3.1.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-time": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/d3-time/-/d3-time-3.1.0.tgz",
      "integrity": "sha512-VqKjzBLejbSMT4IgbmVgDjpkYrNWUYJnbCGo874u7MMKIWsILRX+OpX/gTk8MqjpT1A/c6HY2dCA77ZN0lkQ2Q==",
      "license": "ISC",
      "dependencies": {
        "d3-array": "2 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-time-format": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/d3-time-format/-/d3-time-format-4.1.0.tgz",
      "integrity": "sha512-dJxPBlzC7NugB2PDLwo9Q8JiTR3M3e4/XANkreKSUxF8vvXKqm1Yfq4Q5dl8budlunRVlUUaDUgFt7eA8D6NLg==",
      "license": "ISC",
      "dependencies": {
        "d3-time": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-timer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-timer/-/d3-timer-3.0.1.tgz",
      "integrity": "sha512-ndfJ/JxxMd3nw31uyKoY2naivF+r29V+Lc0svZxe1JvvIRmi8hUsrMvdOwgS1o6uBHmiz91geQ0ylPP0aj1VUA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/d3-transition": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/d3-transition/-/d3-transition-3.0.1.tgz",
      "integrity": "sha512-ApKvfjsSR6tg06xrL434C0WydLr7JewBB3V+/39RMHsaXTOG0zmt/OAXeng5M5LBm0ojmxJrpomQVZ1aPvBL4w==",
      "license": "ISC",
      "dependencies": {
        "d3-color": "1 - 3",
        "d3-dispatch": "1 - 3",
        "d3-ease": "1 - 3",
        "d3-interpolate": "1 - 3",
        "d3-timer": "1 - 3"
      },
      "engines": {
        "node": ">=12"
      },
      "peerDependencies": {
        "d3-selection": "2 - 3"
      }
    },
    "node_modules/d3-zoom": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/d3-zoom/-/d3-zoom-3.0.0.tgz",
      "integrity": "sha512-b8AmV3kfQaqWAuacbPuNbL6vahnOJflOhexLzMMNLga62+/nh0JzvJ0aO/5a5MVgUFGS7Hu1P9P03o3fJkDCyw==",
      "license": "ISC",
      "dependencies": {
        "d3-dispatch": "1 - 3",
        "d3-drag": "2 - 3",
        "d3-interpolate": "1 - 3",
        "d3-selection": "2 - 3",
        "d3-transition": "2 - 3"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/deep-is": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz",
      "integrity": "sha512-oIPzksmTg4/MriiaYGO+okXDT7ztn/w3Eptv/+gSIdMdKsJo0u4CfYNFJPy+4SKMuCqGw2wxnA+URMg3t8a/bQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/delaunator": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/delaunator/-/delaunator-5.1.0.tgz",
      "integrity": "sha512-AGrQ4QSgssa1NGmWmLPqN5NY2KajF5MqxetNEO+o0n3ZwZZeTmt7bBnvzHWrmkZFxGgr4HdyFgelzgi06otLuQ==",
      "license": "ISC",
      "dependencies": {
        "robust-predicates": "^3.0.2"
      }
    },
    "node_modules/delayed-stream": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
      "integrity": "sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==",
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/electron-to-chromium": {
      "version": "1.5.359",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.359.tgz",
      "integrity": "sha512-8lPELWuYZIWk7NDvCNthtmMw/7Q5Wu25NpM4djFMHBmk8DubPAtL4YTOp7ou0e7HyJtwkVlWv8XMLURnrtgJQw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",
      "integrity": "sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-set-tostringtag": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
      "integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.6",
        "has-tostringtag": "^1.0.2",
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-string-regexp": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
      "integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/eslint": {
      "version": "10.4.0",
      "resolved": "https://registry.npmjs.org/eslint/-/eslint-10.4.0.tgz",
      "integrity": "sha512-loXy6bWOoP3EP6JA7jo6p5jMpBJmHmsNZM5SFRHLdh1MGOPurMnNBj4ZlAbaqUAaQWbCr7jHV4P7gzAyryZWkQ==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.8.0",
        "@eslint-community/regexpp": "^4.12.2",
        "@eslint/config-array": "^0.23.5",
        "@eslint/config-helpers": "^0.6.0",
        "@eslint/core": "^1.2.1",
        "@eslint/plugin-kit": "^0.7.1",
        "@humanfs/node": "^0.16.6",
        "@humanwhocodes/module-importer": "^1.0.1",
        "@humanwhocodes/retry": "^0.4.2",
        "@types/estree": "^1.0.6",
        "ajv": "^6.14.0",
        "cross-spawn": "^7.0.6",
        "debug": "^4.3.2",
        "escape-string-regexp": "^4.0.0",
        "eslint-scope": "^9.1.2",
        "eslint-visitor-keys": "^5.0.1",
        "espree": "^11.2.0",
        "esquery": "^1.7.0",
        "esutils": "^2.0.2",
        "fast-deep-equal": "^3.1.3",
        "file-entry-cache": "^8.0.0",
        "find-up": "^5.0.0",
        "glob-parent": "^6.0.2",
        "ignore": "^5.2.0",
        "imurmurhash": "^0.1.4",
        "is-glob": "^4.0.0",
        "json-stable-stringify-without-jsonify": "^1.0.1",
        "minimatch": "^10.2.4",
        "natural-compare": "^1.4.0",
        "optionator": "^0.9.3"
      },
      "bin": {
        "eslint": "bin/eslint.js"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "jiti": "*"
      },
      "peerDependenciesMeta": {
        "jiti": {
          "optional": true
        }
      }
    },
    "node_modules/eslint-plugin-react-hooks": {
      "version": "7.1.1",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-hooks/-/eslint-plugin-react-hooks-7.1.1.tgz",
      "integrity": "sha512-f2I7Gw6JbvCexzIInuSbZpfdQ44D7iqdWX01FKLvrPgqxoE7oMj8clOfto8U6vYiz4yd5oKu39rRSVOe1zRu0g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.24.4",
        "@babel/parser": "^7.24.4",
        "hermes-parser": "^0.25.1",
        "zod": "^3.25.0 || ^4.0.0",
        "zod-validation-error": "^3.5.0 || ^4.0.0"
      },
      "engines": {
        "node": ">=18"
      },
      "peerDependencies": {
        "eslint": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0 || ^10.0.0"
      }
    },
    "node_modules/eslint-plugin-react-refresh": {
      "version": "0.5.2",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-refresh/-/eslint-plugin-react-refresh-0.5.2.tgz",
      "integrity": "sha512-hmgTH57GfzoTFjVN0yBwTggnsVUF2tcqi7RJZHqi9lIezSs4eFyAMktA68YD4r5kNw1mxyY4dmkyoFDb3FIqrA==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "eslint": "^9 || ^10"
      }
    },
    "node_modules/eslint-scope": {
      "version": "9.1.2",
      "resolved": "https://registry.npmjs.org/eslint-scope/-/eslint-scope-9.1.2.tgz",
      "integrity": "sha512-xS90H51cKw0jltxmvmHy2Iai1LIqrfbw57b79w/J7MfvDfkIkFZ+kj6zC3BjtUwh150HsSSdxXZcsuv72miDFQ==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "@types/esrecurse": "^4.3.1",
        "@types/estree": "^1.0.8",
        "esrecurse": "^4.3.0",
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/eslint-visitor-keys": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-5.0.1.tgz",
      "integrity": "sha512-tD40eHxA35h0PEIZNeIjkHoDR4YjjJp34biM0mDvplBe//mB+IHCqHDGV7pxF+7MklTvighcCPPZC7ynWyjdTA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/espree": {
      "version": "11.2.0",
      "resolved": "https://registry.npmjs.org/espree/-/espree-11.2.0.tgz",
      "integrity": "sha512-7p3DrVEIopW1B1avAGLuCSh1jubc01H2JHc8B4qqGblmg5gI9yumBgACjWo4JlIc04ufug4xJ3SQI8HkS/Rgzw==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "acorn": "^8.16.0",
        "acorn-jsx": "^5.3.2",
        "eslint-visitor-keys": "^5.0.1"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://opencollective.com/eslint"
      }
    },
    "node_modules/esquery": {
      "version": "1.7.0",
      "resolved": "https://registry.npmjs.org/esquery/-/esquery-1.7.0.tgz",
      "integrity": "sha512-Ap6G0WQwcU/LHsvLwON1fAQX9Zp0A2Y6Y/cJBl9r/JbW90Zyg4/zbG6zzKa2OTALELarYHmKu0GhpM5EO+7T0g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "estraverse": "^5.1.0"
      },
      "engines": {
        "node": ">=0.10"
      }
    },
    "node_modules/esrecurse": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz",
      "integrity": "sha512-KmfKL3b6G+RXvP8N1vr3Tq1kL/oCFgn2NYXEtqP8/L3pKapUA4G8cFVaoF3SU323CD4XypR/ffioHmkti6/Tag==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "estraverse": "^5.2.0"
      },
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/estraverse": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz",
      "integrity": "sha512-MMdARuVEQziNTeJD8DgMqmhwR11BRQ/cBP+pLtYdSTnf3MIO8fFeiINEbX36ZdNlfU/7A9f3gUw49B3oQsvwBA==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/esutils": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
      "integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
      "dev": true,
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/fast-deep-equal": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
      "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-json-stable-stringify": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
      "integrity": "sha512-lhd/wF+Lk98HZoTCtlVraHtfh5XYijIjalXck7saUtuanSDyLMxnHhSXEDJqHxD7msR8D0uCmqlkwjCV8xvwHw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fast-levenshtein": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz",
      "integrity": "sha512-DCXu6Ifhqcks7TZKY3Hxp3y6qphY5SJZmrWMDrKcERSOXWQdMhU9Ig/PYrzyw/ul9jOIyh0N4M0tbC5hodg8dw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/file-entry-cache": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz",
      "integrity": "sha512-XXTUwCvisa5oacNGRP9SfNtYBNAMi+RPwBFmblZEF7N7swHYQS6/Zfk7SRwx4D5j3CH211YNRco1DEMNVfZCnQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flat-cache": "^4.0.0"
      },
      "engines": {
        "node": ">=16.0.0"
      }
    },
    "node_modules/find-up": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
      "integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "locate-path": "^6.0.0",
        "path-exists": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/flat-cache": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz",
      "integrity": "sha512-f7ccFPK3SXFHpx15UIGyRJ/FJQctuKZ0zVuN3frBo4HnK3cay9VEW0R6yPYFHC0AgqhukPzKjq22t5DmAyqGyw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "flatted": "^3.2.9",
        "keyv": "^4.5.4"
      },
      "engines": {
        "node": ">=16"
      }
    },
    "node_modules/flatted": {
      "version": "3.4.2",
      "resolved": "https://registry.npmjs.org/flatted/-/flatted-3.4.2.tgz",
      "integrity": "sha512-PjDse7RzhcPkIJwy5t7KPWQSZ9cAbzQXcafsetQoD7sOJRQlGikNbx7yZp2OotDnJyrDcbyRq3Ttb18iYOqkxA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/follow-redirects": {
      "version": "1.16.0",
      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.0.tgz",
      "integrity": "sha512-y5rN/uOsadFT/JfYwhxRS5R7Qce+g3zG97+JrtFZlC9klX/W5hD7iiLzScI4nZqUS7DNUdhPgw4xI8W2LuXlUw==",
      "funding": [
        {
          "type": "individual",
          "url": "https://github.com/sponsors/RubenVerborgh"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=4.0"
      },
      "peerDependenciesMeta": {
        "debug": {
          "optional": true
        }
      }
    },
    "node_modules/form-data": {
      "version": "4.0.5",
      "resolved": "https://registry.npmjs.org/form-data/-/form-data-4.0.5.tgz",
      "integrity": "sha512-8RipRLol37bNs2bhoV67fiTEvdTrbMUYcFTiy3+wuuOnUog2QBHCZWXDRijWQfAkhBj2Uf5UnVaiWwA5vdd82w==",
      "license": "MIT",
      "dependencies": {
        "asynckit": "^0.4.0",
        "combined-stream": "^1.0.8",
        "es-set-tostringtag": "^2.1.0",
        "hasown": "^2.0.2",
        "mime-types": "^2.1.12"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/gensync": {
      "version": "1.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
      "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/glob-parent": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz",
      "integrity": "sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d6AX6zSU55HfB4ydCEuXLXc5FcYeOu+nnGftS4TEju/11rt4KJPTMgbfmv4A==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "is-glob": "^4.0.3"
      },
      "engines": {
        "node": ">=10.13.0"
      }
    },
    "node_modules/globals": {
      "version": "17.6.0",
      "resolved": "https://registry.npmjs.org/globals/-/globals-17.6.0.tgz",
      "integrity": "sha512-sepffkT8stwnIYbsMBpoCHJuJM5l98FUF2AnE07hfvE0m/qp3R586hw4jF4uadbhvg1ooIdzuu7CsfD2jzCaNA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-tostringtag": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
      "integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
      "license": "MIT",
      "dependencies": {
        "has-symbols": "^1.0.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.3.tgz",
      "integrity": "sha512-ej4AhfhfL2Q2zpMmLo7U1Uv9+PyhIZpgQLGT1F9miIGmiCJIoCgSmczFdrc97mWT4kVY72KA+WnnhJ5pghSvSg==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/hermes-estree": {
      "version": "0.25.1",
      "resolved": "https://registry.npmjs.org/hermes-estree/-/hermes-estree-0.25.1.tgz",
      "integrity": "sha512-0wUoCcLp+5Ev5pDW2OriHC2MJCbwLwuRx+gAqMTOkGKJJiBCLjtrvy4PWUGn6MIVefecRpzoOZ/UV6iGdOr+Cw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/hermes-parser": {
      "version": "0.25.1",
      "resolved": "https://registry.npmjs.org/hermes-parser/-/hermes-parser-0.25.1.tgz",
      "integrity": "sha512-6pEjquH3rqaI6cYAXYPcz9MS4rY6R4ngRgrgfDshRptUZIc3lw0MCIJIGDj9++mfySOuPTHB4nrSW99BCvOPIA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "hermes-estree": "0.25.1"
      }
    },
    "node_modules/html-to-image": {
      "version": "1.11.13",
      "resolved": "https://registry.npmjs.org/html-to-image/-/html-to-image-1.11.13.tgz",
      "integrity": "sha512-cuOPoI7WApyhBElTTb9oqsawRvZ0rHhaHwghRLlTuffoD1B2aDemlCruLeZrUIIdvG7gs9xeELEPm6PhuASqrg==",
      "license": "MIT"
    },
    "node_modules/https-proxy-agent": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-5.0.1.tgz",
      "integrity": "sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "6",
        "debug": "4"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.6.3",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.6.3.tgz",
      "integrity": "sha512-4fCk79wshMdzMp2rH06qWrJE4iolqLhCUH+OiuIgU++RB0+94NlDL81atO7GX55uUKueo0txHNtvEyI6D7WdMw==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/ignore": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
      "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/imurmurhash": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
      "integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.8.19"
      }
    },
    "node_modules/internmap": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/internmap/-/internmap-2.0.3.tgz",
      "integrity": "sha512-5Hh7Y1wQbvY5ooGgPbDaL5iYLAPzMTUrjMulskHLH6wnv/A+1q5rgEaiuqEjB+oxGXIVZs1FF+R/KPN3ZSQYYg==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/is-extglob": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
      "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/is-glob": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
      "integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-extglob": "^2.1.1"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/jsesc": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
      "integrity": "sha512-/sM3dO2FOzXjKQhJuo0Q173wf2KOo8t4I8vHy6lF9poUp7bKT0/NHE8fPX23PwfhnykfqnC2xRxOnVw5XuGIaA==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "jsesc": "bin/jsesc"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/json-buffer": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz",
      "integrity": "sha512-4bV5BfR2mqfQTJm+V5tPPdf+ZpuhiIvTuAB5g8kcrXOZpTT/QwwVRWBywX1ozr6lEuPdbHxwaJlm9G6mI2sfSQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-schema-traverse": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz",
      "integrity": "sha512-xbbCH5dCYU5T8LcEhhuh7HJ88HXuW3qsI3Y0zOZFKfZEHcpWiHU/Jxzk629Brsab/mMiHQti9wMP+845RPe3Vg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json-stable-stringify-without-jsonify": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz",
      "integrity": "sha512-Bdboy+l7tA3OGW6FjyFHWkP5LuByj1Tk33Ljyq0axyzdk9//JSi2u3fP1QSmd1KNwq6VOKYGlAu87CisVir6Pw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json5": {
      "version": "2.2.3",
      "resolved": "https://registry.npmjs.org/json5/-/json5-2.2.3.tgz",
      "integrity": "sha512-XmOWe7eyHYH14cLdVPoyg+GOH3rYX++KpzrylJwSW98t3Nk+U8XOl8FWKOgwtzdb8lXGf6zYwDUzeHMWfxasyg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "json5": "lib/cli.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/keyv": {
      "version": "4.5.4",
      "resolved": "https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz",
      "integrity": "sha512-oxVHkHR/EJf2CNXnWxRLW6mg7JyCCUcG0DtEGmL2ctUo1PNTin1PUil+r/+4r5MpVgC/fn1kjsx7mjSujKqIpw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "json-buffer": "3.0.1"
      }
    },
    "node_modules/levn": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/levn/-/levn-0.4.1.tgz",
      "integrity": "sha512-+bT2uH4E5LGE7h/n3evcS/sQlJXCpIp6ym8OWJ5eV6+67Dsql/LaaT7qJBAt2rzfoa/5QBGBhxDix1dMt2kQKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1",
        "type-check": "~0.4.0"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/lightningcss": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss/-/lightningcss-1.32.0.tgz",
      "integrity": "sha512-NXYBzinNrblfraPGyrbPoD19C1h9lfI/1mzgWYvXUTe414Gz/X1FD2XBZSZM7rRTrMA8JL3OtAaGifrIKhQ5yQ==",
      "dev": true,
      "license": "MPL-2.0",
      "dependencies": {
        "detect-libc": "^2.0.3"
      },
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      },
      "optionalDependencies": {
        "lightningcss-android-arm64": "1.32.0",
        "lightningcss-darwin-arm64": "1.32.0",
        "lightningcss-darwin-x64": "1.32.0",
        "lightningcss-freebsd-x64": "1.32.0",
        "lightningcss-linux-arm-gnueabihf": "1.32.0",
        "lightningcss-linux-arm64-gnu": "1.32.0",
        "lightningcss-linux-arm64-musl": "1.32.0",
        "lightningcss-linux-x64-gnu": "1.32.0",
        "lightningcss-linux-x64-musl": "1.32.0",
        "lightningcss-win32-arm64-msvc": "1.32.0",
        "lightningcss-win32-x64-msvc": "1.32.0"
      }
    },
    "node_modules/lightningcss-android-arm64": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.32.0.tgz",
      "integrity": "sha512-YK7/ClTt4kAK0vo6w3X+Pnm0D2cf2vPHbhOXdoNti1Ga0al1P4TBZhwjATvjNwLEBCnKvjJc2jQgHXH0NEwlAg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-darwin-arm64": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.32.0.tgz",
      "integrity": "sha512-RzeG9Ju5bag2Bv1/lwlVJvBE3q6TtXskdZLLCyfg5pt+HLz9BqlICO7LZM7VHNTTn/5PRhHFBSjk5lc4cmscPQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-darwin-x64": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.32.0.tgz",
      "integrity": "sha512-U+QsBp2m/s2wqpUYT/6wnlagdZbtZdndSmut/NJqlCcMLTWp5muCrID+K5UJ6jqD2BFshejCYXniPDbNh73V8w==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-freebsd-x64": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.32.0.tgz",
      "integrity": "sha512-JCTigedEksZk3tHTTthnMdVfGf61Fky8Ji2E4YjUTEQX14xiy/lTzXnu1vwiZe3bYe0q+SpsSH/CTeDXK6WHig==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm-gnueabihf": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.32.0.tgz",
      "integrity": "sha512-x6rnnpRa2GL0zQOkt6rts3YDPzduLpWvwAF6EMhXFVZXD4tPrBkEFqzGowzCsIWsPjqSK+tyNEODUBXeeVHSkw==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm64-gnu": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.32.0.tgz",
      "integrity": "sha512-0nnMyoyOLRJXfbMOilaSRcLH3Jw5z9HDNGfT/gwCPgaDjnx0i8w7vBzFLFR1f6CMLKF8gVbebmkUN3fa/kQJpQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-arm64-musl": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.32.0.tgz",
      "integrity": "sha512-UpQkoenr4UJEzgVIYpI80lDFvRmPVg6oqboNHfoH4CQIfNA+HOrZ7Mo7KZP02dC6LjghPQJeBsvXhJod/wnIBg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-x64-gnu": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.32.0.tgz",
      "integrity": "sha512-V7Qr52IhZmdKPVr+Vtw8o+WLsQJYCTd8loIfpDaMRWGUZfBOYEJeyJIkqGIDMZPwPx24pUMfwSxxI8phr/MbOA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-linux-x64-musl": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.32.0.tgz",
      "integrity": "sha512-bYcLp+Vb0awsiXg/80uCRezCYHNg1/l3mt0gzHnWV9XP1W5sKa5/TCdGWaR/zBM2PeF/HbsQv/j2URNOiVuxWg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-win32-arm64-msvc": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.32.0.tgz",
      "integrity": "sha512-8SbC8BR40pS6baCM8sbtYDSwEVQd4JlFTOlaD3gWGHfThTcABnNDBda6eTZeqbofalIJhFx0qKzgHJmcPTnGdw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/lightningcss-win32-x64-msvc": {
      "version": "1.32.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.32.0.tgz",
      "integrity": "sha512-Amq9B/SoZYdDi1kFrojnoqPLxYhQ4Wo5XiL8EVJrVsB8ARoC1PWW6VGtT0WKCemjy8aC+louJnjS7U18x3b06Q==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "node_modules/locate-path": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz",
      "integrity": "sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-locate": "^5.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/lru-cache": {
      "version": "5.1.1",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
      "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "yallist": "^3.0.2"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/minimatch": {
      "version": "10.2.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.5.tgz",
      "integrity": "sha512-MULkVLfKGYDFYejP07QOurDLLQpcjk7Fw+7jXS2R2czRQzR56yHRveU5NDJEOviH+hETZKSkIk5c+T23GjFUMg==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.5"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/nanoid": {
      "version": "3.3.12",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.12.tgz",
      "integrity": "sha512-ZB9RH/39qpq5Vu6Y+NmUaFhQR6pp+M2Xt76XBnEwDaGcVAqhlvxrl3B2bKS5D3NH3QR76v3aSrKaF/Kiy7lEtQ==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "node_modules/natural-compare": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
      "integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/node-releases": {
      "version": "2.0.44",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.44.tgz",
      "integrity": "sha512-5WUyunoPMsvvEhS8AxHtRzP+oA8UCkJ7YRxatWKjngndhDGLiqEVAQKWjFAiAiuL8zMRGzGSJxFnLetoa43qGQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/optionator": {
      "version": "0.9.4",
      "resolved": "https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz",
      "integrity": "sha512-6IpQ7mKUxRcZNLIObR0hz7lxsapSSIYNZJwXPGeF0mTVqGKFIXj1DQcMoT22S3ROcLyY/rz0PWaWZ9ayWmad9g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "deep-is": "^0.1.3",
        "fast-levenshtein": "^2.0.6",
        "levn": "^0.4.1",
        "prelude-ls": "^1.2.1",
        "type-check": "^0.4.0",
        "word-wrap": "^1.2.5"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/p-limit": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "yocto-queue": "^0.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-locate": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz",
      "integrity": "sha512-LaNjtRWUBY++zB5nE/NwcaoMylSPk+S+ZHNB1TzdbMJMny6dynpAGt7X/tl/QYq3TIeE6nxHppbo2LGymrG5Pw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-limit": "^3.0.2"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/path-exists": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz",
      "integrity": "sha512-QP88BAKvMam/3NxH6vj2o21R6MjxZUAd6nlwAS/pnGvN9IVLocLHxGYIzFhg6fUQ+5th6P4dv4eW9jX3DSIj7A==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/postcss": {
      "version": "8.5.15",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.15.tgz",
      "integrity": "sha512-FfR8sjd4em2T6fb3I2MwAJU7HWVMr9zba+enmQeeWFfCbm+UOC/0X4DS8XtpUTMwWMGbjKYP7xjfNekzyGmB3A==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.12",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "node_modules/prelude-ls": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz",
      "integrity": "sha512-vkcDPrRZo1QZLbn5RLGPpg/WmIQ65qoWWhcGKf/b5eplkkarX0m9z8ppCat4mlOqUsWpyNuYgO3VRyrYHSzX5g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/proxy-from-env": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/proxy-from-env/-/proxy-from-env-2.1.0.tgz",
      "integrity": "sha512-cJ+oHTW1VAEa8cJslgmUZrc+sjRKgAKl3Zyse6+PV38hZe/V6Z14TbCuXcan9F9ghlz4QrFr2c92TNF82UkYHA==",
      "license": "MIT",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/punycode": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/react": {
      "version": "19.2.6",
      "resolved": "https://registry.npmjs.org/react/-/react-19.2.6.tgz",
      "integrity": "sha512-sfWGGfavi0xr8Pg0sVsyHMAOziVYKgPLNrS7ig+ivMNb3wbCBw3KxtflsGBAwD3gYQlE/AEZsTLgToRrSCjb0Q==",
      "license": "MIT",
      "peer": true,
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/react-dom": {
      "version": "19.2.6",
      "resolved": "https://registry.npmjs.org/react-dom/-/react-dom-19.2.6.tgz",
      "integrity": "sha512-0prMI+hvBbPjsWnxDLxlCGyM8PN6UuWjEUCYmZhO67xIV9Xasa/r/vDnq+Xyq4Lo27g8QSbO5YzARu0D1Sps3g==",
      "license": "MIT",
      "dependencies": {
        "scheduler": "^0.27.0"
      },
      "peerDependencies": {
        "react": "^19.2.6"
      }
    },
    "node_modules/robust-predicates": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/robust-predicates/-/robust-predicates-3.0.3.tgz",
      "integrity": "sha512-NS3levdsRIUOmiJ8FZWCP7LG3QpJyrs/TE0Zpf1yvZu8cAJJ6QMW92H1c7kWpdIHo8RvmLxN/o2JXTKHp74lUA==",
      "license": "Unlicense"
    },
    "node_modules/rolldown": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.0.1.tgz",
      "integrity": "sha512-X0KQHljNnEkWNqqiz9zJrGunh1B0HgOxLXvnFpCOcadzcy5qohZ3tqMEUg00vncoRovXuK3ZqCT9KnnKzoInFQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@oxc-project/types": "=0.130.0",
        "@rolldown/pluginutils": "^1.0.0"
      },
      "bin": {
        "rolldown": "bin/cli.mjs"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "optionalDependencies": {
        "@rolldown/binding-android-arm64": "1.0.1",
        "@rolldown/binding-darwin-arm64": "1.0.1",
        "@rolldown/binding-darwin-x64": "1.0.1",
        "@rolldown/binding-freebsd-x64": "1.0.1",
        "@rolldown/binding-linux-arm-gnueabihf": "1.0.1",
        "@rolldown/binding-linux-arm64-gnu": "1.0.1",
        "@rolldown/binding-linux-arm64-musl": "1.0.1",
        "@rolldown/binding-linux-ppc64-gnu": "1.0.1",
        "@rolldown/binding-linux-s390x-gnu": "1.0.1",
        "@rolldown/binding-linux-x64-gnu": "1.0.1",
        "@rolldown/binding-linux-x64-musl": "1.0.1",
        "@rolldown/binding-openharmony-arm64": "1.0.1",
        "@rolldown/binding-wasm32-wasi": "1.0.1",
        "@rolldown/binding-win32-arm64-msvc": "1.0.1",
        "@rolldown/binding-win32-x64-msvc": "1.0.1"
      }
    },
    "node_modules/rw": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/rw/-/rw-1.3.3.tgz",
      "integrity": "sha512-PdhdWy89SiZogBLaw42zdeqtRJ//zFd2PgQavcICDUgJT5oW10QCRKbJ6bg4r0/UY2M6BWd5tkxuGFRvCkgfHQ==",
      "license": "BSD-3-Clause"
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/scheduler": {
      "version": "0.27.0",
      "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
      "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/source-map-js": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
      "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.16",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.16.tgz",
      "integrity": "sha512-pn99VhoACYR8nFHhxqix+uvsbXineAasWm5ojXoN8xEwK5Kd3/TrhNn1wByuD52UxWRLy8pu+kRMniEi6Eq9Zg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.4"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/ts-api-utils": {
      "version": "2.5.0",
      "resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz",
      "integrity": "sha512-OJ/ibxhPlqrMM0UiNHJ/0CKQkoKF243/AEmplt3qpRgkW8VG7IfOS41h7V8TjITqdByHzrjcS/2si+y4lIh8NA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.12"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "dev": true,
      "license": "0BSD",
      "optional": true
    },
    "node_modules/type-check": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz",
      "integrity": "sha512-XleUoc9uwGXqjWwXaUTZAmzMcFZ5858QA2vvx1Ur5xIcixXIP+8LnFDgRplU30us6teqdlskFfu+ae4K79Ooew==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "prelude-ls": "^1.2.1"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/typescript": {
      "version": "6.0.3",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz",
      "integrity": "sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==",
      "dev": true,
      "license": "Apache-2.0",
      "peer": true,
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/typescript-eslint": {
      "version": "8.59.4",
      "resolved": "https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.59.4.tgz",
      "integrity": "sha512-Rw6+44QNFaXtgHSjPy+Kw8hrJniMYzR85E9yLmOLcfZ91/rz+JXQbDTCmc6ccxMPY6K6PgAq26f0JCBfR7LIPQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/eslint-plugin": "8.59.4",
        "@typescript-eslint/parser": "8.59.4",
        "@typescript-eslint/typescript-estree": "8.59.4",
        "@typescript-eslint/utils": "8.59.4"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    },
    "node_modules/undici-types": {
      "version": "7.16.0",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.16.0.tgz",
      "integrity": "sha512-Zz+aZWSj8LE6zoxD+xrjh4VfkIG8Ya6LvYkZqtUQGJPZjYl53ypCaUwWqo7eI0x66KBGeRo+mlBEkMSeSZ38Nw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/update-browserslist-db": {
      "version": "1.2.3",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz",
      "integrity": "sha512-Js0m9cx+qOgDxo0eMiFGEueWztz+d4+M3rGlmKPT+T4IS/jP4ylw3Nwpu6cpTTP8R1MAC1kF4VbdLt3ARf209w==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    },
    "node_modules/uri-js": {
      "version": "4.4.1",
      "resolved": "https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz",
      "integrity": "sha512-7rKUyy33Q1yc98pQ1DAmLtwX109F7TIfWlW1Ydo8Wl1ii1SeHieeh0HHfPeL2fMXK6z0s8ecKs9frCuLJvndBg==",
      "dev": true,
      "license": "BSD-2-Clause",
      "dependencies": {
        "punycode": "^2.1.0"
      }
    },
    "node_modules/vite": {
      "version": "8.0.13",
      "resolved": "https://registry.npmjs.org/vite/-/vite-8.0.13.tgz",
      "integrity": "sha512-MFtjBYgzmSxmgA4RAfjIyXWpGe1oALnjgUTzzV7QLx/TKxCzjtMH6Fd9/eVK+5Fg1qNoz5VAwsmMs/NofrmJvw==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "lightningcss": "^1.32.0",
        "picomatch": "^4.0.4",
        "postcss": "^8.5.14",
        "rolldown": "1.0.1",
        "tinyglobby": "^0.2.16"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "@vitejs/devtools": "^0.1.18",
        "esbuild": "^0.27.0 || ^0.28.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "@vitejs/devtools": {
          "optional": true
        },
        "esbuild": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/word-wrap": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
      "integrity": "sha512-BN22B5eaMMI9UMtjrGd5g5eCYPpCPDUy0FJXbYsaT5zYxjFOckS53SQDE3pWkVoWpHXVb3BrYcEN4Twa55B5cA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/yallist": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
      "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/yocto-queue": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/zod": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
      "integrity": "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "funding": {
        "url": "https://github.com/sponsors/colinhacks"
      }
    },
    "node_modules/zod-validation-error": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/zod-validation-error/-/zod-validation-error-4.0.2.tgz",
      "integrity": "sha512-Q6/nZLe6jxuU80qb/4uJ4t5v2VEZ44lzQjPDhYJNztRQ4wyWc6VF3D3Kb/fAuPetZQnhS3hnajCf9CsWesghLQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      },
      "peerDependencies": {
        "zod": "^3.25.0 || ^4.0.0"
      }
    },
    "node_modules/zustand": {
      "version": "5.0.13",
      "resolved": "https://registry.npmjs.org/zustand/-/zustand-5.0.13.tgz",
      "integrity": "sha512-efI2tVaVQPqtOh114loML/Z80Y4NP3yc+Ff0fYiZJPauNeWZeIp/bRFD7I9bfmCOYBh/PHxlglQ9+wvlwnPikQ==",
      "license": "MIT",
      "engines": {
        "node": ">=12.20.0"
      },
      "peerDependencies": {
        "@types/react": ">=18.0.0",
        "immer": ">=9.0.6",
        "react": ">=18.0.0",
        "use-sync-external-store": ">=1.2.0"
      },
      "peerDependenciesMeta": {
        "@types/react": {
          "optional": true
        },
        "immer": {
          "optional": true
        },
        "react": {
          "optional": true
        },
        "use-sync-external-store": {
          "optional": true
        }
      }
    }
  }
}
```

```json
// File: package.json
{
  "name": "vega-rrg",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@types/d3": "^7.4.3",
    "axios": "^1.16.1",
    "d3": "^7.9.0",
    "html-to-image": "^1.11.13",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.3.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.59.2",
    "vite": "^8.0.12"
  }
}
```

```markdown
// File: README.md
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
```

```css
// File: src\App.css
.app {
  display: grid;
  grid-template-rows: var(--command-bar-height) 1fr var(--status-bar-height);
  grid-template-columns: 320px 1fr 260px;
  grid-template-areas:
    "command command command"
    "left    chart   watchlist"
    "status  status  status";
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}

.app__command { grid-area: command; }
.app__left {
  grid-area: left;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-primary);
  overflow: hidden;
}
.app__watchlist {
  grid-area: watchlist;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-primary);
  overflow: hidden;
}
.app__chart { grid-area: chart; overflow: hidden; position: relative; }
.app__status { grid-area: status; }

@media (max-width: 900px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-areas:
      "command"
      "chart"
      "status";
  }
  .app__left, .app__watchlist {
    display: none;
  }
}
```

```tsx
// File: src\App.tsx
import CommandBar from './components/terminal/CommandBar';
import WatchlistPanel from './components/terminal/WatchlistPanel';
import StatusBar from './components/terminal/StatusBar';
import MetricsPanel from './components/MetricsPanel';
import RankingPanel from './components/RankingPanel';
import { RrgScene } from './components/chart/RrgScene';
import { useAutoFetch } from './hooks/useAutoFetch';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import './index.css';
import './App.css';

function App() {
  // Initialize auto-fetching and keyboard shortcuts
  useAutoFetch();
  useKeyboardShortcuts();

  return (
    <div className="app">
      <div className="app__command">
        <CommandBar />
      </div>
      
      <div className="app__left">
        <RankingPanel />
        <MetricsPanel />
      </div>
      
      <div className="app__chart">
        <RrgScene />
      </div>

      <div className="app__watchlist">
        <WatchlistPanel />
      </div>
      
      <div className="app__status">
        <StatusBar />
      </div>
    </div>
  );
}

export default App;
```

```tsx
// File: src\components\chart\layers\AxisLayer.tsx
import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';

interface AxisLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
}

export const AxisLayer: React.FC<AxisLayerProps> = React.memo(({ scales, dims }) => {
  const xTicks = useMemo(() => scales.xScale.ticks(8), [scales.xScale]);
  const yTicks = useMemo(() => scales.yScale.ticks(8), [scales.yScale]);

  return (
    <g className="axis-layer">

      {/* X-axis tick labels — fixed to bottom gutter */}
      {xTicks.map(v => (
        <g key={`xt-${v}`} transform={`translate(${scales.xScale(v)}, 0)`}>
          <line y1={dims.innerHeight} y2={dims.innerHeight + 4} stroke="#444" strokeWidth={1} />
          <text
            x={0}
            y={dims.innerHeight + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#7a5c22"
            fontFamily="'IBM Plex Mono', monospace"
            fontWeight={500}
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Y-axis tick labels — fixed to left gutter */}
      {yTicks.map(v => (
        <g key={`yt-${v}`} transform={`translate(0, ${scales.yScale(v)})`}>
          <line x1={-4} x2={0} stroke="#444" strokeWidth={1} />
          <text
            x={-8}
            y={0}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={9}
            fill="#7a5c22"
            fontFamily="'IBM Plex Mono', monospace"
            fontWeight={500}
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Axis name labels */}
      <text
        x={dims.innerWidth / 2}
        y={dims.innerHeight + 32}
        textAnchor="middle"
        fontSize={10}
        fill="#606060"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight={600}
        letterSpacing={2}
        style={{ cursor: 'help' }}
      >
        <title>RS-Ratio: Measures relative performance against the benchmark. Values &gt; 100 indicate outperformance, while &lt; 100 indicate underperformance.</title>
        RS-RATIO
      </text>

      <text
        x={-dims.innerHeight / 2}
        y={-40}
        textAnchor="middle"
        fontSize={10}
        fill="#606060"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight={600}
        letterSpacing={2}
        transform={`rotate(-90)`}
        style={{ cursor: 'help' }}
      >
        <title>RS-Momentum: Measures the momentum (rate of change) of the RS-Ratio. Values &gt; 100 indicate accelerating momentum, while &lt; 100 indicate decelerating momentum.</title>
        RS-MOMENTUM
      </text>
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\CrosshairCenterLayer.tsx
import React from 'react';
import type { RrgScales } from '../../../core/scales';

interface CrosshairCenterLayerProps {
  scales: RrgScales;
}

export const CrosshairCenterLayer: React.FC<CrosshairCenterLayerProps> = React.memo(({ scales }) => {
  const cx = scales.xScale(scales.center);
  const cy = scales.yScale(scales.center);
  
  // Very large bounds so the crosshair always reaches the edge of the clipped plot space
  const SIZE = 10000;

  return (
    <g className="crosshair-center-layer">
      <line
        x1={cx - SIZE} x2={cx + SIZE}
        y1={cy} y2={cy}
        stroke="#707070" 
        strokeWidth={1.5} 
        strokeDasharray="6,4"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx} x2={cx}
        y1={cy - SIZE} y2={cy + SIZE}
        stroke="#707070" 
        strokeWidth={1.5} 
        strokeDasharray="6,4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\CrosshairLayer.tsx
import React from 'react';
import { useRrgStore } from '../../../stores/useRrgStore';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';

interface CrosshairLayerProps {
  dims: ChartDimensions;
  scales: RrgScales;
}

export const CrosshairLayer: React.FC<CrosshairLayerProps> = React.memo(({ dims, scales }) => {
  const crosshairX = useRrgStore(s => s.crosshairX);
  const crosshairY = useRrgStore(s => s.crosshairY);

  if (crosshairX === null || crosshairY === null) return null;

  const sx = scales.xScale(crosshairX);
  const sy = scales.yScale(crosshairY);

  const formatValue = (v: number) => v.toFixed(2);

  return (
    <g className="crosshair-layer" pointerEvents="none">
      <line x1={0} x2={dims.innerWidth} y1={sy} y2={sy} stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" />
      <line x1={sx} x2={sx} y1={0} y2={dims.innerHeight} stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" />

      {/* X-axis label */}
      <g transform={`translate(${sx}, ${dims.innerHeight})`}>
        <rect x={-25} y={0} width={50} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text x={0} y={12} fontSize={10} fill={bloomberg.text.primary} textAnchor="middle">
          {formatValue(crosshairX)}
        </text>
      </g>

      {/* Y-axis label */}
      <g transform={`translate(0, ${sy})`}>
        <rect x={-35} y={-8} width={35} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text x={-4} y={3} fontSize={10} fill={bloomberg.text.primary} textAnchor="end">
          {formatValue(crosshairY)}
        </text>
      </g>
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\GridLayer.tsx
import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import { generateGridLines } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';

interface GridLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
  xDomain: [number, number];
  yDomain: [number, number];
  step: number;
}

export const GridLayer: React.FC<GridLayerProps> = React.memo(({ scales, xDomain, yDomain, step }) => {
  const minorGridLinesX = useMemo(() => generateGridLines(xDomain, step / 2), [xDomain, step]);
  const majorGridLinesX = useMemo(() => generateGridLines(xDomain, step), [xDomain, step]);
  const minorGridLinesY = useMemo(() => generateGridLines(yDomain, step / 2), [yDomain, step]);
  const majorGridLinesY = useMemo(() => generateGridLines(yDomain, step), [yDomain, step]);

  return (
    <g className="grid-layer">
      {minorGridLinesX.map(x => (
        <line
          key={`minor-x-${x}`}
          x1={scales.xScale(x)}
          x2={scales.xScale(x)}
          y1={-5000}
          y2={5000}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {minorGridLinesY.map(y => (
        <line
          key={`minor-y-${y}`}
          x1={-5000}
          x2={5000}
          y1={scales.yScale(y)}
          y2={scales.yScale(y)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {majorGridLinesX.map(x => (
        <line
          key={`major-x-${x}`}
          x1={scales.xScale(x)}
          x2={scales.xScale(x)}
          y1={-5000}
          y2={5000}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {majorGridLinesY.map(y => (
        <line
          key={`major-y-${y}`}
          x1={-5000}
          x2={5000}
          y1={scales.yScale(y)}
          y2={scales.yScale(y)}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\LabelLayer.tsx
import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';
import { smartLabelPlacement } from '../../../core/geometry';
import { cleanSectorName } from '../../../core/math';
import { useViewportStore } from '../../../stores/useViewportStore';
import { useChartSettingsStore } from '../../../stores/useChartSettingsStore';

interface LabelLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  selectedSector: string | null;
  hoveredSector: string | null;
  zoom: number;
  isStressed: boolean;
  renderState: any;
  setHoveredSector: (symbol: string | null) => void;
  setSelectedSector: (symbol: string | null) => void;
}

export const LabelLayer: React.FC<LabelLayerProps> = React.memo(({ data, scales, selectedSector, hoveredSector, zoom, isStressed, renderState, setHoveredSector, setSelectedSector }) => {
  const viewportWidth = useViewportStore(s => s.viewportWidth);
  const viewportHeight = useViewportStore(s => s.viewportHeight);
  const showLabels = useChartSettingsStore(s => s.showLabels);

  if (!showLabels) return null;

  const labels = useMemo(() => {
    let rawLabels = data.map(d => {
      // Clean and shorten the sector name to save space
      const name = cleanSectorName(d.symbol);

      const isSelected = selectedSector === d.symbol;
      const isHovered = hoveredSector === d.symbol;

      // Mathematical Camera Projection
      const worldX = scales.xScale(d.x);
      const worldY = scales.yScale(d.y);

      const intX = worldX * renderState.intZoom + renderState.intOffsetX;
      const intY = worldY * renderState.intZoom + renderState.intOffsetY;

      const screenX = intX * renderState.fitZoom + renderState.fitOffsetX;
      const screenY = intY * renderState.fitZoom + renderState.fitOffsetY;

      // Priority Scoring
      const selectedWeight = isSelected ? 1000 : 0;
      const hoveredWeight = isHovered ? 500 : 0;
      const momentumWeight = d.momentumRoc * 10;
      const velocityWeight = d.velocity * 5;
      const priority = selectedWeight + hoveredWeight + momentumWeight + velocityWeight;

      let trailSegments: {x1: number, y1: number, x2: number, y2: number}[] = [];
      if (d.trail && d.trail.length > 0) {
        for (let i = 0; i < d.trail.length - 1; i++) {
          const t1 = d.trail[i];
          const t2 = d.trail[i+1];
          
          const wx1 = scales.xScale(t1.x);
          const wy1 = scales.yScale(t1.y);
          const wx2 = scales.xScale(t2.x);
          const wy2 = scales.yScale(t2.y);
          
          const x1 = ((wx1 * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX;
          const y1 = ((wy1 * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY;
          const x2 = ((wx2 * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX;
          const y2 = ((wy2 * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY;
          
          trailSegments.push({x1, y1, x2, y2});
        }
        trailSegments.push({
            x1: ((scales.xScale(d.trail[d.trail.length - 1].x) * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX,
            y1: ((scales.yScale(d.trail[d.trail.length - 1].y) * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY,
            x2: screenX,
            y2: screenY,
        });
      }

      return {
        id: d.symbol,
        cx: screenX,
        cy: screenY,
        width: name.length * 6,
        height: 12,
        text: name,
        priority,
        isSelected,
        isHovered,
        trailSegments,
        stale: d.stale,
        computedAt: d.computedAt
      };
    });

    rawLabels = rawLabels.filter(lbl => {
      if (lbl.isSelected || lbl.isHovered) return true;
      if (isStressed) return false;

      const pad = 20;
      if (lbl.cx < -pad || lbl.cx > viewportWidth + pad || lbl.cy < -pad || lbl.cy > viewportHeight + pad) {
        return false;
      }
      return true;
    });

    // Phase 2: Dynamic Bounding Box Placement & Collision Avoidance
    return smartLabelPlacement(rawLabels);

  }, [data, scales, zoom, isStressed, renderState, viewportWidth, viewportHeight, hoveredSector, selectedSector]);

  return (
    <g className="label-layer">
      {labels.map(lbl => {
        const isFaded = (selectedSector || hoveredSector) && !lbl.isSelected && !lbl.isHovered;
        
        const ageMs = lbl.computedAt ? Date.now() - lbl.computedAt : 0;
        let staleOpacity = 0.6;
        if (lbl.stale) {
          if (ageMs > 600000) staleOpacity = 0.3;
          else if (ageMs > 120000) staleOpacity = 0.4;
          else staleOpacity = 0.5;
        }

        let opacity = 0.6;
        if (isFaded) opacity = 0.1;
        else if (lbl.isSelected || lbl.isHovered) opacity = 1.0;
        else opacity = staleOpacity;

        const fontWeight = lbl.isSelected || lbl.isHovered ? 600 : 400;

        return (
          <g key={`label-${lbl.id}`} transform={`translate(${lbl.x}, ${lbl.y})`}>
            <text
              x={0}
              y={0}
              dominantBaseline="hanging"
              fontSize={10}
              fontWeight={fontWeight}
              fill={bloomberg.text.primary}
              opacity={opacity}
              style={{ pointerEvents: 'auto', cursor: 'pointer', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
              onMouseEnter={() => setHoveredSector(lbl.id)}
              onMouseLeave={() => setHoveredSector(null)}
              onMouseUp={(e) => {
                e.stopPropagation();
                setSelectedSector(lbl.isSelected ? null : lbl.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {lbl.text}
            </text>
          </g>
        );
      })}
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\PointLayer.tsx
import React from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { getQuadrantColor } from '../../../themes/bloomberg';

interface PointLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  selectedSector: string | null;
  hoveredSector: string | null;
  zoom: number;
  setHoveredSector: (symbol: string | null) => void;
}

export const PointLayer: React.FC<PointLayerProps> = React.memo(({ data, scales, selectedSector, hoveredSector, zoom, setHoveredSector }) => {
  const adjZoom = Math.max(0.1, zoom);

  return (
    <g className="point-layer">
      {data.map(d => {
        const cx = scales.xScale(d.x);
        const cy = scales.yScale(d.y);
        const isSelected = selectedSector === d.symbol;
        const isHovered = hoveredSector === d.symbol;
        const isFaded = (selectedSector || hoveredSector) && !isSelected && !isHovered;
        
        // Semantic Zoom: Scale down world geometry so screen size remains constant
        const baseSize = isSelected || isHovered ? 8 : 6;
        const size = baseSize / adjZoom;
        const half = size / 2;
        const color = getQuadrantColor(d.quadrant).text;
        
        const ageMs = d.computedAt ? Date.now() - d.computedAt : 0;
        let staleOpacity = 1.0;
        if (d.stale) {
          if (ageMs > 600000) staleOpacity = 0.5;
          else if (ageMs > 120000) staleOpacity = 0.7;
          else staleOpacity = 0.9;
        }

        let opacity = 1.0;
        if (isFaded) opacity = 0.15;
        else if (isSelected || isHovered) opacity = 1.0;
        else opacity = staleOpacity;

        const strokeWidth = 1 / adjZoom;

        return (
          <g 
            key={`point-${d.symbol}`} 
            transform={`translate(${cx}, ${cy})`}
            opacity={opacity}
            onMouseEnter={() => setHoveredSector(d.symbol)}
            onMouseLeave={() => setHoveredSector(null)}
            style={{ cursor: 'pointer' }}
          >
            {isSelected && (
              <rect
                x={-half - (3 / adjZoom)}
                y={-half - (3 / adjZoom)}
                width={size + (6 / adjZoom)}
                height={size + (6 / adjZoom)}
                fill="none"
                stroke={color}
                strokeWidth={1.5 / adjZoom}
                opacity={0.8}
              />
            )}
            <rect
              x={-half}
              y={-half}
              width={size}
              height={size}
              fill={isHovered ? '#FFFFFF' : color}
              stroke="#000000"
              strokeWidth={strokeWidth}
            />
          </g>
        );
      })}
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\QuadrantBackgrounds.tsx
import React from 'react';
import type { RrgScales } from '../../../core/scales';
import { bloomberg } from '../../../themes/bloomberg';

interface QuadrantBackgroundsProps {
  scales: RrgScales;
}

export const QuadrantBackgrounds: React.FC<QuadrantBackgroundsProps> = React.memo(({ scales }) => {
  // Center in data space (usually 100, or 1.0 if normalized differently)
  const cx = scales.xScale(scales.center);
  const cy = scales.yScale(scales.center);
  
  // Use massive world bounds (-5000 to +5000 offset from center)
  // to ensure they never clip during pan/zoom.
  const SIZE = 10000;

  return (
    <g className="quadrant-backgrounds">
      <defs>
        <radialGradient id="grad-leading" cx="0%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-weakening" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-lagging" cx="100%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-improving" cx="100%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Leading (top-right) -> x > cx, y < cy (y-axis is inverted in SVG) */}
      <rect x={cx} y={cy - SIZE} width={SIZE} height={SIZE} fill="url(#grad-leading)" />
      
      {/* Weakening (bottom-right) -> x > cx, y > cy */}
      <rect x={cx} y={cy} width={SIZE} height={SIZE} fill="url(#grad-weakening)" />
      
      {/* Lagging (bottom-left) -> x < cx, y > cy */}
      <rect x={cx - SIZE} y={cy} width={SIZE} height={SIZE} fill="url(#grad-lagging)" />
      
      {/* Improving (top-left) -> x < cx, y < cy */}
      <rect x={cx - SIZE} y={cy - SIZE} width={SIZE} height={SIZE} fill="url(#grad-improving)" />
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\QuadrantLabels.tsx
import React from 'react';
import type { ChartDimensions } from '../../../types';

interface QuadrantLabelsProps {
  dims: ChartDimensions;
}

export const QuadrantLabels: React.FC<QuadrantLabelsProps> = React.memo(({ dims }) => {
  const { innerWidth, innerHeight } = dims;

  return (
    <g className="quadrant-labels">
      <text x={innerWidth - 20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#1b6f38" textAnchor="end">LEADING</text>
      <text x={innerWidth - 20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#7f6900" textAnchor="end">WEAKENING</text>
      <text x={20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#6a1511" textAnchor="start">LAGGING</text>
      <text x={20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#0f4663" textAnchor="start">IMPROVING</text>
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\QuadrantLayer.tsx
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';

interface QuadrantLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
}

export const QuadrantLayer: React.FC<QuadrantLayerProps> = React.memo(({ scales, dims }) => {
  const { innerWidth, innerHeight } = dims;

  const q1Ref = useRef<SVGRectElement>(null);
  const q2Ref = useRef<SVGRectElement>(null);
  const q3Ref = useRef<SVGRectElement>(null);
  const q4Ref = useRef<SVGRectElement>(null);

  useEffect(() => {
    const cx = scales.xScale(scales.center);
    const cy = scales.yScale(scales.center);
    const t = d3.transition().duration(500) as any;

    if (q1Ref.current) d3.select(q1Ref.current).transition(t).attr('x', cx).attr('width', Math.max(0, innerWidth - cx)).attr('height', Math.max(0, cy));
    if (q2Ref.current) d3.select(q2Ref.current).transition(t).attr('x', cx).attr('y', cy).attr('width', Math.max(0, innerWidth - cx)).attr('height', Math.max(0, innerHeight - cy));
    if (q3Ref.current) d3.select(q3Ref.current).transition(t).attr('y', cy).attr('width', Math.max(0, cx)).attr('height', Math.max(0, innerHeight - cy));
    if (q4Ref.current) d3.select(q4Ref.current).transition(t).attr('width', Math.max(0, cx)).attr('height', Math.max(0, cy));
  }, [scales, dims]);

  // Use gradient definitions
  return (
    <g className="quadrant-layer">
      <defs>
        <radialGradient id="grad-leading" cx="0%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-weakening" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-lagging" cx="100%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-improving" cx="100%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Leading (top-right: x > 100, y > 100 -> screen y < cy) */}
      <rect ref={q1Ref} y={0} fill="url(#grad-leading)" />
      
      {/* Weakening (bottom-right: x > 100, y < 100 -> screen y > cy) */}
      <rect ref={q2Ref} fill="url(#grad-weakening)" />
      
      {/* Lagging (bottom-left: x < 100, y < 100 -> screen y > cy) */}
      <rect ref={q3Ref} x={0} fill="url(#grad-lagging)" />
      
      {/* Improving (top-left: x < 100, y > 100 -> screen y < cy) */}
      <rect ref={q4Ref} x={0} y={0} fill="url(#grad-improving)" />

      {/* Labels */}
      <text x={innerWidth - 20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#1b6f38" textAnchor="end">LEADING</text>
      <text x={innerWidth - 20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#7f6900" textAnchor="end">WEAKENING</text>
      <text x={20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#6a1511" textAnchor="start">LAGGING</text>
      <text x={20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#0f4663" textAnchor="start">IMPROVING</text>
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\TooltipLayer.tsx
import React from 'react';
import { useRrgStore } from '../../../stores/useRrgStore';
import { cleanSectorName } from '../../../core/math';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions, EnrichedRrgPoint } from '../../../types';

interface TooltipLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  dims: ChartDimensions;
}

export const TooltipLayer: React.FC<TooltipLayerProps> = React.memo(({ data, scales, dims }) => {
  const hoveredSector = useRrgStore(s => s.hoveredSector);

  if (!hoveredSector) return null;

  const point = data.find(d => d.symbol === hoveredSector);
  if (!point) return null;

  const cx = scales.xScale(point.x);
  const cy = scales.yScale(point.y);

  const tooltipWidth = 180;
  const tooltipHeight = 130;

  let x = cx + 15;
  let y = cy + 15;
  if (x + tooltipWidth > dims.width) x = cx - tooltipWidth - 15;
  if (y + tooltipHeight > dims.height) y = cy - tooltipHeight - 15;

  return (
    <g className="tooltip-layer" pointerEvents="none">
      <foreignObject x={x} y={y} width={tooltipWidth} height={tooltipHeight}>
        <div style={{
          background: '#111111',
          border: '1px solid #333333',
          padding: '8px',
          borderRadius: '4px',
          color: '#E0E0E0',
          fontFamily: 'monospace',
          fontSize: '11px',
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
            {cleanSectorName(point.symbol)}
          </div>
          <div>RS-Ratio: {point.x.toFixed(2)}</div>
          <div>RS-Momentum: {point.y.toFixed(2)}</div>
          <div>Quadrant: {point.quadrant}</div>
          <div>Velocity: {point.velocity?.toFixed(2) || 'N/A'}</div>
          <div>Heading: {point.heading || 'N/A'}</div>
          <div>Distance: {point.distance?.toFixed(2) || 'N/A'}</div>
          {point.stale && point.computedAt && (
            <div style={{ color: '#FFB74D', marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px', fontStyle: 'italic' }}>
              Last Updated: {Math.round((Date.now() - point.computedAt) / 1000)}s ago (Stale)
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
});
```

```tsx
// File: src\components\chart\layers\TrailLayer.tsx
import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { getQuadrantColor } from '../../../themes/bloomberg';
import { catmullRomPath, trailOpacities, trailWidths } from '../../../core/animation';
import type { Quadrant } from '../../../types';

const getPointQuadrant = (x: number, y: number, center: number = 100): Quadrant => {
  if (x >= center && y >= center) return 'LEADING';
  if (x >= center && y < center) return 'WEAKENING';
  if (x < center && y < center) return 'LAGGING';
  return 'IMPROVING';
};

interface TrailElementProps {
  d: EnrichedRrgPoint;
  scales: RrgScales;
  isSelected: boolean;
  isHovered: boolean;
  isFaded: boolean;
  zoom: number;
  isStressed: boolean;
}

const TrailElement = React.memo(({ d, scales, isSelected, isHovered, isFaded, isStressed, zoom }: TrailElementProps) => {
  let showArrows = true;

  let simplify = isStressed;

  const adjZoom = Math.max(0.1, zoom);

  const geometry = useMemo(() => {
    let rawTrail = d.trail;
    
    if (simplify && !isSelected && !isHovered) {
      // Simplify geometry by skipping segments
      rawTrail = rawTrail.filter((_, i) => i % 2 === 0 || i === rawTrail.length - 1);
    }

    const points = rawTrail.map(t => ({
      x: scales.xScale(t.x),
      y: scales.yScale(t.y),
      quadrant: getPointQuadrant(t.x, t.y, scales.center)
    }));
    
    const lastT = rawTrail[rawTrail.length - 1];
    if (lastT && (lastT.x !== d.x || lastT.y !== d.y)) {
       points.push({ x: scales.xScale(d.x), y: scales.yScale(d.y), quadrant: getPointQuadrant(d.x, d.y, scales.center) });
    }

    const opacities = trailOpacities(points.length);
    const widths = trailWidths(points.length);

    const segments = points.slice(0, points.length - 1).map((p, i) => {
      const nextP = points[i + 1];
      return {
        key: `segment-${i}`,
        pathD: catmullRomPath([p, nextP]),
        segmentColor: getQuadrantColor(nextP.quadrant as any).text,
        width: widths[i] || 1.5,
        opacity: opacities[i] || 0.5,
        nextQuadrant: nextP.quadrant
      };
    });

    return segments;
  }, [d, scales, isSelected, isHovered, simplify]);

  if (!geometry) return null;

  const ageMs = d.computedAt ? Date.now() - d.computedAt : 0;
  let staleOpacity = 0.3;
  if (d.stale) {
    if (ageMs > 600000) staleOpacity = 0.15;
    else if (ageMs > 120000) staleOpacity = 0.2;
    else staleOpacity = 0.25;
  }

  let baseOpacity = 0.3;
  if (isFaded) baseOpacity = 0.15;
  else if (isSelected || isHovered) baseOpacity = 1.0;
  else baseOpacity = staleOpacity;

  return (
    <g 
      opacity={baseOpacity} 
      onMouseEnter={() => (d as any).setHoveredSector?.(d.symbol)} 
      onMouseLeave={() => (d as any).setHoveredSector?.(null)}
      style={{ cursor: 'pointer' }}
    >
      {geometry.map(seg => {
        const segWidth = isHovered ? seg.width * 1.5 : seg.width;
        const strokeWidth = segWidth / adjZoom;

        return (
          <path
            key={seg.key}
            d={seg.pathD}
            stroke={seg.segmentColor}
            strokeWidth={strokeWidth}
            strokeOpacity={seg.opacity}
            fill="none"
            markerEnd={showArrows ? `url(#arrowhead-${seg.nextQuadrant})` : undefined}
            style={
              (isSelected || isHovered)
                ? { filter: 'url(#glow)', pointerEvents: 'stroke' }
                : { pointerEvents: 'stroke' }
            }
          />
        );
      })}
    </g>
  );
});

interface TrailLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  showTrail: boolean;
  selectedSector: string | null;
  hoveredSector: string | null;
  zoom: number;
  isStressed: boolean;
  setHoveredSector: (symbol: string | null) => void;
}

export const TrailLayer: React.FC<TrailLayerProps> = React.memo(({ data, scales, showTrail, selectedSector, hoveredSector, zoom, isStressed, setHoveredSector }) => {
  if (!showTrail) return null;

  return (
    <g className="trail-layer">
      {data.map(d => {
        if (!d.trail || d.trail.length < 2) return null;

        const isSelected = selectedSector === d.symbol;
        const isHovered = hoveredSector === d.symbol;
        const isFaded = !!(selectedSector || hoveredSector) && !isSelected && !isHovered;

        return (
          <TrailElement 
            key={`trail-${d.symbol}`} 
            d={{...d, setHoveredSector} as any} 
            scales={scales} 
            isSelected={isSelected} 
            isHovered={isHovered} 
            isFaded={isFaded} 
            zoom={zoom} 
            isStressed={isStressed} 
          />
        );
      })}
    </g>
  );
});
```

```tsx
// File: src\components\chart\RrgScene.tsx
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { computeDomain, createScales } from '../../core/scales';
import { useViewportStore } from '../../stores/useViewportStore';
import { useShallow } from 'zustand/react/shallow';
import { getQuadrantColor } from '../../themes/bloomberg';

import { GridLayer } from './layers/GridLayer';
import { QuadrantBackgrounds } from './layers/QuadrantBackgrounds';
import { QuadrantLabels } from './layers/QuadrantLabels';
import { CrosshairCenterLayer } from './layers/CrosshairCenterLayer';
import { AxisLayer } from './layers/AxisLayer';
import { TrailLayer } from './layers/TrailLayer';
import { PointLayer } from './layers/PointLayer';
import { LabelLayer } from './layers/LabelLayer';
import { CrosshairLayer } from './layers/CrosshairLayer';
import { TooltipLayer } from './layers/TooltipLayer';
import type { ChartDimensions, EnrichedRrgPoint } from '../../types';

function useViewportHandler(svgRef: React.RefObject<SVGSVGElement | null>, dims: ChartDimensions) {
  const { zoomBy, resetToFit } = useViewportStore(useShallow(s => ({ zoomBy: s.zoomBy, resetToFit: s.resetToFit })));

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - dims.margin.left;
      const mouseY = e.clientY - rect.top - dims.margin.top;

      zoomBy(e.deltaY, mouseX, mouseY);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [svgRef, zoomBy, dims.margin.left, dims.margin.top]);

  return {
    onDoubleClick: resetToFit
  };
}

function useCameraInterpolation(targetFitZoom: number, targetFitOffsetX: number, targetFitOffsetY: number, targetInteractionZoom: number, targetInteractionOffsetX: number, targetInteractionOffsetY: number) {
  const [renderState, setRenderState] = useState({
    fitZoom: targetFitZoom, fitOffsetX: targetFitOffsetX, fitOffsetY: targetFitOffsetY,
    intZoom: targetInteractionZoom, intOffsetX: targetInteractionOffsetX, intOffsetY: targetInteractionOffsetY,
    isStressed: false
  });

  const stateRef = useRef(renderState);

  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const current = stateRef.current;
      const lerp = (start: number, end: number, factor = 0.25) => {
        const diff = end - start;
        if (Math.abs(diff) < 0.001) return end;
        return start + diff * factor;
      };

      const nFitZoom = lerp(current.fitZoom, targetFitZoom);
      const nFitOffsetX = lerp(current.fitOffsetX, targetFitOffsetX);
      const nFitOffsetY = lerp(current.fitOffsetY, targetFitOffsetY);
      const nIntZoom = lerp(current.intZoom, targetInteractionZoom);
      const nIntOffsetX = lerp(current.intOffsetX, targetInteractionOffsetX);
      const nIntOffsetY = lerp(current.intOffsetY, targetInteractionOffsetY);

      const quantZoom = (z: number) => Math.round(z * 1000) / 1000;
      const quantPos = (p: number) => Math.round(p * 100) / 100;

      const sanitize = (v: number, fallback: number) => Number.isFinite(v) ? v : fallback;

      const newState = {
        fitZoom: sanitize(quantZoom(nFitZoom), 1),
        fitOffsetX: sanitize(quantPos(nFitOffsetX), 0),
        fitOffsetY: sanitize(quantPos(nFitOffsetY), 0),
        intZoom: sanitize(quantZoom(nIntZoom), 1),
        intOffsetX: sanitize(quantPos(nIntOffsetX), 0),
        intOffsetY: sanitize(quantPos(nIntOffsetY), 0),
        isStressed: dt > 16 // Frame budget guard
      };

      const changed =
        newState.fitZoom !== current.fitZoom || newState.fitOffsetX !== current.fitOffsetX || newState.fitOffsetY !== current.fitOffsetY ||
        newState.intZoom !== current.intZoom || newState.intOffsetX !== current.intOffsetX || newState.intOffsetY !== current.intOffsetY ||
        newState.isStressed !== current.isStressed;

      if (changed) {
        stateRef.current = newState;
        setRenderState(newState);
        rafId = requestAnimationFrame(loop);
      } else if (newState.isStressed) {
        stateRef.current.isStressed = false;
        setRenderState({ ...newState, isStressed: false });
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY]);

  return { renderState, stateRef };
}

export const RrgScene: React.FC = React.memo(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const margin = { top: 30, right: 30, bottom: 48, left: 56 };
  const dims: ChartDimensions = useMemo(() => ({
    width: dimensions.width,
    height: dimensions.height,
    margin,
    innerWidth: dimensions.width - margin.left - margin.right,
    innerHeight: dimensions.height - margin.top - margin.bottom
  }), [dimensions.width, dimensions.height]);

  const rawEnrichedData = useRrgStore(s => s.enrichedData);
  const hiddenSectors = useRrgStore(s => s.hiddenSectors);
  const enrichedData = useMemo(() => {
    return (rawEnrichedData as unknown as EnrichedRrgPoint[]).filter(d => !hiddenSectors.includes(d.symbol));
  }, [rawEnrichedData, hiddenSectors]);

  const {
    selectedSector, hoveredSector, setHoveredSector, setSelectedSector, setCrosshair, watchlist
  } = useRrgStore(useShallow(s => ({
    selectedSector: s.selectedSector,
    hoveredSector: s.hoveredSector,
    setHoveredSector: s.setHoveredSector,
    setSelectedSector: s.setSelectedSector,
    setCrosshair: s.setCrosshair,
    watchlist: s.watchlist
  })));

  const showTrails = useCommandBarStore(s => s.showTrails);
  const normalized = useCommandBarStore(s => s.normalized);

  const {
    targetFitZoom, targetFitOffsetX, targetFitOffsetY,
    targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY,
    setDimensions: setViewportDimensions, startDrag, updateDrag, endDrag, screenToWorld
  } = useViewportStore(useShallow(s => ({
    targetFitZoom: s.targetFitZoom, targetFitOffsetX: s.targetFitOffsetX, targetFitOffsetY: s.targetFitOffsetY,
    targetInteractionZoom: s.targetInteractionZoom, targetInteractionOffsetX: s.targetInteractionOffsetX, targetInteractionOffsetY: s.targetInteractionOffsetY,
    setDimensions: s.setDimensions, startDrag: s.startDrag, updateDrag: s.updateDrag, endDrag: s.endDrag, screenToWorld: s.screenToWorld
  })));

  const { renderState, stateRef } = useCameraInterpolation(targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY);
  const finalZoom = renderState.fitZoom * renderState.intZoom;

  useEffect(() => {
    setViewportDimensions(dims.innerWidth, dims.innerHeight, dims.innerWidth, dims.innerHeight);
  }, [dims, setViewportDimensions]);

  const enabledCount = useMemo(() => watchlist.filter(w => w.enabled).length, [watchlist]);

  const { xDomain, yDomain, step } = useMemo(() => {
    const allX: number[] = [];
    const allY: number[] = [];
    enrichedData.forEach(d => {
      allX.push(d.x);
      allY.push(d.y);
      if (d.trail) {
        d.trail.forEach(t => {
          allX.push(t.x);
          allY.push(t.y);
        });
      }
    });
    if (allX.length === 0) return { xDomain: [90, 110] as [number, number], yDomain: [90, 110] as [number, number], step: 1 };
    return computeDomain(allX, allY, 0.001); // 12.5% proportional margin
  }, [enrichedData]);

  const scales = useMemo(() => {
    const center = normalized ? 100 : 1.0;
    return createScales(xDomain, yDomain, dims, center);
  }, [xDomain, yDomain, dims, normalized]);

  const setContentBounds = useViewportStore(s => s.setContentBounds);

  useEffect(() => {
    if (enrichedData.length > 0) {
      import('../../core/math').then(({ computeDataBounds }) => {
        const bounds = computeDataBounds(enrichedData as any);
        setContentBounds(bounds);
      });
    }
  }, [enrichedData, setContentBounds]);

  const marginTransform = `translate(${margin.left}, ${margin.top})`;

  const { onDoubleClick } = useViewportHandler(svgRef, dims);

  const mouseDownPos = useRef<{ x: number, y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    endDrag();
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx < 5 && dy < 5) {
        setSelectedSector(null);
      }
    }
    mouseDownPos.current = null;
  }, [endDrag, setSelectedSector]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;

    updateDrag(e.clientX, e.clientY);

    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left - margin.left;
    const sy = e.clientY - rect.top - margin.top;

    const { fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY } = stateRef.current;
    const fitX = (sx - fitOffsetX) / fitZoom;
    const fitY = (sy - fitOffsetY) / fitZoom;

    const worldX = (fitX - intOffsetX) / intZoom;
    const worldY = (fitY - intOffsetY) / intZoom;

    const rawX = scales.xScale.invert(worldX);
    const rawY = scales.yScale.invert(worldY);
    setCrosshair(rawX, rawY);
  }, [scales, setCrosshair, margin.left, margin.top, updateDrag, screenToWorld, stateRef]);

  const handleMouseLeave = useCallback(() => {
    endDrag();
    setCrosshair(null, null);
  }, [setCrosshair, endDrag]);

  return (
    <div id="rrg-scene-container" ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <svg
        id="rrg-scene-svg"
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: renderState.intZoom > 1 ? 'grab' : 'crosshair', background: 'transparent', display: 'block' }}
        onDoubleClick={onDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <clipPath id="plot-clip">
            <rect x={0} y={0} width={dims.innerWidth} height={dims.innerHeight} />
          </clipPath>
          {['LEADING', 'WEAKENING', 'LAGGING', 'IMPROVING'].map((quad) => {
            const color = getQuadrantColor(quad as any).text;
            return (
              <marker key={`arrow-${quad}`} id={`arrowhead-${quad}`} viewBox="0 -5 10 10" refX="8" refY="0" markerUnits="strokeWidth" orient="auto" markerWidth="6" markerHeight="6">
                <path d="M 0,-5 L 10,0 L 0,5" fill={color} style={{ stroke: 'none' }} />
              </marker>
            );
          })}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <g transform={marginTransform}>
          <g className="export-layer">
            {enabledCount === 0 ? (
              <text
                x={dims.innerWidth / 2}
                y={dims.innerHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                fontSize="24px"
                fontWeight="bold"
              >
                NO SECTORS SELECTED
              </text>
            ) : (
              <>
                {/* STATIC LAYERS - NEVER SCALED */}
                <g className="ui-layer">
                  <QuadrantLabels dims={dims} />
                  <AxisLayer scales={scales} dims={dims} />
                </g>

                {/* CLIPPED PLOT - ZOOMED */}
                <g clipPath="url(#plot-clip)">
                  {/* Explicit Camera Matrix Composition Rule */}
                  <g transform={`translate(${renderState.fitOffsetX}, ${renderState.fitOffsetY})`}>
                    <g transform={`scale(${renderState.fitZoom})`}>
                      <g transform={`translate(${renderState.intOffsetX}, ${renderState.intOffsetY})`}>
                        <g transform={`scale(${renderState.intZoom})`}>
                          <QuadrantBackgrounds scales={scales} />
                          <GridLayer scales={scales} dims={dims} xDomain={xDomain} yDomain={yDomain} step={step} />
                          <CrosshairCenterLayer scales={scales} />
                          <TrailLayer data={enrichedData} scales={scales} showTrail={showTrails} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} isStressed={renderState.isStressed} setHoveredSector={setHoveredSector} />
                          <PointLayer data={enrichedData} scales={scales} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} setHoveredSector={setHoveredSector} />
                        </g>
                      </g>
                    </g>
                  </g>
                  <LabelLayer data={enrichedData} scales={scales} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} isStressed={renderState.isStressed} renderState={renderState} setHoveredSector={setHoveredSector} setSelectedSector={setSelectedSector} />
                </g>

                {/* INTERACTION OVERLAYS */}
                <g className="overlay-layer">
                  <CrosshairLayer dims={dims} scales={scales} />
                  <TooltipLayer data={enrichedData} scales={scales} dims={dims} />
                </g>
              </>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
});
```

```css
// File: src\components\MetricsPanel.css
.metrics {
  padding: 12px;
  background-color: var(--bg-panel, #121212);
  border-top: 1px solid var(--border-primary, #333);
  height: 240px;
  background: var(--bg-panel);
  padding: var(--space-md) var(--space-xl);
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-primary);
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: var(--font-size-sm, 12px);
  color: var(--text-primary, #eee);
  box-sizing: border-box;
}

.metrics__empty {
  color: var(--text-muted, #777);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.metrics__header {
  color: var(--text-primary, #eee);
  font-weight: bold;
}

.metrics__divider {
  color: var(--border-secondary, #444);
  margin-bottom: 8px;
  overflow: hidden;
  white-space: nowrap;
}

.metrics__row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.metrics__label {
  color: var(--text-secondary, #aaa);
}

.metrics__value {
  color: var(--text-primary, #eee);
  text-align: right;
}
```

```tsx
// File: src\components\MetricsPanel.tsx
import React, { useMemo, memo } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import './MetricsPanel.css';

import { cleanSectorName } from '../core/math';

const MetricsPanel: React.FC = memo(() => {
  const { selectedSector, hoveredSector, enrichedData } = useRrgStore();

  const activeSector = hoveredSector || selectedSector;
  
  const sectorData = useMemo(() => {
    if (!activeSector || !enrichedData) return null;
    return enrichedData.find((d: any) => d.symbol === activeSector);
  }, [activeSector, enrichedData]);

  if (!sectorData) {
    return (
      <div className="metrics metrics__empty">
        Select a sector
      </div>
    );
  }

  const getQuadrantColorVar = (quadrant: string) => {
    switch (quadrant?.toUpperCase()) {
      case 'LEADING': return 'var(--quadrant-leading-text, var(--quadrant-leading))';
      case 'WEAKENING': return 'var(--quadrant-weakening-text, var(--quadrant-weakening))';
      case 'LAGGING': return 'var(--quadrant-lagging-text, var(--quadrant-lagging))';
      case 'IMPROVING': return 'var(--quadrant-improving-text, var(--quadrant-improving))';
      default: return 'inherit';
    }
  };

  const formatNumber = (num: number) => num != null ? num.toFixed(2) : '---';

  return (
    <div className="metrics">
      <div className="metrics__header">
        SECTOR: {cleanSectorName(sectorData.symbol)}
      </div>
      <div className="metrics__divider">─────────────────</div>
      
      <div className="metrics__row">
        <span className="metrics__label">RS-RATIO</span>
        <span className="metrics__value">{formatNumber(sectorData.x)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">RS-MOMENTUM</span>
        <span className="metrics__value">{formatNumber(sectorData.y)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">QUADRANT</span>
        <span className="metrics__value" style={{ color: getQuadrantColorVar(sectorData.quadrant) }}>
          {sectorData.quadrant?.toUpperCase()}
        </span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">VELOCITY</span>
        <span className="metrics__value">{formatNumber(sectorData.velocity)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">HEADING</span>
        <span className="metrics__value">{sectorData.heading || '---'}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">DISTANCE</span>
        <span className="metrics__value">{formatNumber(sectorData.distance)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">CURVATURE</span>
        <span className="metrics__value">{formatNumber(sectorData.curvature)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">MOM ROC</span>
        <span className="metrics__value">{formatNumber(sectorData.momentumRoc)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">STRENGTH</span>
        <span className="metrics__value">{formatNumber(sectorData.trendStrength)}</span>
      </div>
    </div>
  );
});

export default MetricsPanel;
```

```css
// File: src\components\RankingPanel.css
.ranking {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-primary, #0a0a0a);
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: var(--font-size-sm, 12px);
  color: var(--text-primary, #eee);
  box-sizing: border-box;
  overflow: hidden;
}

.ranking__header {
  display: flex;
  padding: 4px 8px;
  background-color: var(--bg-panel, #121212);
  border-bottom: 1px solid var(--border-secondary, #444);
  color: var(--text-secondary, #aaa);
  font-weight: bold;
  user-select: none;
}

.ranking__row {
  display: flex;
  padding: 4px 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-primary, #1e1e1e);
}

.ranking__row:nth-child(even) {
  background-color: var(--bg-panel, #121212);
}

.ranking__row:hover {
  background-color: var(--bg-hover, #1e1e1e);
}

.ranking__row--selected {
  background-color: var(--bg-active, #222) !important;
  color: var(--accent-orange, #ff6b00);
}

.ranking__col {
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.ranking__col--num {
  width: 50px;
  text-align: right;
  padding-right: 8px;
}

.ranking__col--sector {
  flex: 1;
  min-width: 100px;
  padding-right: 8px;
}

.ranking__body {
  flex: 1;
  overflow-y: auto;
}

.ranking__body::-webkit-scrollbar {
  width: 6px;
}
.ranking__body::-webkit-scrollbar-track {
  background: var(--bg-primary, #0a0a0a);
}
.ranking__body::-webkit-scrollbar-thumb {
  background: var(--border-secondary, #444);
}
```

```tsx
// File: src\components\RankingPanel.tsx
import React, { useState, useMemo, memo } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import './RankingPanel.css';

import { cleanSectorName } from '../core/math';

type SortKey = 'symbol' | 'x' | 'y' | 'rank';

const RankingPanel: React.FC = memo(() => {
  const { enrichedData, selectedSector, setSelectedSector, hoveredSector, setHoveredSector } = useRrgStore();
  const [sortKey, setSortKey] = useState<SortKey>('x');
  const [sortDesc, setSortDesc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true); // Default to desc for new sort
    }
  };

  const sortedData = useMemo(() => {
    if (!enrichedData) return [];
    
    return [...enrichedData].sort((a: any, b: any) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // fallback handling for rank if not present
      if (sortKey === 'rank') {
        valA = a.trendStrength || a.x || 0;
        valB = b.trendStrength || b.x || 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      
      return sortDesc ? (valB - valA) : (valA - valB);
    });
  }, [enrichedData, sortKey, sortDesc]);

  const renderSortArrow = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDesc ? '▼' : '▲';
  };

  return (
    <div className="ranking">
      <div className="ranking__header">
        <div className="ranking__col ranking__col--num">#</div>
        <div 
          className="ranking__col ranking__col--sector" 
          onClick={() => handleSort('symbol')}
        >
          SECTOR {renderSortArrow('symbol')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('x')}
        >
          RS-R {renderSortArrow('x')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('y')}
        >
          MOM {renderSortArrow('y')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('rank')}
        >
          RANK {renderSortArrow('rank')}
        </div>
      </div>
      
      <div className="ranking__body">
        {sortedData.map((item: any, idx: number) => {
          const isSelected = selectedSector === item.symbol;
          const isHovered = hoveredSector === item.symbol;
          return (
            <div 
              key={item.symbol} 
              className={`ranking__row ${isSelected ? 'ranking__row--selected' : ''} ${isHovered && !isSelected ? 'ranking__row--hovered' : ''}`}
              onClick={() => setSelectedSector?.(item.symbol)}
              onMouseEnter={() => setHoveredSector?.(item.symbol)}
              onMouseLeave={() => setHoveredSector?.(null)}
            >
              <div className="ranking__col ranking__col--num">{idx + 1}</div>
              <div className="ranking__col ranking__col--sector" title={cleanSectorName(item.symbol)}>
                {cleanSectorName(item.symbol)}
              </div>
              <div className="ranking__col ranking__col--num">{Number(item.x || 0).toFixed(2)}</div>
              <div className="ranking__col ranking__col--num">{Number(item.y || 0).toFixed(2)}</div>
              <div className="ranking__col ranking__col--num">{item.rank || (idx + 1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default RankingPanel;
```

```css
// File: src\components\settings\SettingsModal.css
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  backdrop-filter: blur(4px);
}

.settings-modal {
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  font-family: 'IBM Plex Mono', monospace;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,0.8);
}

.settings-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #1f1f1f;
  background: #111;
  flex-shrink: 0;
}

.settings-modal__title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 3px;
  color: #FF9900;
  text-transform: uppercase;
}

.settings-modal__close {
  background: none;
  border: none;
  color: #909090;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}
.settings-modal__close:hover { color: #e0e0e0; }

.settings-modal__body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.settings-section {
  border-bottom: 1px solid #1a1a1a;
  padding: 12px 16px;
}

.settings-section__title {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 3px;
  color: #FF9900;
  text-transform: uppercase;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #1f1f1f;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  gap: 12px;
}

.settings-row__label {
  font-size: 10px;
  color: #909090;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

.settings-row__control {
  display: flex;
  gap: 4px;
  align-items: center;
}

.settings-btn {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #707070;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.settings-btn:hover { border-color: #FF9900; color: #e0e0e0; }
.settings-btn--active {
  background: rgba(255, 153, 0, 0.12);
  border-color: #FF9900;
  color: #FF9900;
}

.settings-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 140px;
  height: 3px;
  background: #2a2a2a;
  outline: none;
  border-radius: 0;
  cursor: pointer;
}
.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #FF9900;
  cursor: pointer;
  border-radius: 0;
}

.settings-input {
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  color: #e0e0e0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  padding: 3px 6px;
  width: 56px;
  text-align: right;
}
.settings-input:focus {
  outline: none;
  border-color: #FF9900;
}

.settings-select {
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  color: #e0e0e0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  padding: 3px 6px;
}
.settings-select:focus { outline: none; border-color: #FF9900; }

.settings-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #1f1f1f;
  background: #111;
  flex-shrink: 0;
}

.settings-footer-btn {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #909090;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  padding: 5px 14px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.15s;
}
.settings-footer-btn:hover { border-color: #FF9900; color: #FF9900; }
.settings-footer-btn--primary {
  background: rgba(255,153,0,0.15);
  border-color: #FF9900;
  color: #FF9900;
}

/* Toggle switch */
.settings-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}
.settings-toggle input { display: none; }
.settings-toggle__track {
  position: absolute;
  inset: 0;
  background: #1f1f1f;
  border: 1px solid #333;
  transition: all 0.2s;
}
.settings-toggle input:checked + .settings-toggle__track {
  background: rgba(255,153,0,0.2);
  border-color: #FF9900;
}
.settings-toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 10px;
  height: 10px;
  background: #555;
  transition: all 0.2s;
  pointer-events: none;
}
.settings-toggle input:checked + .settings-toggle__track + .settings-toggle__thumb {
  background: #FF9900;
  transform: translateX(18px);
}

/* Sector grid */
.settings-sector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.settings-sector-count {
  font-size: 9px;
  color: #707070;
  letter-spacing: 1px;
}

.settings-sector-actions {
  display: flex;
  gap: 4px;
}

.settings-sector-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  max-height: 150px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.settings-sector-btn {
  background: #111;
  border: 1px solid #222;
  color: #707070;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  padding: 4px 6px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.1s;
  letter-spacing: 0.3px;
}
.settings-sector-btn:hover { border-color: #555; color: #e0e0e0; }
.settings-sector-btn--active {
  background: rgba(255,153,0,0.08);
  border-color: rgba(255,153,0,0.5);
  color: #FF9900;
}

.settings-value-display {
  font-size: 9px;
  color: #FF9900;
  width: 36px;
  text-align: right;
  font-weight: 600;
}
```

```tsx
// File: src\components\settings\SettingsModal.tsx
import React, { useCallback } from 'react';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useRrgStore } from '../../stores/useRrgStore';
import { cleanSectorName } from '../../core/math';
import './SettingsModal.css';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// --- Sub-components ---

function ToggleRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <label className="settings-toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="settings-toggle__track" />
        <span className="settings-toggle__thumb" />
      </label>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, display, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control">
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="settings-slider"
        />
        <span className="settings-value-display">{display ?? value}</span>
      </div>
    </div>
  );
}

function SegmentRow({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control">
        {options.map(o => (
          <button
            key={o.value}
            className={`settings-btn ${value === o.value ? 'settings-btn--active' : ''}`}
            onClick={() => onChange(o.value)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// --- Main Modal ---

export const SettingsModal: React.FC<SettingsModalProps> = React.memo(({ open, onClose }) => {
  const settings = useChartSettingsStore();
  const commandBar = useCommandBarStore();
  const { watchlist, toggleSector, selectAllSectors, clearAllSectors } = useRrgStore();

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  const enabledCount = watchlist.filter(w => w.enabled).length;

  return (
    <div className="settings-overlay" onClick={handleOverlayClick} role="presentation">
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Chart Settings">

        {/* Header */}
        <div className="settings-modal__header">
          <span className="settings-modal__title">⚙ Chart Settings</span>
          <button className="settings-modal__close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-modal__body">

          {/* GENERAL */}
          <div className="settings-section">
            <div className="settings-section__title">General</div>

            <SegmentRow
              label="Timeframe"
              value={commandBar.timeframe}
              options={[
                { value: '1d', label: 'DAY' },
                { value: '1w', label: 'WEEK' },
                { value: '1mo', label: 'MONTH' },
              ]}
              onChange={v => commandBar.setTimeframe(v as any)}
            />

            <div className="settings-row">
              <span className="settings-row__label">Trail Length (Global)</span>
              <div className="settings-row__control">
                {[5, 10, 15, 20, 25, 30].map(l => (
                  <button
                    key={l}
                    className={`settings-btn ${commandBar.trailLength === l ? 'settings-btn--active' : ''}`}
                    onClick={() => commandBar.setTrailLength(l)}
                  >{l}</button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="Normalize RRG (100 Center)"
              checked={commandBar.normalized}
              onChange={commandBar.setNormalized}
            />
          </div>

          {/* VISUALS */}
          <div className="settings-section">
            <div className="settings-section__title">Visuals</div>

            <ToggleRow
              label="Show Trails"
              checked={commandBar.showTrails}
              onChange={commandBar.setShowTrails}
            />

            <SliderRow
              label="Animation Speed"
              value={settings.animationSpeed}
              min={0.25} max={4} step={0.25}
              display={`${settings.animationSpeed}x`}
              onChange={settings.setAnimationSpeed}
            />
          </div>

          {/* OPTIMIZATIONS */}
          <div className="settings-section">
            <div className="settings-section__title">Optimizations</div>
            <div className="settings-row" title="Optimized for live visualization performance. Replay/export modes automatically use full history.">
              <span className="settings-row__label">Minimal Window Resampling</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.minimalWindowResampling} onChange={e => settings.setMinimalWindowResampling(e.target.checked)} />
                <span className="settings-toggle__track" />
                <span className="settings-toggle__thumb" />
              </label>
            </div>
            <div className="settings-row" title="Only sectors currently in the watchlist will be resampled during timeframe changes to improve responsiveness.">
              <span className="settings-row__label">Optimize Timeframe Switching (Resample Watchlist Only)</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={settings.watchlistOnlyResampling} onChange={e => settings.setWatchlistOnlyResampling(e.target.checked)} />
                <span className="settings-toggle__track" />
                <span className="settings-toggle__thumb" />
              </label>
            </div>
          </div>

          {/* VISUAL */}
          <div className="settings-section">
            <div className="settings-section__title">Visual</div>
            <ToggleRow label="Show Trails" checked={commandBar.showTrails} onChange={commandBar.setShowTrails} />
            <ToggleRow label="Show Labels" checked={settings.showLabels} onChange={settings.setShowLabels} />
            <ToggleRow label="Normalized Mode" checked={commandBar.normalized} onChange={commandBar.setNormalized} />
            <SegmentRow
              label="Grid Density"
              value={settings.gridDensity}
              options={[
                { value: 'sparse', label: 'SPARSE' },
                { value: 'normal', label: 'NORMAL' },
                { value: 'dense', label: 'DENSE' },
              ]}
              onChange={v => settings.setGridDensity(v as any)}
            />
            <SliderRow
              label="Quadrant Opacity"
              value={Math.round(settings.quadrantOpacity * 100)}
              min={5} max={50} step={1}
              display={`${Math.round(settings.quadrantOpacity * 100)}%`}
              onChange={v => settings.setQuadrantOpacity(v / 100)}
            />
          </div>

          {/* SECTORS */}
          <div className="settings-section">
            <div className="settings-section__title">Sectors</div>
            <div className="settings-sector-header">
              <span className="settings-sector-count">{enabledCount} / {watchlist.length} ACTIVE</span>
              <div className="settings-sector-actions">
                <button className="settings-btn" onClick={selectAllSectors}>ALL</button>
                <button className="settings-btn" onClick={clearAllSectors}>NONE</button>
              </div>
            </div>
            <div className="settings-sector-grid">
              {watchlist.map(w => (
                <button
                  key={w.symbol}
                  className={`settings-sector-btn ${w.enabled ? 'settings-sector-btn--active' : ''}`}
                  onClick={() => toggleSector(w.symbol)}
                  title={cleanSectorName(w.symbol)}
                >
                  {cleanSectorName(w.symbol)}
                </button>
              ))}
            </div>
          </div>

          {/* VIEWPORT */}
          <div className="settings-section">
            <div className="settings-section__title">Viewport</div>
            <SliderRow
              label="Zoom Sensitivity"
              value={settings.zoomSensitivity}
              min={0.05} max={0.5} step={0.05}
              display={String(settings.zoomSensitivity)}
              onChange={settings.setZoomSensitivity}
            />
            <SliderRow
              label="Pan Sensitivity"
              value={settings.panSensitivity}
              min={0.25} max={3} step={0.25}
              display={String(settings.panSensitivity)}
              onChange={settings.setPanSensitivity}
            />
            <div className="settings-row">
              <span className="settings-row__label">Zoom Range (Min — Max)</span>
              <div className="settings-row__control" style={{ gap: 6 }}>
                <input
                  type="number" min={0.3} max={1} step={0.1}
                  value={settings.minZoom}
                  onChange={e => settings.setMinZoom(parseFloat(e.target.value))}
                  className="settings-input"
                />
                <span style={{ fontSize: 9, color: '#555' }}>—</span>
                <input
                  type="number" min={2} max={20} step={1}
                  value={settings.maxZoom}
                  onChange={e => settings.setMaxZoom(parseFloat(e.target.value))}
                  className="settings-input"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="settings-modal__footer">
          <button className="settings-footer-btn" onClick={settings.resetDefaults}>RESET DEFAULTS</button>
          <button className="settings-footer-btn settings-footer-btn--primary" onClick={onClose}>APPLY</button>
        </div>

      </div>
    </div>
  );
});
```

```tsx
// File: src\components\Sidebar.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface SidebarProps {
    benchmark: string;
    setBenchmark: (b: string) => void;
    timeframe: string;
    setTimeframe: (t: string) => void;
    trailLength: number;
    setTrailLength: (l: number) => void;
    loading: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
    benchmark, setBenchmark, timeframe, setTimeframe, trailLength, setTrailLength, loading
}) => {
    const [sectors, setSectors] = useState<string[]>([]);

    useEffect(() => {
        axios.get('http://localhost:8080/api/rrg/sectors')
            .then(res => setSectors(res.data))
            .catch(err => console.error(err));
    }, []);

    return (
        <div className="w-64 border-r border-gray-800 p-4 flex flex-col gap-6 bg-zinc-900">
            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Benchmark</label>
                <select 
                    value={benchmark} 
                    onChange={(e) => setBenchmark(e.target.value)}
                    className="w-full bg-black border border-gray-700 p-2 text-sm outline-none focus:border-orange-500"
                >
                    {sectors.map(s => (
                        <option key={s} value={s}>{s.replace('NSE_INDEX__', '').replace(/_/g, ' ')}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Timeframe</label>
                <div className="grid grid-cols-2 gap-2">
                    {['day', 'week', 'month'].map(t => (
                        <button 
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`p-2 text-xs uppercase border ${timeframe === t ? 'bg-orange-500 text-black border-orange-500' : 'border-gray-700'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-xs uppercase opacity-50 mb-2">Trail Length ({trailLength})</label>
                <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={trailLength}
                    onChange={(e) => setTrailLength(parseInt(e.target.value))}
                    className="w-full accent-orange-500"
                />
            </div>

            {loading && (
                <div className="mt-auto text-xs animate-pulse">Loading data...</div>
            )}
        </div>
    );
};

export default Sidebar;
```

```css
// File: src\components\terminal\CommandBar.css
.command-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: var(--command-bar-height, 42px);
  background-color: var(--bg-command, #1e1e1e);
  border-bottom: 1px solid var(--border-primary, #333);
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: var(--font-size-sm, 12px);
  color: var(--text-primary, #eee);
  box-sizing: border-box;
}

.command-bar__benchmark {
  background-color: var(--bg-input, #000);
  color: var(--text-primary, #eee);
  border: 1px solid var(--border-secondary, #444);
  padding: 2px 8px;
  font-family: inherit;
  font-size: inherit;
  outline: none;
  border-radius: var(--radius-none, 0);
  cursor: pointer;
  text-transform: uppercase;
}

.command-bar__benchmark:focus {
  border-color: var(--accent-orange, #ff6b00);
}

.command-bar__group {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-secondary, #444);
}

.command-bar__segment-btn {
  background-color: var(--bg-panel, #2a2a2a);
  color: var(--text-secondary, #aaa);
  border: none;
  border-right: 1px solid var(--border-secondary, #444);
  padding: 4px 10px;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  outline: none;
  border-radius: var(--radius-none, 0);
  border-bottom: 2px solid transparent;
}

.command-bar__segment-btn:last-child {
  border-right: none;
}

.command-bar__segment-btn:hover {
  background-color: var(--bg-hover, #333);
  color: var(--text-primary, #eee);
}

.command-bar__segment-btn--active {
  color: var(--text-primary, #eee);
  border-bottom: 2px solid var(--accent-orange, #ff6b00);
  background-color: var(--bg-active, #222);
}

.command-bar__toggle {
  background: none;
  border: none;
  color: var(--text-secondary, #aaa);
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  border-radius: var(--radius-none, 0);
}

.command-bar__toggle:hover {
  color: var(--text-primary, #eee);
}

.command-bar__toggle--active {
  color: var(--accent-orange, #ff6b00);
}

.command-bar__playback {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.command-bar__playback-btn {
  background: none;
  border: 1px solid var(--border-secondary, #444);
  color: var(--text-primary, #eee);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-none, 0);
}

.command-bar__playback-btn:hover {
  border-color: var(--accent-orange, #ff6b00);
  color: var(--accent-orange, #ff6b00);
}

.command-bar__export-btn {
  background-color: transparent;
  color: var(--text-secondary, #aaa);
  border: 1px solid var(--border-secondary, #444);
  padding: 2px 12px;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  margin-left: 8px;
  border-radius: var(--radius-none, 0);
}

.command-bar__export-btn:hover {
  color: var(--text-primary, #eee);
  border-color: var(--text-secondary, #aaa);
}

.command-bar__spacer {
  flex: 1;
}

.command-bar__clock {
  color: var(--text-muted, #777);
  font-size: var(--font-size-xs, 10px);
}

.command-bar__settings-btn {
  background: none;
  border: 1px solid #2a2a2a;
  color: #FF9900;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  padding: 4px 10px;
  cursor: pointer;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  transition: all 0.15s;
  white-space: nowrap;
}
.command-bar__settings-btn:hover {
  background: rgba(255,153,0,0.1);
  border-color: #FF9900;
}
```

```tsx
// File: src\components\terminal\CommandBar.tsx
import React, { useState, useEffect, useRef, memo } from 'react';
import { cleanSectorName } from '../../core/math';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { SettingsModal } from '../settings/SettingsModal';
import { parseTimeframe, TimeUnit } from '../../core/TimeframeParser';
import './CommandBar.css';

const CommandBar: React.FC = memo(() => {
  const {
    timeframe, setTimeframe,
    trailLength, setTrailLength,
    bookmarkedTrailLengths, setBookmarkedTrailLengths,
    bookmarkedTimeframes, setBookmarkedTimeframes,
    recentTimeframes,
    showTrails, setShowTrails,
    normalized, setNormalized,
  } = useCommandBarStore();

  const { benchmark, setBenchmark } = useChartSettingsStore();
  const { sectors, isPlaying, setIsPlaying } = useRrgStore();

  const [time, setTime] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customTrailPopupOpen, setCustomTrailPopupOpen] = useState(false);
  const [customTfPopupOpen, setCustomTfPopupOpen] = useState(false);
  const [customLen, setCustomLen] = useState<number>(10);
  const [customTfNum, setCustomTfNum] = useState<number>(45);
  const [customTfUnit, setCustomTfUnit] = useState<TimeUnit>(TimeUnit.MINUTE);
  const popupRef = useRef<HTMLDivElement>(null);
  const tfPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setCustomTrailPopupOpen(false);
      }
      if (tfPopupRef.current && !tfPopupRef.current.contains(event.target as Node)) {
        setCustomTfPopupOpen(false);
      }
    };
    if (customTrailPopupOpen || customTfPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [customTrailPopupOpen, customTfPopupOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: string) => {
    try {
      if (format === 'SVG') {
        const svgEl = document.getElementById('rrg-scene-svg');
        if (!svgEl) return;
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, 'rrg-export.svg');
      } else if (format === 'PNG') {
        const container = document.getElementById('rrg-scene-container');
        if (!container) return;
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(container);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'rrg-export.png';
        a.click();
      } else if (format === 'CSV') {
        const data = useRrgStore.getState().enrichedData;
        const header = 'symbol,x,y,quadrant,velocity\n';
        const rows = data.map((d: any) => `${d.symbol},${d.x},${d.y},${d.quadrant},${d.velocity || 0}`).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'rrg-export.csv');
      } else if (format === 'JSON') {
        const state = useRrgStore.getState();
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, 'rrg-state.json');
      }
    } catch (err) {
      console.error('Export failed', err);
    }
  };



  return (
    <div className="command-bar">
      <select 
        className="command-bar__benchmark" 
        value={benchmark || ''} 
        onChange={(e) => setBenchmark?.(e.target.value)}
      >
        {sectors?.map((s: string) => (
          <option key={s} value={s}>{cleanSectorName(s)}</option>
        ))}
      </select>

      <div className="command-bar__group command-bar__timeframe">
        {bookmarkedTimeframes.map(tfValue => {
          let label = tfValue;
          let isActive = timeframe === tfValue;
          try {
            label = parseTimeframe(tfValue).displayLabel.toUpperCase();
            isActive = parseTimeframe(timeframe).canonical === parseTimeframe(tfValue).canonical;
          } catch {}
          return (
            <button
              key={tfValue}
              className={`command-bar__segment-btn ${isActive ? 'command-bar__segment-btn--active' : ''}`}
              onClick={() => setTimeframe(tfValue)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (bookmarkedTimeframes.length > 1) {
                  setBookmarkedTimeframes(bookmarkedTimeframes.filter(x => x !== tfValue));
                }
              }}
              title="Right-click to remove bookmark"
            >
              {label}
            </button>
          );
        })}
        <div ref={tfPopupRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="command-bar__segment-btn"
            onClick={() => setCustomTfPopupOpen(!customTfPopupOpen)}
            style={{ fontWeight: 'bold' }}
            title="Add Custom Timeframe"
          >
            +
          </button>
          {customTfPopupOpen && (
            <div className="command-bar__popup" style={{
              position: 'absolute', top: '100%', left: '0', 
              background: '#111', border: '1px solid #333', 
              padding: '8px', zIndex: 100, display: 'flex', gap: '4px',
              marginTop: '4px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              flexDirection: 'column', width: '220px'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input 
                  type="number" 
                  value={customTfNum} 
                  onChange={e => setCustomTfNum(parseInt(e.target.value) || 0)}
                  style={{ width: '50px', background: '#222', color: '#fff', border: '1px solid #444', textAlign: 'center', borderRadius: '2px' }}
                  min={1}
                />
                <select 
                  value={customTfUnit} 
                  onChange={e => setCustomTfUnit(e.target.value as TimeUnit)}
                  style={{ flex: 1, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '2px' }}
                >
                  <option value={TimeUnit.MINUTE}>Minutes</option>
                  <option value={TimeUnit.HOUR}>Hours</option>
                  <option value={TimeUnit.DAY}>Days</option>
                  <option value={TimeUnit.WEEK}>Weeks</option>
                  <option value={TimeUnit.MONTH}>Months</option>
                  <option value={TimeUnit.YEAR}>Years</option>
                </select>
                <button 
                  onClick={() => {
                    const raw = `${customTfNum}${customTfUnit}`;
                    try {
                      const parsed = parseTimeframe(raw);
                      if (!bookmarkedTimeframes.includes(parsed.canonical)) {
                        setBookmarkedTimeframes([...bookmarkedTimeframes, parsed.canonical]);
                      }
                      setTimeframe(parsed.canonical);
                      setCustomTfPopupOpen(false);
                    } catch (e: any) {
                      alert(e.message);
                    }
                  }}
                  style={{ background: '#333', border: '1px solid #444', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px', fontSize: '10px' }}
                >
                  ADD
                </button>
              </div>
              {recentTimeframes.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>RECENT</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {recentTimeframes.map(rtf => (
                      <button key={rtf} onClick={() => {
                        setTimeframe(rtf);
                        if (!bookmarkedTimeframes.includes(rtf)) setBookmarkedTimeframes([...bookmarkedTimeframes, rtf]);
                        setCustomTfPopupOpen(false);
                      }} style={{ background: '#222', border: '1px solid #444', color: '#ccc', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', borderRadius: '2px' }}>
                        {rtf}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="command-bar__group command-bar__range">
        {bookmarkedTrailLengths.map(len => (
          <button
            key={len}
            className={`command-bar__segment-btn ${trailLength === len ? 'command-bar__segment-btn--active' : ''}`}
            onClick={() => setTrailLength?.(len)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (bookmarkedTrailLengths.length > 1) {
                setBookmarkedTrailLengths(bookmarkedTrailLengths.filter(x => x !== len));
              }
            }}
            title="Right-click to remove bookmark"
          >
            {len}
          </button>
        ))}
        <div ref={popupRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="command-bar__segment-btn"
            onClick={() => setCustomTrailPopupOpen(!customTrailPopupOpen)}
            style={{ fontWeight: 'bold' }}
            title="Add Custom Trail"
          >
            +
          </button>
          {customTrailPopupOpen && (
            <div className="command-bar__popup" style={{
              position: 'absolute', top: '100%', left: '0', 
              background: '#111', border: '1px solid #333', 
              padding: '8px', zIndex: 100, display: 'flex', gap: '4px',
              marginTop: '4px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <input 
                type="number" 
                value={customLen} 
                onChange={e => setCustomLen(parseInt(e.target.value) || 0)}
                style={{ width: '50px', background: '#222', color: '#fff', border: '1px solid #444', textAlign: 'center', borderRadius: '2px' }}
                min={1}
                max={500}
              />
              <button 
                onClick={() => {
                  if (customLen > 0) setTrailLength(customLen);
                  setCustomTrailPopupOpen(false);
                }}
                style={{ background: '#333', border: '1px solid #444', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '2px', fontSize: '10px' }}
              >
                APPLY
              </button>
              <button 
                onClick={() => {
                  if (customLen > 0 && !bookmarkedTrailLengths.includes(customLen)) {
                    setBookmarkedTrailLengths([...bookmarkedTrailLengths, customLen].sort((a,b)=>a-b));
                    setTrailLength(customLen);
                    setCustomTrailPopupOpen(false);
                  }
                }}
                style={{ background: '#2c3e50', border: '1px solid #34495e', color: '#fff', cursor: 'pointer', padding: '2px 8px', fontSize: '10px', borderRadius: '2px' }}
                title="Bookmark this length"
              >
                ★
              </button>
            </div>
          )}
        </div>
      </div>

      <button 
        className={`command-bar__toggle ${showTrails ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setShowTrails(!showTrails)}
      >
        {showTrails ? '☑ TRAIL' : '☐ TRAIL'}
      </button>

      <button 
        className={`command-bar__toggle ${normalized ? 'command-bar__toggle--active' : ''}`}
        onClick={() => setNormalized(!normalized)}
      >
        {normalized ? '☑ NORM' : '☐ NORM'}
      </button>

      <div className="command-bar__playback">
        <button className="command-bar__playback-btn" onClick={() => {}}>⏮</button>
        <button className="command-bar__playback-btn" onClick={() => setIsPlaying?.(!isPlaying)}>
          {isPlaying ? '⏸' : '⏯'}
        </button>
        <button className="command-bar__playback-btn" onClick={() => {}}>⏭</button>
      </div>

      <select 
        className="command-bar__export-btn" 
        onChange={(e) => {
          if (e.target.value) {
            handleExport(e.target.value);
            e.target.value = ''; // reset
          }
        }}
        value=""
        style={{ appearance: 'none', textAlign: 'center' }}
      >
        <option value="" disabled>EXPORT ▾</option>
        <option value="SVG">SVG</option>
        <option value="PNG">PNG</option>
        <option value="CSV">CSV</option>
        <option value="JSON">JSON</option>
      </select>

      <div className="command-bar__spacer" />

      <div className="command-bar__clock">
        {time}
      </div>

      <button
        id="cmd-settings-btn"
        className="command-bar__settings-btn"
        onClick={() => setSettingsOpen(true)}
        title="Chart Settings"
      >⚙ SETTINGS</button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
});

export default CommandBar;
```

```css
// File: src\components\terminal\StatusBar.css
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--status-bar-height, 24px);
  background-color: var(--bg-secondary, #1a1a1a);
  border-top: 1px solid var(--border-primary, #333);
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: var(--font-size-xs, 10px);
  color: var(--text-secondary, #aaa);
  padding: 0 12px;
  box-sizing: border-box;
}

.status-bar__left, .status-bar__center, .status-bar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-bar__center {
  flex: 1;
  justify-content: center;
}

.status-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-muted, #555);
}

.status-bar__dot--connected {
  background-color: #00ff00;
}

.status-bar__dot--disconnected {
  background-color: #ff0000;
}

.status-bar__dot--reconnecting {
  background-color: #ffff00;
}

.status-bar__connection {
  font-weight: bold;
}

.status-bar__live {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #00ff00;
  font-weight: bold;
}

.status-bar__live-dot {
  width: 6px;
  height: 6px;
  background-color: #00ff00;
  border-radius: 50%;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.status-bar__info {
  white-space: nowrap;
}

.status-bar__breadth {
  display: flex;
  gap: 8px;
  font-weight: bold;
  border-left: 1px solid var(--border-secondary, #444);
  padding-left: 12px;
}
```

```tsx
// File: src\components\terminal\StatusBar.tsx
import React, { memo } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import './StatusBar.css';

const StatusBar: React.FC = memo(() => {
  const {
    connectionStatus,
    lastUpdate,
    latency,
    quadrantDistribution
  } = useRrgStore();

  const getStatusClass = () => {
    switch (connectionStatus) {
      case 'CONNECTED': return 'status-bar__dot--connected';
      case 'DISCONNECTED': return 'status-bar__dot--disconnected';
      case 'RECONNECTING': return 'status-bar__dot--reconnecting';
      default: return 'status-bar__dot--disconnected';
    }
  };

  const l = quadrantDistribution?.leading || 0;
  const w = quadrantDistribution?.weakening || 0;
  const la = quadrantDistribution?.lagging || 0;
  const i = quadrantDistribution?.improving || 0;
  const total = l + w + la + i;
  const getPct = (val: number) => total > 0 ? Math.round((val / total) * 100) : 0;

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <div className={`status-bar__dot ${getStatusClass()}`} />
        <span className="status-bar__connection">{connectionStatus || 'DISCONNECTED'}</span>
      </div>

      <div className="status-bar__center">
        {connectionStatus === 'CONNECTED' && (
          <span className="status-bar__live">
            <span className="status-bar__live-dot" /> LIVE
          </span>
        )}
      </div>

      <div className="status-bar__right">
        <div className="status-bar__info">
          LAST UPDATE: {lastUpdate || '---'} | LATENCY: {latency != null ? `${latency}ms` : '---'}
        </div>
        
        <div className="status-bar__breadth">
          <span style={{ color: 'var(--quadrant-leading-text, var(--quadrant-leading, #0f0))' }}>L:{getPct(l)}%</span>
          <span style={{ color: 'var(--quadrant-weakening-text, var(--quadrant-weakening, #ff0))' }}>W:{getPct(w)}%</span>
          <span style={{ color: 'var(--quadrant-lagging-text, var(--quadrant-lagging, #f00))' }}>I:{getPct(la)}%</span>
          <span style={{ color: 'var(--quadrant-improving-text, var(--quadrant-improving, #00f))' }}>G:{getPct(i)}%</span>
        </div>
      </div>
    </div>
  );
});

export default StatusBar;
```

```css
// File: src\components\terminal\WatchlistPanel.css
.watchlist {
  display: flex;
  flex-direction: column;
  width: var(--watchlist-width, 240px);
  height: 100%;
  background-color: var(--bg-panel, #121212);
  border-right: 1px solid var(--border-primary, #333);
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: var(--font-size-sm, 12px);
  color: var(--text-primary, #eee);
  box-sizing: border-box;
}

.watchlist__search-container {
  padding: 8px;
}

.watchlist__search {
  width: 100%;
  background-color: var(--bg-input, #000);
  border: 1px solid var(--border-secondary, #444);
  color: var(--text-primary, #eee);
  padding: 4px 8px;
  font-family: inherit;
  font-size: inherit;
  outline: none;
  box-sizing: border-box;
  border-radius: var(--radius-none, 0);
}

.watchlist__search:focus {
  border-color: var(--accent-orange, #ff6b00);
}

.watchlist__divider {
  height: 1px;
  background-color: var(--border-secondary, #444);
  margin-bottom: 4px;
}

.watchlist__header {
  color: var(--text-muted, #777);
  padding: 4px 8px;
  font-size: var(--font-size-xs, 10px);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.watchlist__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.watchlist__list::-webkit-scrollbar {
  width: 6px;
}

.watchlist__list::-webkit-scrollbar-track {
  background: var(--bg-panel, #121212);
}

.watchlist__list::-webkit-scrollbar-thumb {
  background: var(--border-secondary, #444);
}

.watchlist__row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
  user-select: none;
}

.watchlist__row--hovered {
  background-color: var(--bg-hover, #1e1e1e);
}

.watchlist__row--selected {
  background-color: var(--bg-active, #222);
  border-left-color: var(--accent-orange, #ff6b00);
}

.watchlist__indicator {
  width: 8px;
  height: 8px;
  margin-right: 8px;
  flex-shrink: 0;
}

.watchlist__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.watchlist__section {
  margin-bottom: 12px;
}

.watchlist__section-header {
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-top: 4px;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--border-primary, #333);
}
```

```tsx
// File: src\components\terminal\WatchlistPanel.tsx
import React, { useState, useMemo, memo } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import WatchlistSettingsModal from './WatchlistSettingsModal';
import './WatchlistPanel.css';

import { cleanSectorName } from '../../core/math';

const WatchlistPanel: React.FC = memo(() => {
  const {
    enrichedData, watchlist,
    selectedSector, setSelectedSector,
    hoveredSector, setHoveredSector,
    hiddenSectors, toggleHiddenSector,
    hideSectors, showSectors
  } = useRrgStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredData = useMemo(() => {
    if (!enrichedData) return [];
    if (!searchTerm) return enrichedData;
    const lower = searchTerm.toLowerCase();
    return enrichedData.filter((item: any) => 
      cleanSectorName(item.symbol).toLowerCase().includes(lower)
    );
  }, [enrichedData, searchTerm]);


  const groupedData = useMemo(() => {
    const groups: Record<string, any[]> = {
      LEADING: [],
      WEAKENING: [],
      LAGGING: [],
      IMPROVING: []
    };

    filteredData.forEach((item: any) => {
      const q = item.quadrant?.toUpperCase();
      if (groups[q]) groups[q].push(item);
    });

    // LEADING: Sort descending by distance from center
    groups.LEADING.sort((a, b) => b.distance - a.distance);
    // WEAKENING: Sort descending by RS-Ratio
    groups.WEAKENING.sort((a, b) => b.x - a.x);
    // IMPROVING: Sort descending by Momentum acceleration
    groups.IMPROVING.sort((a, b) => b.momentumRoc - a.momentumRoc);
    // LAGGING: Sort ascending by combined weakness score (x + y is lowest for bottom-left)
    groups.LAGGING.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    return groups;
  }, [filteredData]);

  const QuadrantSection = ({ title, items, colorVar }: { title: string, items: any[], colorVar: string }) => {
    if (items.length === 0) return null;
    return (
      <div className="watchlist__section">
        <div className="watchlist__section-header" style={{ color: colorVar, display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{title} ({items.length})</span>
          <button 
            onClick={() => showSectors(items.map((i: any) => i.symbol))} 
            style={{ background: 'none', border: 'none', color: colorVar, cursor: 'pointer', fontSize: '0.8em', opacity: 0.8, padding: '0 4px', fontWeight: 'bold' }}
            title="Select All"
          >
            All
          </button>
          <span style={{ opacity: 0.5 }}>|</span>
          <button 
            onClick={() => hideSectors(items.map((i: any) => i.symbol))} 
            style={{ background: 'none', border: 'none', color: colorVar, cursor: 'pointer', fontSize: '0.8em', opacity: 0.8, padding: '0 4px', fontWeight: 'bold' }}
            title="Clear All"
          >
            None
          </button>
        </div>
        {items.map((item: any) => {
          const isSelected = selectedSector === item.symbol;
          const isHovered = hoveredSector === item.symbol;
          const isHidden = hiddenSectors.includes(item.symbol);
          return (
            <div
              key={item.symbol}
              className={`watchlist__row ${isSelected ? 'watchlist__row--selected' : ''} ${isHovered && !isSelected ? 'watchlist__row--hovered' : ''}`}
              onClick={() => setSelectedSector?.(isSelected ? null : item.symbol)}
              onMouseEnter={() => setHoveredSector?.(item.symbol)}
              onMouseLeave={() => setHoveredSector?.(null)}
            >
              <div 
                className="watchlist__indicator" 
                style={{ backgroundColor: colorVar }}
              />
              <span className="watchlist__name">{cleanSectorName(item.symbol)}</span>
              <input
                type="checkbox"
                checked={!isHidden}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleHiddenSector(item.symbol);
                }}
                className="watchlist__checkbox"
                style={{ marginLeft: 'auto', cursor: 'pointer' }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="watchlist">
      <div className="watchlist__header">
        <span>SECTORS ({watchlist.filter(w => w.enabled).length}/{watchlist.length})</span>
        <button className="watchlist__settings-btn" onClick={() => setIsModalOpen(true)}>⚙</button>
      </div>
      <div className="watchlist__search-container">
        <input 
          type="text" 
          className="watchlist__search" 
          placeholder="Search sectors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="watchlist__divider" />
      <div className="watchlist__list">
        <QuadrantSection title="LEADING" items={groupedData.LEADING} colorVar="var(--quadrant-leading-text, #2ECC71)" />
        <QuadrantSection title="WEAKENING" items={groupedData.WEAKENING} colorVar="var(--quadrant-weakening-text, #F1C40F)" />
        <QuadrantSection title="LAGGING" items={groupedData.LAGGING} colorVar="var(--quadrant-lagging-text, #E74C3C)" />
        <QuadrantSection title="IMPROVING" items={groupedData.IMPROVING} colorVar="var(--quadrant-improving-text, #3498DB)" />
      </div>
      {isModalOpen && <WatchlistSettingsModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
});

export default WatchlistPanel;
```

```css
// File: src\components\terminal\WatchlistSettingsModal.css
.watchlist-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.watchlist-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-primary);
  width: 400px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
}

.watchlist-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-xl);
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-command);
}

.watchlist-modal__title {
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  color: var(--text-primary);
  font-weight: 600;
}

.watchlist-modal__close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.watchlist-modal__close:hover {
  color: var(--text-primary);
}

.watchlist-modal__search-container {
  padding: var(--space-md) var(--space-xl);
  border-bottom: 1px solid var(--border-primary);
}

.watchlist-modal__search {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  padding: var(--space-sm) var(--space-md);
  outline: none;
  box-sizing: border-box;
}

.watchlist-modal__search:focus {
  border-color: var(--accent-orange);
}

.watchlist-modal__actions {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-xl);
  border-bottom: 1px solid var(--border-primary);
}

.watchlist-modal__btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  padding: 4px 8px;
  cursor: pointer;
}

.watchlist-modal__btn:hover {
  background: var(--bg-active);
  color: var(--text-primary);
}

.watchlist-modal__btn--primary {
  background: var(--accent-orange-dim);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
  width: 100%;
  padding: 8px;
  font-size: var(--font-size-base);
}

.watchlist-modal__btn--primary:hover {
  background: var(--accent-orange);
  color: var(--bg-primary);
}

.watchlist-modal__list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-xl);
}

.watchlist-modal__list::-webkit-scrollbar {
  width: 6px;
}
.watchlist-modal__list::-webkit-scrollbar-thumb {
  background: var(--border-primary);
}
.watchlist-modal__list::-webkit-scrollbar-track {
  background: transparent;
}

.watchlist-modal__row {
  display: flex;
  align-items: center;
  padding: 6px 0;
  cursor: pointer;
}

.watchlist-modal__row:hover {
  background: var(--bg-hover);
}

.watchlist-modal__checkbox {
  margin-right: var(--space-md);
  accent-color: var(--accent-orange);
}

.watchlist-modal__name {
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  color: var(--text-primary);
}

.watchlist-modal__empty {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  text-align: center;
  padding: var(--space-xl) 0;
}

.watchlist-modal__footer {
  padding: var(--space-md) var(--space-xl);
  border-top: 1px solid var(--border-primary);
  background: var(--bg-command);
}
```

```tsx
// File: src\components\terminal\WatchlistSettingsModal.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import './WatchlistSettingsModal.css';

import { cleanSectorName } from '../../core/math';

interface WatchlistSettingsModalProps {
  onClose: () => void;
}

const WatchlistSettingsModal: React.FC<WatchlistSettingsModalProps> = ({ onClose }) => {
  const { watchlist, toggleSector, selectAllSectors, clearAllSectors } = useRrgStore();
  const [searchTerm, setSearchTerm] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filteredWatchlist = useMemo(() => {
    if (!searchTerm) return watchlist;
    const lower = searchTerm.toLowerCase();
    return watchlist.filter(w => cleanSectorName(w.symbol).toLowerCase().includes(lower));
  }, [watchlist, searchTerm]);

  return (
    <div className="watchlist-modal-overlay">
      <div className="watchlist-modal" ref={modalRef}>
        <div className="watchlist-modal__header">
          <div className="watchlist-modal__title">SECTOR SETTINGS</div>
          <button className="watchlist-modal__close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="watchlist-modal__search-container">
          <input 
            type="text" 
            className="watchlist-modal__search" 
            placeholder="Search sectors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <div className="watchlist-modal__actions">
          <button className="watchlist-modal__btn" onClick={selectAllSectors}>SELECT ALL</button>
          <button className="watchlist-modal__btn" onClick={clearAllSectors}>CLEAR</button>
        </div>

        <div className="watchlist-modal__list">
          {filteredWatchlist.map(item => (
            <label key={item.symbol} className="watchlist-modal__row">
              <input 
                type="checkbox" 
                checked={item.enabled} 
                onChange={() => toggleSector(item.symbol)} 
                className="watchlist-modal__checkbox"
              />
              <span className="watchlist-modal__name">{cleanSectorName(item.symbol)}</span>
            </label>
          ))}
          {filteredWatchlist.length === 0 && (
            <div className="watchlist-modal__empty">No sectors found.</div>
          )}
        </div>

        <div className="watchlist-modal__footer">
          <button className="watchlist-modal__btn watchlist-modal__btn--primary" onClick={onClose}>DONE</button>
        </div>
      </div>
    </div>
  );
};

export default WatchlistSettingsModal;
```

```typescript
// File: src\core\animation.ts
import { curveCardinal, line } from 'd3';

export function catmullRomPath(points: { x: number; y: number }[], tension: number = 0.5): string {
  if (points.length < 2) return '';
  const gen = line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(curveCardinal.tension(tension));
  return gen(points) || '';
}

export function trailOpacities(count: number): number[] {
  if (count <= 1) return [1];
  return Array.from({ length: count }, (_, i) => 0.2 + 0.8 * (i / (count - 1)));
}

export function trailWidths(count: number): number[] {
  if (count <= 1) return [2];
  return Array.from({ length: count }, (_, i) => 1 + 1.5 * (i / (count - 1)));
}

export function arrowAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
```

```typescript
// File: src\core\geometry.ts

export interface LabelRect { id: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; }

export function resolveScreenSpaceCollisions(labels: any[], maxOffset: number = 18): any[] {
  const MAX_ITERATIONS = 3;
  const resolved = labels.map(l => ({ ...l }));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        if (
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + a.height &&
          a.y + a.height > b.y
        ) {
          const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
          const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
          
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) { b.x += 2; a.x -= 2; }
            else { b.x -= 2; a.x += 2; }
          } else {
            if (dy > 0) { b.y += 2; a.y -= 2; }
            else { b.y -= 2; a.y += 2; }
          }

          a.x = Math.max(a.anchorX - maxOffset, Math.min(a.anchorX + maxOffset, a.x));
          a.y = Math.max(a.anchorY - maxOffset, Math.min(a.anchorY + maxOffset, a.y));
          b.x = Math.max(b.anchorX - maxOffset, Math.min(b.anchorX + maxOffset, b.x));
          b.y = Math.max(b.anchorY - maxOffset, Math.min(b.anchorY + maxOffset, b.y));

          a.x = Math.round(a.x);
          a.y = Math.round(a.y);
          b.x = Math.round(b.x);
          b.y = Math.round(b.y);

          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return resolved;
}

function lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;

  const intersects = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, p4x: number, p4y: number) => {
    const d = (p4y - p3y) * (p2x - p1x) - (p4x - p3x) * (p2y - p1y);
    if (d === 0) return false;
    const uA = ((p4x - p3x) * (p1y - p3y) - (p4y - p3y) * (p1x - p3x)) / d;
    const uB = ((p2x - p1x) * (p1y - p3y) - (p2y - p1y) * (p1x - p3x)) / d;
    return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1;
  };

  if (intersects(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  if (intersects(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)) return true;
  if (intersects(x1, y1, x2, y2, rx, ry, rx, ry + rh)) return true;
  if (intersects(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;

  return false;
}

export function smartLabelPlacement(labels: any[]): any[] {
  labels.sort((a, b) => b.priority - a.priority);
  const placed: any[] = [];
  
  const allTrailSegments: any[] = [];
  for (const lbl of labels) {
    if (lbl.trailSegments) {
      allTrailSegments.push(...lbl.trailSegments);
    }
  }

  const getOverlapArea = (boxA: any, boxB: any) => {
    const dx = Math.max(0, Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x));
    const dy = Math.max(0, Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y));
    return dx * dy;
  };

  const getCollisionScore = (box: any) => {
    let score = 0;
    for (const p of placed) {
      score += getOverlapArea(box, p) * 10; // Heavy penalty for text overlap
    }
    for (const seg of allTrailSegments) {
      if (lineIntersectsRect(seg.x1, seg.y1, seg.x2, seg.y2, box.x, box.y, box.width, box.height)) {
        score += 50; // Moderate penalty for intersecting a trail line
      }
    }
    return score;
  };

  for (const lbl of labels) {
    const { cx, cy, width, height } = lbl;

    const candidates = [
      { x: cx + 6, y: cy - height / 2 },          // Right
      { x: cx - width / 2, y: cy + 6 },           // Bottom
      { x: cx - width / 2, y: cy - height - 6 },  // Top
      { x: cx - width - 6, y: cy - height / 2 }   // Left
    ];

    let bestPos = candidates[0];
    let minOverlap = Infinity;

    for (const pos of candidates) {
      const testBox = { x: pos.x, y: pos.y, width, height };
      const overlap = getCollisionScore(testBox);
      
      if (overlap === 0) {
        bestPos = pos;
        minOverlap = 0;
        break; 
      }
      
      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestPos = pos;
      }
    }

    lbl.x = bestPos.x;
    lbl.y = bestPos.y;
    lbl.anchorX = bestPos.x;
    lbl.anchorY = bestPos.y;
    placed.push(lbl);
  }

  return resolveScreenSpaceCollisions(placed, 8);
}

export function findNearestPoint(points: { x: number; y: number; id: string }[], mx: number, my: number, maxDistance: number = 20): string | null {
  let nearest: string | null = null;
  let minDist = maxDistance * maxDistance;
  for (const p of points) {
    const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = p.id;
    }
  }
  return nearest;
}
```

```typescript
// File: src\core\math.ts
import type { RrgPoint, EnrichedRrgPoint, TrailPoint, QuadrantDistribution } from '../types';

export function cleanSectorName(symbol: string): string {
  if (!symbol) return '';
  let name = symbol.replace(/_/g, ' ');
  name = name.replace(/^NSE\s*INDEX\s*/i, '');
  name = name.replace(/^NIFTY\s*/i, '');
  return name.trim();
}

export function computeHeading(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Adjusted: in SVG y-axis is inverted
  if (angle >= -22.5 && angle < 22.5) return 'E';
  if (angle >= 22.5 && angle < 67.5) return 'NE';
  if (angle >= 67.5 && angle < 112.5) return 'N';
  if (angle >= 112.5 && angle < 157.5) return 'NW';
  if (angle >= 157.5 || angle < -157.5) return 'W';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5) return 'S';
  return 'SE';
}

export function computeVelocity(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeDistance(x: number, y: number, cx = 100, cy = 100): number {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

export function computeCurvature(trail: TrailPoint[]): number {
  if (trail.length < 3) return 0;
  const n = trail.length;
  const p0 = trail[n - 3];
  const p1 = trail[n - 2];
  const p2 = trail[n - 1];
  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y;
  const cross = dx1 * dy2 - dy1 * dx2;
  const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  const denom = d1 * d2;
  return denom === 0 ? 0 : cross / denom;
}

export function computeMomentumRoc(trail: TrailPoint[]): number {
  if (trail.length < 3) return 0;
  const n = trail.length;
  const mom1 = trail[n - 1].y - trail[n - 2].y;
  const mom0 = trail[n - 2].y - trail[n - 3].y;
  return mom1 - mom0;
}

export function enrichPoint(point: RrgPoint): EnrichedRrgPoint {
  const trail = point.trail;
  let dx = 0, dy = 0;
  if (trail.length >= 2) {
    const prev = trail[trail.length - 2];
    dx = point.x - prev.x;
    dy = point.y - prev.y;
  }
  return {
    ...point,
    velocity: computeVelocity(dx, dy),
    heading: computeHeading(dx, dy),
    headingAngle: Math.atan2(dy, dx),
    distance: computeDistance(point.x, point.y),
    trendStrength: computeVelocity(dx, dy) * computeDistance(point.x, point.y),
    curvature: computeCurvature(trail),
    momentumRoc: computeMomentumRoc(trail),
    quadrantDuration: 0, // needs historical data to compute
  };
}

export function enrichAll(points: RrgPoint[]): EnrichedRrgPoint[] {
  return points.map(enrichPoint);
}

export function computeQuadrantDistribution(points: RrgPoint[]): QuadrantDistribution {
  const total = points.length || 1;
  const counts = { leading: 0, weakening: 0, lagging: 0, improving: 0 };
  points.forEach(p => {
    const key = p.quadrant.toLowerCase() as keyof QuadrantDistribution;
    counts[key]++;
  });
  return {
    leading: Math.round((counts.leading / total) * 100),
    weakening: Math.round((counts.weakening / total) * 100),
    lagging: Math.round((counts.lagging / total) * 100),
    improving: Math.round((counts.improving / total) * 100),
  };
}

export interface DataBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  domainWidth: number;
  domainHeight: number;
}

export function computeDataBounds(points: EnrichedRrgPoint[]): DataBounds {
  if (points.length === 0) {
    return { minX: 95, maxX: 105, minY: 95, maxY: 105, centerX: 100, centerY: 100, domainWidth: 10, domainHeight: 10 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;

    if (p.trail) {
      for (const t of p.trail) {
        if (t.x < minX) minX = t.x;
        if (t.x > maxX) maxX = t.x;
        if (t.y < minY) minY = t.y;
        if (t.y > maxY) maxY = t.y;
      }
    }
  }

  // Account for precision/quantization
  // Domain values precision: 0.0001
  const quantize = (val: number) => Math.round(val * 10000) / 10000;

  minX = quantize(minX);
  maxX = quantize(maxX);
  minY = quantize(minY);
  maxY = quantize(maxY);

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  // Padding incorporates labels, arrows, and glow blur
  // Adaptive padding: max(domainRange * 0.12, 1.5)
  const paddingX = Math.max(rangeX * 0.12, 1.5);
  const paddingY = Math.max(rangeY * 0.12, 1.5);

  minX -= paddingX;
  maxX += paddingX;
  minY -= paddingY;
  maxY += paddingY;

  const MIN_DOMAIN_SIZE = 4;
  const domainWidth = quantize(Math.max(maxX - minX, MIN_DOMAIN_SIZE));
  const domainHeight = quantize(Math.max(maxY - minY, MIN_DOMAIN_SIZE));

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: quantize((minX + maxX) / 2),
    centerY: quantize((minY + maxY) / 2),
    domainWidth,
    domainHeight,
  };
}
```

```typescript
// File: src\core\scales.ts
import { scaleLinear, type ScaleLinear } from 'd3';
import type { ChartDimensions } from '../types';

export interface RrgScales {
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  center: number;
}

export function createScales(
  xDomain: [number, number],
  yDomain: [number, number],
  dims: ChartDimensions,
  center: number = 100
): RrgScales {
  const xScale = scaleLinear().domain(xDomain).range([0, dims.innerWidth]);
  const yScale = scaleLinear().domain(yDomain).range([dims.innerHeight, 0]);
  return { xScale, yScale, center };
}

export function computeDomain(
  allX: number[], allY: number[],
  paddingRatio: number = 0.125
): { xDomain: [number, number]; yDomain: [number, number]; step: number } {
  if (allX.length === 0) return { xDomain: [0, 100], yDomain: [0, 100], step: 1 };
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);

  const xRange = Math.max(xMax - xMin, 0.001);
  const yRange = Math.max(yMax - yMin, 0.001);
  const maxRange = Math.max(xRange, yRange);

  // Dynamic Grid Step Calculation (scales down for lower timeframes)
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxRange)));
  const normalized = maxRange / magnitude;
  let step = magnitude;
  if (normalized <= 2) step = 0.2 * magnitude;
  else if (normalized <= 5) step = 0.5 * magnitude;
  else step = 1.0 * magnitude;

  // Proportional padding (e.g. 12.5% of range), guaranteed to be at least half a grid step
  const padX = Math.max(xRange * paddingRatio, step * 0.5);
  const padY = Math.max(yRange * paddingRatio, step * 0.5);

  const qxMin = Math.floor((xMin - padX) / step) * step;
  const qxMax = Math.ceil((xMax + padX) / step) * step;
  const qyMin = Math.floor((yMin - padY) / step) * step;
  const qyMax = Math.ceil((yMax + padY) / step) * step;

  return {
    xDomain: [qxMin, qxMax],
    yDomain: [qyMin, qyMax],
    step: step
  };
}

export function generateGridLines(
  domain: [number, number], step: number
): number[] {
  const lines: number[] = [];
  const start = Math.ceil(domain[0] / step) * step;

  // Calculate precision based on step size to avoid truncating lower timeframes
  let decimals = 2;
  if (step < 0.1) decimals = 3;
  if (step < 0.01) decimals = 4;
  if (step < 0.001) decimals = 5;
  const factor = Math.pow(10, decimals);

  for (let v = start; v <= domain[1] + step * 0.1; v += step) {
    lines.push(Math.round(v * factor) / factor);
  }
  return lines;
}
```

```typescript
// File: src\core\TimeframeParser.ts
export const TimeUnit = {
  MINUTE: 'm',
  HOUR: 'h',
  DAY: 'd',
  WEEK: 'w',
  MONTH: 'mo',
  YEAR: 'y',
} as const;

export type TimeUnit = typeof TimeUnit[keyof typeof TimeUnit];

export interface ParsedTimeframe {
  raw: string;
  multiplier: number;
  unit: TimeUnit;
  canonical: string;
  displayLabel: string;
  baseResolutionMinutes: number;
  baseCandleMultiplier: number;
  intraday: boolean;
  isCalendarAnchored: boolean;
  timeframeScaleClass: 'ultra_intraday' | 'intraday' | 'swing' | 'position' | 'macro';
  sortWeight: number;
}

const UNIT_ALIASES: Record<string, TimeUnit> = {
  min: TimeUnit.MINUTE,
  m: TimeUnit.MINUTE,
  h: TimeUnit.HOUR,
  d: TimeUnit.DAY,
  w: TimeUnit.WEEK,
  mo: TimeUnit.MONTH,
  y: TimeUnit.YEAR,
};

const MAX_LIMITS: Record<TimeUnit, number> = {
  [TimeUnit.MINUTE]: 1440,
  [TimeUnit.HOUR]: 168,
  [TimeUnit.DAY]: 365,
  [TimeUnit.WEEK]: 260,
  [TimeUnit.MONTH]: 120,
  [TimeUnit.YEAR]: 20,
};

const SORT_WEIGHTS: Record<TimeUnit, number> = {
  [TimeUnit.MINUTE]: 1,
  [TimeUnit.HOUR]: 60,
  [TimeUnit.DAY]: 1440,
  [TimeUnit.WEEK]: 10080,
  [TimeUnit.MONTH]: 50000,
  [TimeUnit.YEAR]: 600000,
};

const UNIT_DISPLAY: Record<TimeUnit, string> = {
  [TimeUnit.MINUTE]: 'Min',
  [TimeUnit.HOUR]: 'Hour',
  [TimeUnit.DAY]: 'Day',
  [TimeUnit.WEEK]: 'Week',
  [TimeUnit.MONTH]: 'Month',
  [TimeUnit.YEAR]: 'Year',
};

export function parseTimeframe(raw: string): ParsedTimeframe {
  const match = raw.toLowerCase().match(/^(\d+)([a-z]+)$/);
  if (!match) {
    throw new Error(`Invalid timeframe format: ${raw}`);
  }

  const [, numStr, unitStr] = match;
  
  if (numStr.includes('.')) {
    throw new Error(`Fractional timeframes are not allowed: ${raw}`);
  }

  const multiplier = parseInt(numStr, 10);
  if (isNaN(multiplier) || multiplier <= 0) {
    throw new Error(`Timeframe multiplier must be > 0: ${raw}`);
  }

  const unit = UNIT_ALIASES[unitStr];
  if (!unit) {
    throw new Error(`Unknown timeframe unit: ${unitStr}`);
  }

  if (multiplier > MAX_LIMITS[unit]) {
    throw new Error(`Timeframe ${multiplier}${unit} exceeds max limit of ${MAX_LIMITS[unit]}${unit}`);
  }

  const canonical = `${multiplier}${unit}`;
  const displayLabel = `${multiplier} ${UNIT_DISPLAY[unit]}`;
  const intraday = unit === TimeUnit.MINUTE || unit === TimeUnit.HOUR;
  const isCalendarAnchored = !intraday;
  
  const baseResolutionMinutes = intraday ? 1 : 1440;
  let baseCandleMultiplier = multiplier;
  if (unit === TimeUnit.HOUR) baseCandleMultiplier = multiplier * 60;
  if (unit === TimeUnit.WEEK) baseCandleMultiplier = multiplier * 7;
  if (unit === TimeUnit.MONTH) baseCandleMultiplier = multiplier * 30; // Approximation for rendering limits
  if (unit === TimeUnit.YEAR) baseCandleMultiplier = multiplier * 365; // Approximation for rendering limits

  if (baseCandleMultiplier > 10000) {
    throw new Error(`Timeframe ${canonical} base candle multiplier exceeds hard limit of 10000`);
  }

  let timeframeScaleClass: 'ultra_intraday' | 'intraday' | 'swing' | 'position' | 'macro';
  if (unit === TimeUnit.MINUTE && multiplier < 15) timeframeScaleClass = 'ultra_intraday';
  else if (intraday) timeframeScaleClass = 'intraday';
  else if (unit === TimeUnit.DAY && multiplier < 5) timeframeScaleClass = 'swing';
  else if (unit === TimeUnit.DAY || unit === TimeUnit.WEEK) timeframeScaleClass = 'position';
  else timeframeScaleClass = 'macro';

  const sortWeight = SORT_WEIGHTS[unit] * multiplier;

  return {
    raw,
    multiplier,
    unit,
    canonical,
    displayLabel,
    baseResolutionMinutes,
    baseCandleMultiplier,
    intraday,
    isCalendarAnchored,
    timeframeScaleClass,
    sortWeight,
  };
}
```

```typescript
// File: src\hooks\useAutoFetch.ts
import { useEffect } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import { useChartSettingsStore } from '../stores/useChartSettingsStore';
import { useCommandBarStore } from '../stores/useCommandBarStore';

const getPollInterval = (tf: string) => {
  switch (tf) {
    case '1min': return 15000;
    case '5min': return 30000;
    case '15min': return 60000;
    case '30min': return 120000;
    case '1h': return 300000;
    default: return 0;
  }
};

export function useAutoFetch() {
  const fetchData = useRrgStore(s => s.fetchData);
  const fetchSectorList = useRrgStore(s => s.fetchSectorList);
  
  const benchmark = useChartSettingsStore(s => s.benchmark);
  
  const timeframe = useCommandBarStore(s => s.timeframe);
  const trailLength = useCommandBarStore(s => s.trailLength);
  const normalized = useCommandBarStore(s => s.normalized);

  const watchlistStr = useRrgStore(s => s.watchlist.filter(w => w.enabled).map(w => w.symbol).join(','));

  useEffect(() => {
    fetchSectorList();
  }, [fetchSectorList]);

  useEffect(() => {
    const abortController = new AbortController();
    
    const timeoutId = setTimeout(() => {
      console.log('[AutoFetch] Querying API with:', { timeframe, trailLength, normalized });
      fetchData(abortController.signal);
    }, 250); // Debounce
    
    const intervalMs = getPollInterval(timeframe);
    let interval: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      interval = setInterval(() => {
        fetchData(abortController.signal);
      }, intervalMs);
    }
    
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
      if (interval) clearInterval(interval);
    };
  }, [fetchData, benchmark, timeframe, trailLength, normalized, watchlistStr]);
}
```

```typescript
// File: src\hooks\useKeyboardShortcuts.ts
import { useEffect } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import { useViewportStore } from '../stores/useViewportStore';

export function useKeyboardShortcuts() {
  const setIsPlaying = useRrgStore(s => s.setIsPlaying);
  const isPlaying = useRrgStore(s => s.isPlaying);
  const enrichedData = useRrgStore(s => s.enrichedData);
  const selectedSector = useRrgStore(s => s.selectedSector);
  const setSelectedSector = useRrgStore(s => s.setSelectedSector);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          useViewportStore.getState().zoomBy(-100, useViewportStore.getState().viewportWidth / 2, useViewportStore.getState().viewportHeight / 2);
          break;
        case '-':
          useViewportStore.getState().zoomBy(100, useViewportStore.getState().viewportWidth / 2, useViewportStore.getState().viewportHeight / 2);
          break;
        case 'ArrowUp':
          e.preventDefault();
          useViewportStore.getState().panBy(0, 30);
          break;
        case 'ArrowDown':
          e.preventDefault();
          useViewportStore.getState().panBy(0, -30);
          break;
        case 'ArrowLeft':
          useViewportStore.getState().panBy(30, 0);
          break;
        case 'ArrowRight':
          useViewportStore.getState().panBy(-30, 0);
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'F2':
          e.preventDefault();
          useViewportStore.getState().resetToFit();
          break;
        case 'Tab': {
          e.preventDefault();
          if (enrichedData.length === 0) break;
          const symbols = enrichedData.map(d => d.symbol);
          const idx = selectedSector ? symbols.indexOf(selectedSector) : -1;
          const next = symbols[(idx + 1) % symbols.length];
          setSelectedSector(next);
          break;
        }
        case '0':
          if (e.ctrlKey) {
            e.preventDefault();
            useViewportStore.getState().resetToFit();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, enrichedData, selectedSector, setIsPlaying, setSelectedSector]);
}
```

```css
// File: src\index.css
:root {
  /* Background hierarchy */
  --bg-primary: #000000;
  --bg-secondary: #050505;
  --bg-panel: #0B0B0B;
  --bg-command: #111111;
  --bg-input: #0A0A0A;
  --bg-hover: #1A1A1A;
  --bg-active: #222222;
  
  /* Borders */
  --border-primary: #1F1F1F;
  --border-secondary: #2A2A2A;
  --border-grid: #1E1E1E;
  --border-grid-major: #2A2A2A;
  --border-active: var(--accent-orange);
  
  /* Text */
  --text-primary: #E0E0E0;
  --text-secondary: #909090;
  --text-muted: #606060;
  --text-label: #707070;
  
  /* Accent */
  --accent-orange: #FF9900;
  --accent-orange-dim: rgba(255, 153, 0, 0.3);
  
  /* Quadrant colors - semantic */
  --quadrant-leading: #0D5C2A;
  --quadrant-weakening: #8A7A00;
  --quadrant-lagging: #5A120F;
  --quadrant-improving: #0B3D5A;
  --quadrant-leading-text: #2ECC71;
  --quadrant-weakening-text: #F1C40F;
  --quadrant-lagging-text: #E74C3C;
  --quadrant-improving-text: #3498DB;
  
  /* Axis */
  --axis-center: #707070;
  
  /* Spacing */
  --space-xs: 2px;
  --space-sm: 4px;
  --space-md: 8px;
  --space-lg: 12px;
  --space-xl: 16px;
  --space-2xl: 24px;
  
  /* Typography */
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', 'Roboto Mono', monospace;
  --font-size-xs: 9px;
  --font-size-sm: 10px;
  --font-size-base: 11px;
  --font-size-md: 12px;
  --font-size-lg: 14px;
  --font-size-xl: 16px;
  
  /* Layout */
  --command-bar-height: 42px;
  --status-bar-height: 24px;
  --watchlist-width: 260px;
  
  /* Radius */
  --radius-none: 0px;
  --radius-sm: 2px;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--border-secondary);
  border-radius: var(--radius-sm);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Selection colors */
::selection {
  background: var(--accent-orange-dim);
  color: var(--text-primary);
}

/* Input/select/button resets */
input, select, button {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: transparent;
  border: none;
  outline: none;
}

/* Utility classes */
.text-leading { color: var(--quadrant-leading-text); }
.text-weakening { color: var(--quadrant-weakening-text); }
.text-lagging { color: var(--quadrant-lagging-text); }
.text-improving { color: var(--quadrant-improving-text); }
.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

```tsx
// File: src\main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```typescript
// File: src\services\api.ts
import axios from 'axios';
import type { RrgPoint } from '../types';

const API_BASE = 'http://localhost:8080/api/rrg';

// No timeframe mapping needed anymore

export async function fetchSnapshot(
  benchmark: string,
  timeframe: string,
  trailLength: number,
  normalized?: boolean,
  sectors?: string[],
  minimalWindowResampling?: boolean,
  watchlistOnlyResampling?: boolean,
  watchlist?: string[],
  selectedSector?: string | null,
  hoveredSector?: string | null,
  signal?: AbortSignal
): Promise<RrgPoint[]> {
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector },
    signal,
  });
  return response.data;
}

export async function fetchSectors(): Promise<string[]> {
  const response = await axios.get<string[]>(`${API_BASE}/sectors`);
  return response.data;
}

// Returns latency in ms for the last fetch
let _lastLatency = 0;
export function getLastLatency(): number { return _lastLatency; }

export async function fetchSnapshotWithLatency(
  benchmark: string,
  timeframe: string,
  trailLength: number,
  normalized?: boolean,
  sectors?: string[],
  minimalWindowResampling?: boolean,
  watchlistOnlyResampling?: boolean,
  watchlist?: string[],
  selectedSector?: string | null,
  hoveredSector?: string | null,
  signal?: AbortSignal
): Promise<{ data: RrgPoint[]; latency: number }> {
  const start = performance.now();
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector },
    signal,
  });
  const latency = Math.round(performance.now() - start);
  _lastLatency = latency;
  return { data: response.data, latency };
}

// Config Endpoints
export async function fetchWatchlistConfig() {
  const response = await axios.get(`${API_BASE}/config/watchlist`);
  return response.data;
}

export async function updateWatchlistConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/watchlist`, config);
  return response.data;
}

export async function fetchSettingsConfig() {
  const response = await axios.get(`${API_BASE}/config/settings`);
  return response.data;
}

export async function updateSettingsConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/settings`, config);
  return response.data;
}

export async function fetchCommandBarConfig() {
  const response = await axios.get(`${API_BASE}/config/commandbar`);
  return response.data;
}

export async function updateCommandBarConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/commandbar`, config);
  return response.data;
}
```

```typescript
// File: src\services\buildRrgQuery.ts
// No Timeframe import needed

export interface RrgQueryParams {
  benchmark: string;
  timeframe: string;
  trailLength: number;
  normalized: boolean;
  sectors?: string[];
  watchlistOnlyResampling?: boolean;
  watchlist?: string[];
  selectedSector?: string | null;
  hoveredSector?: string | null;
}

export function buildRrgQuery(
  settings: { benchmark: string; timeframe: string; trailLength: number; normalized: boolean; watchlistOnlyResampling: boolean },
  enabledSectors: string[],
  watchlistSectors: string[],
  selectedSector: string | null,
  hoveredSector: string | null
): RrgQueryParams {
  return {
    benchmark: settings.benchmark,
    timeframe: settings.timeframe,
    trailLength: settings.trailLength,
    normalized: settings.normalized,
    sectors: enabledSectors,
    watchlistOnlyResampling: settings.watchlistOnlyResampling,
    watchlist: watchlistSectors,
    selectedSector,
    hoveredSector
  };
}
```

```typescript
// File: src\stores\useChartSettingsStore.ts
import { create } from 'zustand';
import { fetchSettingsConfig, updateSettingsConfig } from '../services/api';

export interface ChartSettingsState {
  // Benchmark
  benchmark: string;

  // Visual / Rendering
  showLabels: boolean;
  gridDensity: 'sparse' | 'normal' | 'dense';
  quadrantOpacity: number;
  semanticZoom: boolean;

  // Playback
  animationSpeed: number;
  playbackMode: boolean;

  // Camera / Viewport sensitivity
  zoomSensitivity: number;
  panSensitivity: number;
  minZoom: number;
  maxZoom: number;

  // Optimizations
  minimalWindowResampling: boolean;
  watchlistOnlyResampling: boolean;
  backgroundSnapshotRefresh: boolean;

  // Hydration guard
  hydrated: boolean;

  // Actions
  setBenchmark: (b: string) => void;
  setShowLabels: (v: boolean) => void;
  setGridDensity: (d: 'sparse' | 'normal' | 'dense') => void;
  setQuadrantOpacity: (v: number) => void;
  setSemanticZoom: (v: boolean) => void;
  setAnimationSpeed: (s: number) => void;
  setPlaybackMode: (v: boolean) => void;
  setZoomSensitivity: (v: number) => void;
  setPanSensitivity: (v: number) => void;
  setMinZoom: (v: number) => void;
  setMaxZoom: (v: number) => void;
  setMinimalWindowResampling: (v: boolean) => void;
  setWatchlistOnlyResampling: (v: boolean) => void;
  setBackgroundSnapshotRefresh: (v: boolean) => void;
  resetDefaults: () => void;
  
  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}

const DEFAULT_STATE = {
  benchmark: 'NSE_INDEX_Nifty 50',
  showLabels: true,
  gridDensity: 'normal' as const,
  quadrantOpacity: 0.22,
  semanticZoom: true,
  animationSpeed: 1,
  playbackMode: false,
  zoomSensitivity: 0.1,
  panSensitivity: 1.0,
  minZoom: 0.8,
  maxZoom: 6.0,
  minimalWindowResampling: false,
  watchlistOnlyResampling: false,
  backgroundSnapshotRefresh: true,
  hydrated: false,
};

let saveTimeout: any = null;

export const useChartSettingsStore = create<ChartSettingsState>((set, get) => ({
  ...DEFAULT_STATE,

  setBenchmark: (b) => { set({ benchmark: b }); get().saveConfig(); },
  setShowLabels: (v) => { set({ showLabels: v }); get().saveConfig(); },
  setGridDensity: (d) => { set({ gridDensity: d }); get().saveConfig(); },
  setQuadrantOpacity: (v) => { set({ quadrantOpacity: v }); get().saveConfig(); },
  setSemanticZoom: (v) => { set({ semanticZoom: v }); get().saveConfig(); },
  setAnimationSpeed: (s) => set({ animationSpeed: s }), // Transient
  setPlaybackMode: (v) => set({ playbackMode: v }),     // Transient
  setZoomSensitivity: (v) => { set({ zoomSensitivity: v }); get().saveConfig(); },
  setPanSensitivity: (v) => { set({ panSensitivity: v }); get().saveConfig(); },
  setMinZoom: (v) => { set({ minZoom: v }); get().saveConfig(); },
  setMaxZoom: (v) => { set({ maxZoom: v }); get().saveConfig(); },
  setMinimalWindowResampling: (v) => { set({ minimalWindowResampling: v }); get().saveConfig(); },
  setWatchlistOnlyResampling: (v) => { set({ watchlistOnlyResampling: v }); get().saveConfig(); },
  setBackgroundSnapshotRefresh: (v) => { set({ backgroundSnapshotRefresh: v }); get().saveConfig(); },
  
  resetDefaults: () => {
    set({ ...DEFAULT_STATE, hydrated: true });
    get().saveConfig();
  },

  loadConfig: async () => {
    try {
      const config = await fetchSettingsConfig();
      if (config) {
        set({
          minimalWindowResampling: config.optimization?.minimalWindowResampling ?? DEFAULT_STATE.minimalWindowResampling,
          watchlistOnlyResampling: config.optimization?.watchlistOnlyResampling ?? DEFAULT_STATE.watchlistOnlyResampling,
          backgroundSnapshotRefresh: config.optimization?.backgroundSnapshotRefresh ?? DEFAULT_STATE.backgroundSnapshotRefresh,
          
          showLabels: config.rendering?.labelsEnabled ?? DEFAULT_STATE.showLabels,
          semanticZoom: config.rendering?.semanticZoom ?? DEFAULT_STATE.semanticZoom,
          
          minZoom: config.camera?.minInteractionZoom ?? DEFAULT_STATE.minZoom,
          maxZoom: config.camera?.maxZoom ?? DEFAULT_STATE.maxZoom,
          
          hydrated: true
        });
      }
    } catch (e) {
      console.error('Failed to load settings config', e);
      set({ hydrated: true });
    }
  },

  saveConfig: () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const state = get();
      const config = {
        optimization: {
          minimalWindowResampling: state.minimalWindowResampling,
          watchlistOnlyResampling: state.watchlistOnlyResampling,
          backgroundSnapshotRefresh: state.backgroundSnapshotRefresh,
          snapshotCacheEnabled: true,
          snapshotCacheTtlEnabled: true
        },
        rendering: {
          trailsEnabled: true, // Controlled by CommandBar Store now, but we keep structure
          trailArrowsEnabled: true,
          trailGlowEnabled: true,
          labelsEnabled: state.showLabels,
          adaptiveLabels: true,
          semanticZoom: state.semanticZoom
        },
        camera: {
          autoFitEnabled: true,
          fitPadding: 0.5,
          smoothInterpolation: true,
          maxZoom: state.maxZoom,
          minInteractionZoom: state.minZoom
        },
        interaction: {
          hoverHighlight: true,
          selectionHighlight: true,
          tooltipEnabled: true
        }
      };
      try {
        await updateSettingsConfig(config);
      } catch (e) {
        console.error('Failed to save settings config', e);
      }
    }, 500); // 500ms debounce
  }
}));
```

```typescript
// File: src\stores\useCommandBarStore.ts
import { create } from 'zustand';
import { parseTimeframe } from '../core/TimeframeParser';
import { fetchCommandBarConfig, updateCommandBarConfig } from '../services/api';

export type TimeframeToken = string;

export interface CommandBarState {
  timeframe: TimeframeToken;
  trailLength: number;
  bookmarkedTrailLengths: number[];
  bookmarkedTimeframes: string[];
  recentTimeframes: string[];
  normalized: boolean;
  showTrails: boolean;

  hydrated: boolean;

  setTimeframe: (t: TimeframeToken) => void;
  setTrailLength: (l: number) => void;
  setBookmarkedTrailLengths: (l: number[]) => void;
  setBookmarkedTimeframes: (tfs: string[]) => void;
  addRecentTimeframe: (tf: string) => void;
  setNormalized: (v: boolean) => void;
  setShowTrails: (v: boolean) => void;

  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}

const DEFAULT_STATE = {
  timeframe: '15min',
  trailLength: 10,
  bookmarkedTrailLengths: [5, 10, 15, 20, 30],
  bookmarkedTimeframes: ['1min', '5min', '15min', '45min', '1h', '1d', '1w', '1mo'],
  recentTimeframes: [],
  normalized: true,
  showTrails: true,
  hydrated: false,
};

let saveTimeout: any = null;

export const useCommandBarStore = create<CommandBarState>((set, get) => ({
  ...DEFAULT_STATE,

  setTimeframe: (t) => {
    try {
      const parsed = parseTimeframe(t);
      set({ timeframe: parsed.canonical });
      get().addRecentTimeframe(parsed.canonical);
      get().saveConfig();
    } catch (e) {
      console.warn('Invalid timeframe', e);
    }
  },
  setTrailLength: (l) => {
    set({ trailLength: l });
    get().saveConfig();
  },
  setBookmarkedTrailLengths: (l) => {
    set({ bookmarkedTrailLengths: l });
    get().saveConfig();
  },
  setBookmarkedTimeframes: (tfs) => {
    const sorted = tfs.map(t => {
      try { return parseTimeframe(t); } catch { return null; }
    }).filter(Boolean)
      .sort((a, b) => a!.sortWeight - b!.sortWeight)
      .map(p => p!.canonical);
    set({ bookmarkedTimeframes: Array.from(new Set(sorted)) });
    get().saveConfig();
  },
  addRecentTimeframe: (tf) => {
    const recents = get().recentTimeframes.filter(t => t !== tf);
    set({ recentTimeframes: [tf, ...recents].slice(0, 5) });
  },
  setNormalized: (v) => {
    set({ normalized: v });
    get().saveConfig();
  },
  setShowTrails: (v) => {
    set({ showTrails: v });
    get().saveConfig();
  },

  loadConfig: async () => {
    try {
      const config = await fetchCommandBarConfig();
      if (config) {
        set({
          timeframe: config.timeframes?.active || DEFAULT_STATE.timeframe,
          bookmarkedTimeframes: config.timeframes?.bookmarked || DEFAULT_STATE.bookmarkedTimeframes,
          trailLength: config.trailLengths?.active || DEFAULT_STATE.trailLength,
          bookmarkedTrailLengths: config.trailLengths?.bookmarked || DEFAULT_STATE.bookmarkedTrailLengths,
          normalized: config.toggles?.normalized ?? DEFAULT_STATE.normalized,
          showTrails: config.toggles?.trailsEnabled ?? DEFAULT_STATE.showTrails,
          hydrated: true
        });
      }
    } catch (e) {
      console.error('Failed to load command bar config', e);
      set({ hydrated: true });
    }
  },

  saveConfig: () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const state = get();
      const config = {
        timeframes: {
          active: state.timeframe,
          bookmarked: state.bookmarkedTimeframes
        },
        trailLengths: {
          active: state.trailLength,
          bookmarked: state.bookmarkedTrailLengths
        },
        toggles: {
          normalized: state.normalized,
          trailsEnabled: state.showTrails
        }
      };
      try {
        await updateCommandBarConfig(config);
      } catch (e) {
        console.error('Failed to save command bar config', e);
      }
    }, 500); // 500ms debounce
  }
}));
```

```typescript
// File: src\stores\useRrgStore.ts
import { create } from 'zustand';
import type { RrgPoint, EnrichedRrgPoint, QuadrantDistribution, HistoricalFrame, SectorWatchlistItem } from '../types';
import { enrichAll, computeQuadrantDistribution } from '../core/math';
import { useChartSettingsStore } from './useChartSettingsStore';
import { useCommandBarStore } from './useCommandBarStore';
import { fetchSnapshotWithLatency, fetchSectors, fetchWatchlistConfig, updateWatchlistConfig } from '../services/api';

interface RrgState {
  // Data
  rawData: RrgPoint[];
  enrichedData: EnrichedRrgPoint[];
  sectors: string[];
  watchlist: SectorWatchlistItem[];
  quadrantDistribution: QuadrantDistribution;
  
  // Controls
  // benchmark, timeframe, trailLength, showTrail, normalized moved to useChartSettingsStore
  
  selectedSector: string | null;
  hoveredSector: string | null;
  hiddenSectors: string[];
  
  // Viewport removed, now in useViewportStore
  // Connection
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  lastUpdate: number | null;
  latency: number;
  loading: boolean;
  
  // Historical playback (future-proofed)
  historicalFrames: HistoricalFrame[];
  currentFrameIndex: number;
  playbackSpeed: number;
  isPlaying: boolean;
  
  // Crosshair
  crosshairX: number | null;
  crosshairY: number | null;
  
  // Actions
  // Settings setters moved to useChartSettingsStore
  setSelectedSector: (s: string | null) => void;
  setHoveredSector: (s: string | null) => void;
  setCrosshair: (x: number | null, y: number | null) => void;
  setPlaybackSpeed: (s: number) => void;
  setIsPlaying: (v: boolean) => void;
  setCurrentFrameIndex: (i: number) => void;
  toggleSector: (symbol: string) => void;
  toggleHiddenSector: (symbol: string) => void;
  hideSectors: (symbols: string[]) => void;
  showSectors: (symbols: string[]) => void;
  selectAllSectors: () => void;
  clearAllSectors: () => void;
  setWatchlist: (items: SectorWatchlistItem[]) => void;
  saveWatchlist: (items: SectorWatchlistItem[]) => void;
  lastQueryKey: string | null;
  fetchData: (signal?: AbortSignal) => Promise<void>;
  fetchSectorList: () => Promise<void>;
}

let saveTimeout: any = null;

export const useRrgStore = create<RrgState>((set, get) => ({
  rawData: [],
  enrichedData: [],
  sectors: [],
  watchlist: [],
  quadrantDistribution: { leading: 0, weakening: 0, lagging: 0, improving: 0 },
  selectedSector: null,
  hoveredSector: null,
  hiddenSectors: [],
  connectionStatus: 'DISCONNECTED',
  lastUpdate: null,
  latency: 0,
  loading: false,
  historicalFrames: [],
  currentFrameIndex: 0,
  playbackSpeed: 1,
  isPlaying: false,
  crosshairX: null,
  crosshairY: null,
  lastQueryKey: null,
  
  setSelectedSector: (s) => set({ selectedSector: s }),
  setHoveredSector: (s) => set({ hoveredSector: s }),
  setCrosshair: (x, y) => set({ crosshairX: x, crosshairY: y }),
  setPlaybackSpeed: (s) => set({ playbackSpeed: s }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setCurrentFrameIndex: (i) => set({ currentFrameIndex: i }),
  
  toggleSector: (symbol) => set(state => {
    const next = state.watchlist.map(w => w.symbol === symbol ? { ...w, enabled: !w.enabled } : w);
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  toggleHiddenSector: (symbol) => set(state => {
    const hidden = state.hiddenSectors.includes(symbol)
      ? state.hiddenSectors.filter(s => s !== symbol)
      : [...state.hiddenSectors, symbol];
    return { hiddenSectors: hidden };
  }),
  hideSectors: (symbols) => set(state => {
    const newHidden = [...state.hiddenSectors];
    symbols.forEach(s => {
      if (!newHidden.includes(s)) newHidden.push(s);
    });
    return { hiddenSectors: newHidden };
  }),
  showSectors: (symbols) => set(state => {
    return { hiddenSectors: state.hiddenSectors.filter(s => !symbols.includes(s)) };
  }),
  selectAllSectors: () => set(state => {
    const next = state.watchlist.map(w => ({ ...w, enabled: true }));
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  clearAllSectors: () => set(state => {
    const next = state.watchlist.map(w => ({ ...w, enabled: false }));
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  setWatchlist: (items) => {
    set({ watchlist: items });
    get().saveWatchlist(items);
  },
  
  saveWatchlist: (items) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        const config = {
          version: 1,
          watchlistOnlyResampling: useChartSettingsStore.getState().watchlistOnlyResampling,
          watchlists: [{
            id: "default",
            name: "Default",
            active: true,
            sectors: items.map((i: SectorWatchlistItem) => ({
              symbol: i.symbol,
              pinned: i.pinned || false,
              priority: i.order || 0,
              hidden: !i.enabled
            }))
          }]
        };
        await updateWatchlistConfig(config);
      } catch (e) {
        console.error('Failed to save watchlist config', e);
      }
    }, 500);
  },

  fetchData: async (signal?: AbortSignal) => {
    let { benchmark, minimalWindowResampling, watchlistOnlyResampling } = useChartSettingsStore.getState();
    let { timeframe, trailLength, normalized } = useCommandBarStore.getState();

    if (benchmark === 'NSE_INDEX__Nifty_50') benchmark = 'NSE_INDEX_Nifty 50';
    const { watchlist, lastQueryKey, selectedSector, hoveredSector } = get();
    let enabledSectors = watchlist.filter(w => w.enabled).map(w => w.symbol);
    const watchlistSectors = watchlist.map(w => w.symbol);
    
    // Validate out placeholder/malformed queries (but allow benchmark to be plotted)
    enabledSectors = enabledSectors.filter(s => s.trim().toLowerCase() !== "sector" && s.trim() !== "");

    // Ensure benchmark is always plotted
    if (!enabledSectors.includes(benchmark)) {
      enabledSectors.push(benchmark);
    }

    const queryKey = JSON.stringify({ benchmark, timeframe, trailLength, normalized, minimalWindowResampling, watchlistOnlyResampling, enabledSectors, watchlistSectors, selectedSector, hoveredSector });
    if (queryKey === lastQueryKey) return; // Deduplication
    
    set({ lastQueryKey: queryKey });

    // Do not fetch if no sectors enabled
    if (enabledSectors.length === 0) {
      set({ rawData: [], enrichedData: [], quadrantDistribution: { leading: 0, weakening: 0, lagging: 0, improving: 0 } });
      return;
    }
    
    set({ loading: true });
    try {
      const { data, latency } = await fetchSnapshotWithLatency(benchmark, timeframe, trailLength, normalized, enabledSectors, minimalWindowResampling, watchlistOnlyResampling, watchlistSectors, selectedSector, hoveredSector, signal);
      const enriched = enrichAll(data);
      const distribution = computeQuadrantDistribution(data);
      set({
        rawData: data,
        enrichedData: enriched,
        quadrantDistribution: distribution,
        connectionStatus: 'CONNECTED',
        lastUpdate: Date.now(),
        latency,
        loading: false,
      });
    } catch (error: any) {
      if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
        set({ connectionStatus: 'DISCONNECTED', loading: false });
      }
    }
  },
  
  fetchSectorList: async () => {
    try {
      const fetchedSectors = await fetchSectors();
      
      let savedWatchlist: SectorWatchlistItem[] = [];
      try {
        const config = await fetchWatchlistConfig();
        if (config && config.watchlists && config.watchlists.length > 0) {
           const activeList = config.watchlists.find((w: any) => w.active) || config.watchlists[0];
           savedWatchlist = activeList.sectors.map((s: any) => ({
             symbol: s.symbol,
             enabled: !s.hidden,
             pinned: s.pinned,
             order: s.priority
           }));
        }
      } catch (e) {
        console.error('Failed to load watchlist config', e);
      }
      
      let { benchmark } = useChartSettingsStore.getState();
      if (benchmark === 'NSE_INDEX__Nifty_50') benchmark = 'NSE_INDEX_Nifty 50';

      const sectors = Array.from(new Set([benchmark, ...fetchedSectors]));

      const watchlistMap = new Map(savedWatchlist.map(w => [w.symbol, w]));
      const newWatchlist = sectors.map(symbol => {
        if (watchlistMap.has(symbol)) {
          return watchlistMap.get(symbol)!;
        }
        return { symbol, enabled: true };
      });
      
      set({ sectors, watchlist: newWatchlist });
    } catch {
      console.error('Failed to fetch sectors');
    }
  },
}));
```

```typescript
// File: src\stores\useViewportStore.ts
import { create } from 'zustand';
import type { DataBounds } from '../core/math';

type ViewportState = {
  // Target Fit Camera
  targetFitZoom: number;
  targetFitOffsetX: number;
  targetFitOffsetY: number;

  // Target Interaction Camera
  targetInteractionZoom: number;
  targetInteractionOffsetX: number;
  targetInteractionOffsetY: number;

  contentBounds: DataBounds | null;

  viewportWidth: number;
  viewportHeight: number;
  plotWidth: number;
  plotHeight: number;

  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;

  setDimensions: (vWidth: number, vHeight: number, pWidth: number, pHeight: number) => void;
  setContentBounds: (bounds: DataBounds) => void;
  
  // Interaction Controls
  zoomBy: (deltaY: number, mouseX: number, mouseY: number) => void;
  panBy: (dx: number, dy: number) => void;
  startDrag: (x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  resetToFit: () => void;

  // Utilities
  screenToWorld: (screenX: number, screenY: number, renderFitZoom: number, renderFitOffsetX: number, renderFitOffsetY: number, renderInteractionZoom: number, renderInteractionOffsetX: number, renderInteractionOffsetY: number) => { x: number, y: number };
};

export const useViewportStore = create<ViewportState>((set, get) => ({
  targetFitZoom: 1,
  targetFitOffsetX: 0,
  targetFitOffsetY: 0,

  targetInteractionZoom: 1,
  targetInteractionOffsetX: 0,
  targetInteractionOffsetY: 0,

  contentBounds: null,

  viewportWidth: 800,
  viewportHeight: 600,
  plotWidth: 800,
  plotHeight: 600,

  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,

  setDimensions: (vWidth, vHeight, pWidth, pHeight) => {
    set({ viewportWidth: vWidth, viewportHeight: vHeight, plotWidth: pWidth, plotHeight: pHeight });
  },

  setContentBounds: (bounds) => {
    const state = get();
    // Deadzone check: only recompute if bounds changed significantly (e.g. 5%)
    const prev = state.contentBounds;
    if (prev) {
      const deltaW = Math.abs(bounds.domainWidth - prev.domainWidth) / prev.domainWidth;
      const deltaH = Math.abs(bounds.domainHeight - prev.domainHeight) / prev.domainHeight;
      if (deltaW < 0.05 && deltaH < 0.05) {
        return; // Dead zone
      }
    }

    const { plotWidth, plotHeight } = state;
    
    if (
      plotWidth <= 0 ||
      plotHeight <= 0 ||
      !Number.isFinite(plotWidth) ||
      !Number.isFinite(plotHeight)
    ) {
      return;
    }

    set({
      contentBounds: bounds,
      targetFitZoom: 1,
      targetFitOffsetX: 0,
      targetFitOffsetY: 0
    });
  },

  zoomBy: (deltaY, mouseX, mouseY) => {
    const state = get();
    // Exponential zoom interaction
    const sensitivity = 0.0015;
    const factor = Math.exp(-deltaY * sensitivity);
    
    let newInteractionZoom = state.targetInteractionZoom * factor;
    // Zoom-To-Fit constraint
    newInteractionZoom = Math.max(1, newInteractionZoom);

    const { targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY } = state;

    const fitX = (mouseX - targetFitOffsetX) / targetFitZoom;
    const fitY = (mouseY - targetFitOffsetY) / targetFitZoom;

    const worldX = (fitX - targetInteractionOffsetX) / targetInteractionZoom;
    const worldY = (fitY - targetInteractionOffsetY) / targetInteractionZoom;

    let newInteractionOffsetX = fitX - worldX * newInteractionZoom;
    let newInteractionOffsetY = fitY - worldY * newInteractionZoom;

    if (newInteractionZoom === 1) {
      newInteractionOffsetX = 0;
      newInteractionOffsetY = 0;
    }

    set({ 
      targetInteractionZoom: newInteractionZoom,
      targetInteractionOffsetX: newInteractionOffsetX,
      targetInteractionOffsetY: newInteractionOffsetY
    });
  },

  panBy: (dx, dy) => {
    const state = get();
    // dx and dy are in screen space. We need to pan the interaction offset.
    // screenX = (worldX * intZoom + intOffset) * fitZoom + fitOffset
    // A shift of dx in screenX corresponds to dx / fitZoom shift in intOffset
    let newOffsetX = state.targetInteractionOffsetX + (dx / state.targetFitZoom);
    let newOffsetY = state.targetInteractionOffsetY + (dy / state.targetFitZoom);

    set({ targetInteractionOffsetX: newOffsetX, targetInteractionOffsetY: newOffsetY });
  },

  startDrag: (x, y) => {
    set({ isDragging: true, dragStartX: x, dragStartY: y });
  },

  updateDrag: (x, y) => {
    const state = get();
    if (!state.isDragging) return;

    const dx = x - state.dragStartX;
    const dy = y - state.dragStartY;

    let newOffsetX = state.targetInteractionOffsetX + (dx / state.targetFitZoom);
    let newOffsetY = state.targetInteractionOffsetY + (dy / state.targetFitZoom);

    set({ 
      targetInteractionOffsetX: newOffsetX, 
      targetInteractionOffsetY: newOffsetY, 
      dragStartX: x, 
      dragStartY: y 
    });
  },

  endDrag: () => {
    set({ isDragging: false });
  },

  resetToFit: () => {
    set({ targetInteractionZoom: 1, targetInteractionOffsetX: 0, targetInteractionOffsetY: 0 });
  },

  screenToWorld: (screenX, screenY, fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY) => {
    // screenX = (worldX * intZoom + intOffsetX) * fitZoom + fitOffsetX
    const fitX = (screenX - fitOffsetX) / fitZoom;
    const worldX = (fitX - intOffsetX) / intZoom;

    const fitY = (screenY - fitOffsetY) / fitZoom;
    const worldY = (fitY - intOffsetY) / intZoom;

    return { x: worldX, y: worldY };
  }
}));
```

```typescript
// File: src\themes\bloomberg.ts
export const bloomberg = {
  bg: { primary: '#000000', secondary: '#050505', panel: '#0B0B0B', command: '#111111' },
  border: { primary: '#1F1F1F', grid: '#1E1E1E', gridMajor: '#2A2A2A' },
  text: { primary: '#E0E0E0', secondary: '#909090', muted: '#606060', label: '#707070' },
  accent: { orange: '#FF9900', orangeDim: 'rgba(255,153,0,0.3)' },
  quadrant: {
    leading: { bg: '#0D5C2A', text: '#2ECC71' },
    weakening: { bg: '#8A7A00', text: '#F1C40F' },
    lagging: { bg: '#5A120F', text: '#E74C3C' },
    improving: { bg: '#0B3D5A', text: '#3498DB' },
  },
  axis: { center: '#707070' },
} as const;

export type Theme = typeof bloomberg;
export type Quadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';

export function getQuadrantColor(q: Quadrant) {
  const map = { LEADING: bloomberg.quadrant.leading, WEAKENING: bloomberg.quadrant.weakening, LAGGING: bloomberg.quadrant.lagging, IMPROVING: bloomberg.quadrant.improving };
  return map[q];
}
```

```typescript
// File: src\types.ts
export interface TrailPoint {
  epochMillis: number;
  x: number;
  y: number;
}

export interface RrgPoint {
  symbol: string;
  x: number;  // RS-Ratio
  y: number;  // RS-Momentum
  quadrant: 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';
  trail: TrailPoint[];
  stale?: boolean;
  computedAt?: number;
}

// Computed client-side
export interface EnrichedRrgPoint extends RrgPoint {
  velocity: number;
  heading: string;   // N, NE, E, SE, S, SW, W, NW
  headingAngle: number; // radians
  distance: number;  // from center (100,100)
  trendStrength: number;
  curvature: number;
  momentumRoc: number;
  quadrantDuration: number; // consecutive frames in same quadrant
}

export interface Viewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  innerWidth: number;
  innerHeight: number;
}

export interface HistoricalFrame {
  timestamp: number;
  points: RrgPoint[];
}

export type Quadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';

// For breadth gauge
export interface QuadrantDistribution {
  leading: number;
  weakening: number;
  lagging: number;
  improving: number;
}

export interface SectorWatchlistItem {
  symbol: string;
  enabled: boolean;
  pinned?: boolean;
  order?: number;
}
```

```json
// File: tsconfig.app.json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

```json
// File: tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

```json
// File: tsconfig.node.json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

```typescript
// File: vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
```

```json
// File: rrg_cache_policy.json
{
  "version" : 1,
  "updatedAt" : 0,
  "ttl" : { },
  "backgroundRefresh" : { }
}
```

```json
// File: rrg_commandbar.json
{
  "version" : 1,
  "updatedAt" : 1779645738403,
  "timeframes" : {
    "active" : "45m",
    "bookmarked" : [ "1min", "5min", "15min", "45min", "1h", "1d", "1w", "1mo" ]
  },
  "trailLengths" : {
    "active" : 5,
    "bookmarked" : [ 5, 10, 15, 20, 30 ]
  },
  "toggles" : {
    "normalized" : true,
    "trailsEnabled" : true
  }
}
```

```json
// File: rrg_feature_flags.json
{
  "version" : 1,
  "updatedAt" : 0,
  "features" : { }
}
```

```json
// File: rrg_settings.json
{
  "version" : 1,
  "updatedAt" : 1779645704487,
  "optimization" : {
    "minimalWindowResampling" : true,
    "watchlistOnlyResampling" : true,
    "backgroundSnapshotRefresh" : true,
    "snapshotCacheEnabled" : true,
    "snapshotCacheTtlEnabled" : true
  },
  "rendering" : {
    "trailsEnabled" : true,
    "trailArrowsEnabled" : true,
    "trailGlowEnabled" : true,
    "labelsEnabled" : true,
    "adaptiveLabels" : true,
    "semanticZoom" : true
  },
  "camera" : {
    "autoFitEnabled" : true,
    "fitPadding" : 0.5,
    "smoothInterpolation" : true,
    "maxZoom" : 6.0,
    "minInteractionZoom" : 0.8
  },
  "interaction" : {
    "hoverHighlight" : true,
    "selectionHighlight" : true,
    "tooltipEnabled" : true
  }
}
```

```json
// File: rrg_timeframes.json
{
  "version" : 1,
  "updatedAt" : 0,
  "profiles" : { }
}
```

```json
// File: sector_rrg_watchlist.json
{
  "version" : 1,
  "updatedAt" : 1779640672683,
  "watchlistOnlyResampling" : false,
  "watchlists" : [ {
    "id" : "default",
    "name" : "Default",
    "active" : true,
    "sectors" : [ {
      "symbol" : "NSE_INDEX_Nifty 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_India VIX",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty 100",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty 200",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty 500",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY Alpha 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY AlphaLowVol",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty AQL 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty AQLV 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Auto",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Bank",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Capital Mkt",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Cement",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Chemicals",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Commodities",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_NIFTY CONSR DURBL",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Consumption",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty CoreHousing",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Corp MAATR",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty CPSE",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Div Opps 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Energy",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty EV",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Fin Service",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty FinSerExBnk",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty FinSrv25 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty FMCG",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty FPI 150",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GrowSect 15",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 10Yr",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 10Yr Cln",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 11 15Yr",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 15YrPlus",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 4 8Yr",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS 8 13Yr",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty GS Compsite",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY HEALTHCARE",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty HighBeta 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Housing",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Ind Defence",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY IND DIGITAL",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Ind Tourism",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_NIFTY INDIA MFG",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Infra",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty InfraLog",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Internet",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty IPO",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty IT",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_NIFTY LARGEMID250",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Low Vol 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY M150 QLTY50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Media",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Metal",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_NIFTY MICROCAP250",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Mid Liq 15",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY MID SELECT",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY MIDCAP 100",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY MIDCAP 150",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Midcap 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MidSmall 50 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY MIDSML 400",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MidSml Hlth",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MNC",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Mobility",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MS Fin Serv",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MS Ind Cons",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty MS IT Telcm",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Multi Infra",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Multi Mfg",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Multi MQ 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty New Consump",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Next 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty NonCyc Cons",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY OIL AND GAS",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Pharma",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty PSE",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty PSU Bank",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Pvt Bank",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Qlty LV 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty RailwaysPSU",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Realty",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty REITs Realty",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Rural",
      "pinned" : false,
      "priority" : 0,
      "hidden" : false
    }, {
      "symbol" : "NSE_INDEX_Nifty Serv Sector",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Shariah 25",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Smallcap 500",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty SME Emerge",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Sml250 Q50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY SMLCAP 100",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY SMLCAP 250",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY SMLCAP 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Tata 25 Cap",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty TMMQ 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Top 10 EW",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Top 15 EW",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Top 20 EW",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY TOTAL MKT",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Trans Logis",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty Waves",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty100 Alpha 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty100 Enh ESG",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY100 EQL Wgt",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY100 ESG",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty100 Liq 15",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY100 LowVol30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY100 Qualty30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty100ESGSecLdr",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty200 Alpha 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY200 QUALTY30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty200 Value 30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty200Momentm30",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 Div Point",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY50 EQL Wgt",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 PR 1x Inv",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 PR 2x Lev",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 Shariah",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 TR 1x Inv",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 TR 2x Lev",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 USD",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty50 Value 20",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 EW",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 Flexicap",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 Health",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 LMS Eql",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 LowVol50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 MQVLv50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NIFTY500 MULTICAP",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 Qlty50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 Shariah",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500 Value 50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_Nifty500Momentm50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NiftyConglomerate",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NiftyM150Momntm50",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NiftyMS400 MQ 100",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    }, {
      "symbol" : "NSE_INDEX_NiftySml250MQ 100",
      "pinned" : false,
      "priority" : 0,
      "hidden" : true
    } ]
  } ]
}
```
