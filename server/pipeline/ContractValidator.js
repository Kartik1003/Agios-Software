// server/pipeline/ContractValidator.js
// LEGACY WRAPPER — delegates all validation to the enforcement layer.
// Kept for backward compatibility with any code that imports from this file.
// New code should import from server/enforcement/SchemaEnforcer.js directly.

import { enforce, EnforcementError } from '../enforcement/SchemaEnforcer.js';

/**
 * Validate a stage's output against its contract.
 * This is a backward-compatible wrapper around the new enforcement layer.
 *
 * @param {number} stageNumber - Stage number (1-4)
 * @param {object} data - The stage output to validate
 * @param {object} context - Prior stage outputs for cross-validation
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateStageOutput(stageNumber, data, context = {}) {
  // Convert context format: { stage1: ..., stage2: ... } → { 1: ..., 2: ... }
  const allPriorOutputs = {};
  if (context.stage1) allPriorOutputs[1] = context.stage1;
  if (context.stage2) allPriorOutputs[2] = context.stage2;
  if (context.stage3) allPriorOutputs[3] = context.stage3;

  try {
    const result = enforce(stageNumber, data, allPriorOutputs);
    
    // Convert warnings to the old error format
    const errors = (result.warnings || []).map(w => ({
      field: w.field_path,
      message: w.message,
    }));

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (err) {
    if (err instanceof EnforcementError) {
      const errors = err.violations.map(v => ({
        field: v.field_path,
        message: v.message,
        unresolved: v.received !== 'NOT_FOUND' ? undefined : v.expected,
      }));

      return {
        valid: false,
        errors,
      };
    }

    return {
      valid: false,
      errors: [{ field: '_enforcement', message: err.message }],
    };
  }
}
