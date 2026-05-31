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
