// server/pipeline/ErrorHandler.js
// Formats structured error objects per the Agios error contract

/**
 * Create a structured stage error
 * @param {number} stage - Stage number (1-4)
 * @param {string} stageName - Human readable stage name
 * @param {string} errorType - validation_failure | parse_error | contract_violation | dependency_error
 * @param {string} message - Human readable error message
 * @param {string|null} field - JSON path to the offending field
 * @param {string[]|null} unresolved - Items that could not be resolved
 * @param {string|null} suggestion - How to fix the input
 * @returns {object} Structured error object
 */
export function createStageError(stage, stageName, errorType, message, field = null, unresolved = [], suggestion = null) {
  return {
    compiler_error: true,
    stage,
    stage_name: stageName,
    error_type: errorType,
    message,
    field,
    unresolved: unresolved || [],
    suggestion,
  };
}

/**
 * Create a validation failure error for a specific stage
 */
export function createValidationError(stage, stageName, field, message, suggestion = null) {
  return createStageError(stage, stageName, 'validation_failure', message, field, [], suggestion);
}

/**
 * Create a contract violation error
 */
export function createContractViolation(stage, stageName, message, unresolved = []) {
  return createStageError(stage, stageName, 'contract_violation', message, null, unresolved);
}

/**
 * Create a parse error (LLM returned non-JSON or malformed data)
 */
export function createParseError(stage, stageName, message) {
  return createStageError(
    stage,
    stageName,
    'parse_error',
    message,
    null,
    [],
    'Ensure the input is clear and descriptive enough for the AI to parse.'
  );
}

/**
 * Create a dependency error (prior stage data is missing or invalid)
 */
export function createDependencyError(stage, stageName, message, unresolved = []) {
  return createStageError(stage, stageName, 'dependency_error', message, null, unresolved);
}

/**
 * Check if an object is a compiler error
 */
export function isCompilerError(obj) {
  return obj && obj.compiler_error === true;
}
