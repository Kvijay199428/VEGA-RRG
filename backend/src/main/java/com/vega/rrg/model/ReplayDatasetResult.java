package com.vega.rrg.model;

import java.util.List;

/**
 * Top-level replay dataset result returned by the stateless replay-dataset endpoint.
 * Contains series-oriented data: timestamps + per-sector RS-Ratio/Momentum arrays,
 * plus reference (benchmark) close arrays. No per-frame objects — frames are built
 * lazily on the client by slicing these arrays.
 */
public record ReplayDatasetResult(
    ReplayDatasetMetadata metadata,
    ReplayDatasetCapabilities capabilities,
    String benchmark,
    String timeframe,
    boolean normalized,
    int frameCount,
    long[] timestamps,
    List<ReferenceSeries> referenceSeries,
    List<SectorSeriesResult> sectorSeries
) {

    /**
     * Dataset metadata for cache invalidation and staleness detection.
     */
    public record ReplayDatasetMetadata(
        long generation,
        String hash,
        long createdAt,
        String instrumentRevision
    ) {}

    /**
     * Advertised capabilities so the frontend never makes assumptions
     * about what a dataset can support.
     */
    public record ReplayDatasetCapabilities(
        boolean supportsReplay,
        boolean supportsNormalization,
        boolean supportsIntraday,
        int maxTrailLength,
        long minTimestamp,
        long maxTimestamp
    ) {}

    /**
     * Reference (benchmark) price series aligned to the timestamp array.
     * Uses an array rather than a single field to future-proof for
     * multi-benchmark replay (e.g. BankNifty, Sensex).
     */
    public record ReferenceSeries(
        String symbol,
        double[] closes
    ) {}

    /**
     * Per-sector RS-Ratio and RS-Momentum series, aligned to the
     * timestamp array. The client constructs trails and derives
     * quadrants from these arrays — no duplication per frame.
     */
    public record SectorSeriesResult(
        String symbol,
        double[] rsRatio,
        double[] rsMomentum
    ) {}
}
