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
