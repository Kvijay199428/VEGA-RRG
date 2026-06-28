package com.vega.rrg.live;

import com.vega.rrg.proto.ProtoCandle;
import com.vega.rrg.service.TradingSessionProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Consumes MarketTick events and builds 1-minute OHLCV candles.
 *
 * Supports both:
 * - Finalized candles: completed 1m candles stored in LiveCandleStore
 * - Provisional candles: in-progress candle state for continuous rendering (correction #4)
 *
 * All operations run on the single writer thread (correction #12).
 */
@Slf4j
@Component
public class LiveCandleBuilder {

    private final MarketClockService marketClock;
    private final LiveCandleStore candleStore;
    private final TradingSessionProvider sessionProvider;

    // In-progress candle state per sector
    // sector → provisional candle builder
    private final Map<String, ProvisionalCandle> provisionalCandles = new ConcurrentHashMap<>();

    public LiveCandleBuilder(MarketClockService marketClock,
                             LiveCandleStore candleStore,
                             TradingSessionProvider sessionProvider) {
        this.marketClock = marketClock;
        this.candleStore = candleStore;
        this.sessionProvider = sessionProvider;
    }

    /**
     * Process a tick. Called on single writer thread.
     *
     * @param tick The incoming market tick
     * @return CandleEvent describing what happened (PROVISIONAL_UPDATE or CANDLE_COMPLETE)
     */
    public CandleEvent onTick(MarketTick tick) {
        long tickMinuteBoundary = marketClock.getMinuteBoundary(tick.timestampMs());
        String sector = tick.symbol();

        ProvisionalCandle provisional = provisionalCandles.get(sector);

        if (provisional == null) {
            // First tick for this sector — start new candle
            provisional = new ProvisionalCandle(sector, tickMinuteBoundary, tick.price(), tick.volume());
            provisionalCandles.put(sector, provisional);
            return CandleEvent.provisionalUpdate(sector, provisional.toProtoCandle());
        }

        if (tickMinuteBoundary > provisional.minuteBoundary) {
            // New minute — finalize previous candle
            ProtoCandle finalizedCandle = provisional.toProtoCandle();
            candleStore.addCandle("1min", sector, finalizedCandle);

            // Start new candle
            provisional = new ProvisionalCandle(sector, tickMinuteBoundary, tick.price(), tick.volume());
            provisionalCandles.put(sector, provisional);

            return CandleEvent.candleComplete(sector, finalizedCandle, provisional.toProtoCandle());
        }

        // Same minute — update provisional OHLCV
        provisional.update(tick.price(), tick.volume());
        return CandleEvent.provisionalUpdate(sector, provisional.toProtoCandle());
    }

    /**
     * Get the current provisional (in-progress) candle for a sector.
     */
    public ProtoCandle getProvisionalCandle(String sector) {
        ProvisionalCandle p = provisionalCandles.get(sector);
        return p != null ? p.toProtoCandle() : null;
    }

    /**
     * Clear all provisional state (used on live mode stop).
     */
    public void clear() {
        provisionalCandles.clear();
    }

    // --- Internal ---

    /**
     * Mutable in-progress candle state.
     */
    static class ProvisionalCandle {
        final String sector;
        final long minuteBoundary;
        double open;
        double high;
        double low;
        double close;
        double volume;

        ProvisionalCandle(String sector, long minuteBoundary, double price, double volume) {
            this.sector = sector;
            this.minuteBoundary = minuteBoundary;
            this.open = price;
            this.high = price;
            this.low = price;
            this.close = price;
            this.volume = volume;
        }

        void update(double price, double volume) {
            this.high = Math.max(this.high, price);
            this.low = Math.min(this.low, price);
            this.close = price;
            this.volume += volume;
        }

        ProtoCandle toProtoCandle() {
            return ProtoCandle.newBuilder()
                    .setEpochMillis(minuteBoundary)
                    .setOpen(open)
                    .setHigh(high)
                    .setLow(low)
                    .setClose(close)
                    .setVolume(volume)
                    .build();
        }
    }

    /**
     * Event produced by onTick() describing what happened.
     */
    public record CandleEvent(
        Type type,
        String sector,
        ProtoCandle finalizedCandle,     // non-null only for CANDLE_COMPLETE
        ProtoCandle provisionalCandle    // always non-null — current in-progress state
    ) {
        public enum Type { PROVISIONAL_UPDATE, CANDLE_COMPLETE }

        static CandleEvent provisionalUpdate(String sector, ProtoCandle provisional) {
            return new CandleEvent(Type.PROVISIONAL_UPDATE, sector, null, provisional);
        }

        static CandleEvent candleComplete(String sector, ProtoCandle finalized, ProtoCandle newProvisional) {
            return new CandleEvent(Type.CANDLE_COMPLETE, sector, finalized, newProvisional);
        }
    }
}
