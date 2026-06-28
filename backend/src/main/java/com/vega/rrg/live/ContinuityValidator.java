package com.vega.rrg.live;

import com.vega.rrg.model.ParsedTimeframe;
import com.vega.rrg.model.RrgPoint;
import com.vega.rrg.service.RrgService;
import com.vega.rrg.service.TimeframeParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Validates mathematical continuity between the hybrid trail (historical + live)
 * and a full snapshot recompute from RrgService.
 *
 * This catches:
 * - EMA drift between incremental and batch computation
 * - SMA/EMA smoothing mismatches
 * - Aggregation differences
 * - Historical/live bootstrap discontinuities
 *
 * Called once at bootstrap completion for validation (correction #7).
 */
@Slf4j
@Component
public class ContinuityValidator {

    private static final double EPSILON = 1e-6;

    private final RrgService rrgService;
    private final HybridTrailComposer trailComposer;
    private final TimeframeParser timeframeParser;

    public ContinuityValidator(RrgService rrgService,
                                HybridTrailComposer trailComposer,
                                TimeframeParser timeframeParser) {
        this.rrgService = rrgService;
        this.trailComposer = trailComposer;
        this.timeframeParser = timeframeParser;
    }

    /**
     * Compare a hybrid trail against a full historical recompute.
     *
     * @return ValidationResult with pass/fail and details
     */
    public ValidationResult validate(String sector, String benchmark,
                                      String timeframeStr, int trailLength,
                                      boolean normalized) {
        ParsedTimeframe parsedTf;
        try {
            parsedTf = timeframeParser.parse(timeframeStr);
        } catch (Exception e) {
            return new ValidationResult(false, "Cannot parse timeframe: " + timeframeStr,
                    0, 0, 0, 0);
        }

        // Get hybrid trail
        HybridTrail hybridTrail = trailComposer.compose(
                sector, benchmark, timeframeStr, trailLength, normalized);

        if (hybridTrail.stablePoints().isEmpty()) {
            return new ValidationResult(true, "No hybrid trail data — skipping validation",
                    0, 0, 0, 0);
        }

        // Full recompute via RrgService
        List<RrgPoint> snapshotResults = rrgService.calculateRrg(
                List.of(sector), benchmark, parsedTf, trailLength, normalized, false);

        if (snapshotResults.isEmpty()) {
            return new ValidationResult(true, "No snapshot data — skipping validation",
                    0, 0, 0, 0);
        }

        RrgPoint snapshotPoint = snapshotResults.get(0);
        List<RrgPoint.TrailPoint> snapshotTrail = snapshotPoint.getTrail();

        if (snapshotTrail == null || snapshotTrail.isEmpty()) {
            return new ValidationResult(true, "Snapshot has no trail — skipping validation",
                    0, 0, 0, 0);
        }

        // Compare tail points — only compare the historical portion
        // (live points won't exist in snapshot since snapshot is purely historical)
        int historicalCount = hybridTrail.historicalCount();
        List<LiveRrgState.LiveTrailPoint> hybridHistorical =
                hybridTrail.stablePoints().subList(0, Math.min(historicalCount, hybridTrail.stablePoints().size()));

        // Align from the tail of snapshot
        int snapshotStart = Math.max(0, snapshotTrail.size() - historicalCount);
        List<RrgPoint.TrailPoint> snapshotTail = snapshotTrail.subList(snapshotStart, snapshotTrail.size());

        int compareCount = Math.min(hybridHistorical.size(), snapshotTail.size());
        double maxDiffX = 0;
        double maxDiffY = 0;
        int failCount = 0;

        for (int i = 0; i < compareCount; i++) {
            LiveRrgState.LiveTrailPoint hp = hybridHistorical.get(hybridHistorical.size() - compareCount + i);
            RrgPoint.TrailPoint sp = snapshotTail.get(snapshotTail.size() - compareCount + i);

            double diffX = Math.abs(hp.x() - sp.getX());
            double diffY = Math.abs(hp.y() - sp.getY());

            maxDiffX = Math.max(maxDiffX, diffX);
            maxDiffY = Math.max(maxDiffY, diffY);

            if (diffX > EPSILON || diffY > EPSILON) {
                failCount++;
                if (failCount <= 5) { // Log first 5 failures
                    log.warn("ContinuityValidator: MISMATCH at index {} — " +
                                    "hybrid({}, {}) vs snapshot({}, {}), diff=({}, {})",
                            i, hp.x(), hp.y(), sp.getX(), sp.getY(), diffX, diffY);
                }
            }
        }

        boolean passed = failCount == 0;
        String message = passed
                ? String.format("PASS: %d points compared, maxDiff=(%.9f, %.9f)", compareCount, maxDiffX, maxDiffY)
                : String.format("FAIL: %d/%d points exceeded epsilon, maxDiff=(%.9f, %.9f)",
                failCount, compareCount, maxDiffX, maxDiffY);

        log.info("ContinuityValidator: sector={}, tf={}, trail={} — {}",
                sector, timeframeStr, trailLength, message);

        return new ValidationResult(passed, message, compareCount, failCount, maxDiffX, maxDiffY);
    }

    /**
     * Validation result record.
     */
    public record ValidationResult(
            boolean passed,
            String message,
            int comparedPoints,
            int failedPoints,
            double maxDiffX,
            double maxDiffY
    ) {}
}
