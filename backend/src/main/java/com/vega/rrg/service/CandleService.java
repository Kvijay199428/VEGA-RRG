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
