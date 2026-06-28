package com.vega.rrg.controller;

import com.vega.rrg.model.config.RrgPreferences;
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
                "preferences", true,
                "replay", true
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

    @GetMapping("/preferences")
    public ResponseEntity<RrgPreferences> getPreferences(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (request.checkNotModified(snapshot.preferencesHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.preferencesHash() + "\"")
                .body(snapshot.preferencesConfig());
    }

    @PatchMapping("/preferences")
    public ResponseEntity<RrgPreferences> updatePreferences(
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody RrgPreferences config) {
        
        String expectedHash = ifMatch != null ? ifMatch.replace("\"", "") : null;
        configService.updatePreferences(config, expectedHash);
        
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.preferencesHash() + "\"")
                .body(snapshot.preferencesConfig());
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

    @GetMapping("/replay")
    public ResponseEntity<com.vega.rrg.model.config.ReplayConfig> getReplay(WebRequest request) {
        RrgRuntimeConfigurationSnapshot snapshot = configService.getRuntimeSnapshot();
        if (request.checkNotModified(snapshot.replayHash())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }
        return ResponseEntity.ok()
                .eTag("\"" + snapshot.replayHash() + "\"")
                .body(snapshot.replayConfig());
    }
}
