// server/enforcement/SchemaEnforcer.js
// Main orchestrator — wraps every pipeline stage call with strict enforcement.
// Runs: StructuralValidator → SemanticValidator → CrossLayerValidator → AutoFixer
// Returns EnforcementResult on success, throws EnforcementError on unfixable ERRORs.

import { getContract, STAGE_NAMES } from './ContractDefinitions.js';
import { validateJSON, validateStructure } from './StructuralValidator.js';
import { validateSemantics } from './SemanticValidator.js';
import { validateCrossLayer } from './CrossLayerValidator.js';
import { applyAll } from './AutoFixer.js';

// ─────────────────────────────────────────────
// EnforcementError — thrown when pipeline must halt
// ─────────────────────────────────────────────

export class EnforcementError extends Error {
  constructor({ stage, stageName, haltedAt, violations, warnCount }) {
    const errorCount = violations.filter(v => v.severity === 'ERROR').length;
    const summary = buildSummary(stage, stageName, haltedAt, violations);
    const suggestedFix = buildSuggestedFix(violations);

    super(summary);
    this.name = 'EnforcementError';

    this.enforcement_error = true;
    this.stage = stage;
    this.stage_name = stageName;
    this.halted_at = haltedAt;
    this.error_count = errorCount;
    this.warn_count = warnCount;
    this.violations = violations;
    this.summary = summary;
    this.suggested_fix = suggestedFix;
  }

  /**
   * Serialize to the enforcement error schema
   */
  toJSON() {
    return {
      enforcement_error: true,
      stage: this.stage,
      stage_name: this.stage_name,
      halted_at: this.halted_at,
      error_count: this.error_count,
      warn_count: this.warn_count,
      violations: this.violations,
      summary: this.summary,
      suggested_fix: this.suggested_fix,
    };
  }
}

// ─────────────────────────────────────────────
// Main enforce() method
// ─────────────────────────────────────────────

/**
 * Enforce the contract on a stage output.
 * Runs all 3 validation levels + auto-fixer.
 *
 * @param {number} stageId - Stage number (1-4)
 * @param {object} stageOutput - The raw output from the stage's LLM call
 * @param {object} allPriorOutputs - { stageNum: output, ... } for cross-layer validation
 * @returns {object} EnforcementResult
 * @throws {EnforcementError} If any ERROR-severity violations remain after auto-fixing
 */
export function enforce(stageId, stageOutput, allPriorOutputs = {}) {
  const contract = getContract(stageId);
  const stageName = STAGE_NAMES[stageId] || `Stage ${stageId}`;

  console.log(`[Enforcer] Stage ${stageId} (${stageName}) — starting enforcement`);

  // ── Step 1: JSON parse validation ──
  const jsonResult = validateJSON(stageOutput, stageId);
  if (!jsonResult.ok) {
    throw new EnforcementError({
      stage: stageId,
      stageName,
      haltedAt: 'structural',
      violations: [jsonResult.violation],
      warnCount: 0,
    });
  }

  let parsed = jsonResult.data;

  // ── Step 2: Structural validation (Level 1) ──
  const structResult = validateStructure(stageId, parsed, contract);
  console.log(`[Enforcer] Stage ${stageId} — structural: ${structResult.violations.length} violations`);

  // ── Step 3: Semantic validation (Level 2) ──
  // Only run if structural passed or has only fixable issues
  const structErrors = structResult.violations.filter(v => v.severity === 'ERROR' && !v.auto_fixable);
  let semResult = { valid: true, violations: [] };

  if (structErrors.length === 0) {
    semResult = validateSemantics(stageId, parsed, contract);
    console.log(`[Enforcer] Stage ${stageId} — semantic: ${semResult.violations.length} violations`);
  }

  // ── Step 4: Cross-layer validation (Level 3, stages 2+ only) ──
  let crossResult = { valid: true, violations: [] };
  if (stageId > 1 && structErrors.length === 0) {
    const allOutputs = { ...allPriorOutputs, [stageId]: parsed };
    crossResult = validateCrossLayer(stageId, allOutputs);
    console.log(`[Enforcer] Stage ${stageId} — cross-layer: ${crossResult.violations.length} violations`);
  }

  // ── Step 5: Collect all violations ──
  const allViolations = [
    ...structResult.violations,
    ...semResult.violations,
    ...crossResult.violations,
  ];

  // ── Step 6: Auto-fix what we can ──
  const { output, fixLog, unfixed } = applyAll(allViolations, parsed);

  if (fixLog.length > 0) {
    console.log(`[Enforcer] Stage ${stageId} — auto-fixed ${fixLog.length} violations:`);
    for (const fix of fixLog) {
      console.log(`  ✓ [${fix.rule_id}] ${fix.fix_applied}`);
    }
  }

  // ── Step 7: Check remaining violations ──
  const hardErrors = unfixed.filter(v => v.severity === 'ERROR');
  const warnings = unfixed.filter(v => v.severity === 'WARN');
  const infos = unfixed.filter(v => v.severity === 'INFO');

  if (warnings.length > 0) {
    console.warn(`[Enforcer] Stage ${stageId} — ${warnings.length} warning(s) remaining:`);
    for (const w of warnings) {
      console.warn(`  ⚠ [${w.rule_id}] ${w.message}`);
    }
  }

  // ── Step 8: Halt on ERROR ──
  if (hardErrors.length > 0) {
    // Determine which validation level caused the halt
    let haltedAt = 'structural';
    if (hardErrors.some(v => v.level === 'cross_layer')) haltedAt = 'cross_layer';
    else if (hardErrors.some(v => v.level === 'semantic')) haltedAt = 'semantic';

    console.error(`[Enforcer] Stage ${stageId} — HALT: ${hardErrors.length} unfixable ERROR(s)`);
    for (const err of hardErrors) {
      console.error(`  ✗ [${err.rule_id}] ${err.message}`);
    }

    throw new EnforcementError({
      stage: stageId,
      stageName,
      haltedAt,
      violations: hardErrors,
      warnCount: warnings.length,
    });
  }

  // ── Step 9: Return successful result ──
  const result = {
    enforcement_result: true,
    stage: stageId,
    passed: true,
    violations_found: allViolations.length,
    violations_fixed: fixLog.length,
    warnings_remaining: warnings.length,
    output,
    fix_log: fixLog,
    warnings,
    validation_summary: `Stage ${stageId} (${stageName}): ${allViolations.length} total violations found, ${fixLog.length} auto-fixed, ${warnings.length} warnings remaining. PASSED.`,
  };

  console.log(`[Enforcer] Stage ${stageId} — PASSED ✓ (${fixLog.length} fixes, ${warnings.length} warns)`);

  return result;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildSummary(stage, stageName, haltedAt, violations) {
  const errorCount = violations.filter(v => v.severity === 'ERROR').length;
  const ruleIds = [...new Set(violations.map(v => v.rule_id))].join(', ');

  return `Stage ${stage} (${stageName}) enforcement HALTED at ${haltedAt} level. ` +
    `${errorCount} ERROR(s) found. Rules violated: ${ruleIds}. ` +
    `These violations cannot be auto-fixed and require the LLM to produce corrected output.`;
}

function buildSuggestedFix(violations) {
  const suggestions = violations
    .filter(v => v.fix_suggestion)
    .map(v => `[${v.rule_id}] ${v.fix_suggestion}`)
    .slice(0, 5);

  if (suggestions.length === 0) {
    return 'Review the violated rules and ensure the LLM prompt produces output that satisfies all contract requirements.';
  }

  return suggestions.join('; ');
}
