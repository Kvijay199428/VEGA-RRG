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
