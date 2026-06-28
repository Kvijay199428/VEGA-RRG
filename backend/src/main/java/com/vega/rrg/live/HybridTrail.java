package com.vega.rrg.live;

import java.util.List;

/**
 * Result of HybridTrailComposer.compose().
 *
 * Contains the final composed trail with metadata about the composition.
 * Provisional point is separate from stable trail — it is an OVERLAY,
 * not counted toward trail length.
 *
 * @param stablePoints      Exactly requestedTrailLength (or fewer if insufficient data)
 * @param provisionalPoint  Nullable — current in-progress candle overlay
 * @param historicalCount   How many of stablePoints came from HistoricalTrailCache
 * @param liveCount         How many came from live session (LiveRrgState.canonicalTrail)
 * @param provisionalCount  0 or 1
 * @param requestedLength   What the user asked for
 * @param availableLength   What we could actually provide (warmup sufficiency)
 */
public record HybridTrail(
    List<LiveRrgState.LiveTrailPoint> stablePoints,
    LiveRrgState.LiveTrailPoint provisionalPoint,
    int historicalCount,
    int liveCount,
    int provisionalCount,
    int requestedLength,
    int availableLength
) {}
