// server/pipeline/ReliabilityScorer.js
// Computes a reliability score (0-100) based on validation, consistency, repair, and runtime metrics.

export function calculateReliability(enforcementLogs, repairHistory, runtimeSuccess) {
  // 1. Validation Score (25% weight)
  // Structural violations found vs fixed
  let totalViolations = 0;
  let fixedViolations = 0;
  let remainingWarnings = 0;

  for (const log of Object.values(enforcementLogs)) {
    if (log) {
      totalViolations += log.violations_found || 0;
      fixedViolations += log.violations_fixed || 0;
      remainingWarnings += log.warnings_remaining || 0;
    }
  }

  let validationScore = 100;
  if (totalViolations > 0) {
    const fixedRatio = fixedViolations / totalViolations;
    validationScore = 40 + (fixedRatio * 60); // Base 40, up to 100 if all fixed
  }
  if (remainingWarnings > 0) {
    validationScore -= (remainingWarnings * 5); // -5 per remaining warning
  }
  validationScore = Math.max(0, Math.min(100, validationScore));

  // 2. Consistency Score (30% weight)
  // Cross-layer violations (we want 0)
  // In a successful run, all CLV are either 0 or fixed. 
  // We'll proxy this by how many repairs were needed.
  let consistencyScore = 100 - (repairHistory.length * 10);
  consistencyScore = Math.max(0, Math.min(100, consistencyScore));

  // 3. Repair Score (20% weight)
  // Repairs attempted vs succeeded
  let repairScore = 100;
  if (repairHistory.length > 0) {
    const successCount = repairHistory.filter(r => r.repair_result === 'success' || r.repair_result === 'partial').length;
    repairScore = (successCount / repairHistory.length) * 100;
  }

  // 4. Runtime Score (25% weight)
  const runtimeScore = runtimeSuccess ? 100 : 0;

  // Final Weighted Score
  const reliability_score = Math.round(
    (validationScore * 0.25) +
    (consistencyScore * 0.30) +
    (repairScore * 0.20) +
    (runtimeScore * 0.25)
  );

  return {
    reliability_score,
    validation_score: Math.round(validationScore),
    consistency_score: Math.round(consistencyScore),
    repair_score: Math.round(repairScore),
    runtime_score: runtimeScore
  };
}
