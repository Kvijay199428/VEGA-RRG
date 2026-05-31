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
