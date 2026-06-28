package com.vega.rrg.live;

import com.vega.rrg.model.LiveMode;
import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.proto.ProtoCandleFile;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Deterministic seeded demo market data service.
 * Generates pseudo-realistic price ticks using mean-reverting Ornstein-Uhlenbeck process.
 *
 * Key properties:
 * - Deterministic: Random(seed = sector.hashCode()) — same movement across restarts
 * - Realistic: generates price ticks, not fake x/y — flows through real RRG pipeline
 * - Mean-reverting: sectors gradually return toward base price (prevents drift)
 * - Per-sector volatility profiles
 */
@Slf4j
@Service
public class DemoMarketDataService implements MarketDataProvider {

    private final MarketClockService marketClock;
    private final Path storageRoot = Paths.get("..", "storage", "candles", "sector");

    private ScheduledExecutorService scheduler;
    private Consumer<MarketTick> tickConsumer;
    private final AtomicBoolean running = new AtomicBoolean(false);

    // Per-sector state
    private final Map<String, DemoSectorState> sectorStates = new ConcurrentHashMap<>();

    // Tick interval in milliseconds
    private static final long TICK_INTERVAL_MS = 500;

    // Volatility profiles (annualized σ, scaled down to tick level)
    private static final Map<String, Double> VOLATILITY_PROFILES = Map.of(
        "BANK", 0.0020,
        "FIN", 0.0018,
        "IT", 0.0015,
        "AUTO", 0.0016,
        "PHARMA", 0.0012,
        "METAL", 0.0022,
        "ENERGY", 0.0019,
        "FMCG", 0.0010,
        "INFRA", 0.0017,
        "REALTY", 0.0025
    );
    private static final double DEFAULT_VOLATILITY = 0.0015;

    // Ornstein-Uhlenbeck mean reversion speed
    private static final double MEAN_REVERSION_SPEED = 0.001;

    public DemoMarketDataService(MarketClockService marketClock) {
        this.marketClock = marketClock;
    }

    @Override
    public void start(Consumer<MarketTick> tickConsumer) {
        if (running.getAndSet(true)) {
            log.warn("DemoMarketDataService: Already running");
            return;
        }

        this.tickConsumer = tickConsumer;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "demo-tick-generator");
            t.setDaemon(true);
            return t;
        });

        // Initialize sector states from .pb files
        initializeSectorStates();

        scheduler.scheduleAtFixedRate(this::generateTick, 0, TICK_INTERVAL_MS, TimeUnit.MILLISECONDS);
        log.info("DemoMarketDataService: Started with {} sectors, interval={}ms",
                sectorStates.size(), TICK_INTERVAL_MS);
    }

    @Override
    public void stop() {
        if (!running.getAndSet(false)) return;

        if (scheduler != null) {
            scheduler.shutdown();
            try {
                scheduler.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        sectorStates.clear();
        log.info("DemoMarketDataService: Stopped");
    }

    @Override
    public LiveMode getMode() {
        return LiveMode.DEMO;
    }

    @Override
    public boolean isRunning() {
        return running.get();
    }

    /**
     * Initialize sector states by reading the last close price from existing .pb candle files.
     */
    private void initializeSectorStates() {
        java.io.File sectorDir = storageRoot.toFile();
        if (!sectorDir.exists() || !sectorDir.isDirectory()) {
            log.warn("DemoMarketDataService: Storage directory not found: {}", storageRoot);
            return;
        }

        String[] sectors = sectorDir.list((dir, name) -> new java.io.File(dir, name).isDirectory());
        if (sectors == null) return;

        for (String sector : sectors) {
            try {
                double basePrice = loadLastClose(sector);
                if (basePrice <= 0) continue;

                double volatility = getVolatilityForSector(sector);
                Random random = new Random(sector.hashCode()); // Deterministic seed!

                sectorStates.put(sector, new DemoSectorState(sector, basePrice, basePrice, volatility, random));
            } catch (Exception e) {
                log.debug("DemoMarketDataService: Skipping sector {} (no data)", sector);
            }
        }
    }

    /**
     * Load the last close price from the 1m.pb file for a sector.
     */
    private double loadLastClose(String sector) {
        Path path = storageRoot.resolve(sector).resolve("1m.pb");
        try (FileInputStream fis = new FileInputStream(path.toFile())) {
            ProtoCandleFile file = ProtoCandleFile.parseFrom(fis);
            List<ProtoCandle> candles = file.getCandlesList();
            if (candles.isEmpty()) return -1;
            return candles.get(candles.size() - 1).getClose();
        } catch (IOException e) {
            // Try day.pb as fallback
            Path dayPath = storageRoot.resolve(sector).resolve("day.pb");
            try (FileInputStream fis = new FileInputStream(dayPath.toFile())) {
                ProtoCandleFile file = ProtoCandleFile.parseFrom(fis);
                List<ProtoCandle> candles = file.getCandlesList();
                if (candles.isEmpty()) return -1;
                return candles.get(candles.size() - 1).getClose();
            } catch (IOException ex) {
                return -1;
            }
        }
    }

    /**
     * Get the volatility for a sector based on its name keywords.
     */
    private double getVolatilityForSector(String sector) {
        String upper = sector.toUpperCase();
        for (Map.Entry<String, Double> entry : VOLATILITY_PROFILES.entrySet()) {
            if (upper.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return DEFAULT_VOLATILITY;
    }

    /**
     * Generate ticks for all sectors. Called every TICK_INTERVAL_MS.
     * Uses Ornstein-Uhlenbeck process for mean-reverting price movement.
     */
    private void generateTick() {
        if (!running.get()) return;

        long timestamp = marketClock.now();

        for (DemoSectorState state : sectorStates.values()) {
            // Ornstein-Uhlenbeck: dX = θ(μ - X)dt + σ dW
            double dt = TICK_INTERVAL_MS / 60_000.0; // fraction of a minute
            double dW = state.random.nextGaussian(); // deterministic because seeded
            double theta = MEAN_REVERSION_SPEED;
            double mu = state.basePrice;
            double sigma = state.volatility * state.basePrice;

            double drift = theta * (mu - state.currentPrice) * dt;
            double diffusion = sigma * Math.sqrt(dt) * dW;
            double newPrice = state.currentPrice + drift + diffusion;

            // Prevent negative prices
            newPrice = Math.max(newPrice, state.basePrice * 0.5);

            state.currentPrice = newPrice;

            // Generate volume with some randomness
            double volume = 1000 + state.random.nextDouble() * 5000;

            MarketTick tick = new MarketTick(state.symbol, newPrice, volume, timestamp);

            try {
                tickConsumer.accept(tick);
            } catch (Exception e) {
                log.error("DemoMarketDataService: Error delivering tick for {}", state.symbol, e);
            }
        }
    }

    /**
     * Internal state for each simulated sector.
     */
    private static class DemoSectorState {
        final String symbol;
        final double basePrice;      // Mean-reversion target
        double currentPrice;
        final double volatility;
        final Random random;         // Deterministic seeded RNG

        DemoSectorState(String symbol, double basePrice, double currentPrice, double volatility, Random random) {
            this.symbol = symbol;
            this.basePrice = basePrice;
            this.currentPrice = currentPrice;
            this.volatility = volatility;
            this.random = random;
        }
    }

    /**
     * Returns the number of active simulated sectors.
     */
    public int getActiveSectorCount() {
        return sectorStates.size();
    }
}
