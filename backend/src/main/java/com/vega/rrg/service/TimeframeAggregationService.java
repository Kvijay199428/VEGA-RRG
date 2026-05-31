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
