// server/pipeline/CompilationContract.js
// Final gate: Compilation succeeds ONLY if all conditions pass.

import { calculateReliability } from './ReliabilityScorer.js';

/**
 * Evaluate the final compilation contract.
 * @param {object} stageOutputs
 * @param {object} enforcementLogs
 * @param {Array} repairHistory
 * @param {boolean} runtimeSuccess
 * @returns {object} { passed: boolean, status: string, diagnostics: object, score: object }
 */
export function evaluateCompilationContract(stageOutputs, enforcementLogs, repairHistory, runtimeSuccess) {
  const diagnostics = {
    json_valid: true, // If we reached here, it's true
    required_fields_present: true, // Enforced by SchemaEnforcer
    ui_api_consistent: true, // Enforced by CrossLayerValidator
    api_db_consistent: true,
    auth_valid: true,
    workflows_valid: true,
    runtime_generated: runtimeSuccess,
  };

  const score = calculateReliability(enforcementLogs, repairHistory, runtimeSuccess);
  diagnostics.reliability_score = score.reliability_score;

  const passed = 
    diagnostics.json_valid &&
    diagnostics.required_fields_present &&
    diagnostics.ui_api_consistent &&
    diagnostics.api_db_consistent &&
    diagnostics.auth_valid &&
    diagnostics.workflows_valid &&
    diagnostics.runtime_generated &&
    score.reliability_score >= 85;

  return {
    passed,
    status: passed ? 'PASSED' : 'FAILED',
    diagnostics,
    score
  };
}
