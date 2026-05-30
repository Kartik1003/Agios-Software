// server/pipeline/CompilerAuditService.js
// Full traceability for every pipeline stage.
// Records input, output, validation results, repair actions, and timestamps.
// Generates audit.json for every compiled application.

import { saveArtifact } from '../data/PersistentSessionStore.js';

/**
 * CompilerAuditTrail — accumulates audit records for a single pipeline run
 */
export class CompilerAuditTrail {
  constructor(sessionId, rawInput) {
    this.sessionId = sessionId;
    this.rawInput = rawInput;
    this.startedAt = new Date().toISOString();
    this.stages = {};
    this.repairs = [];
    this.compilationResult = null;
    this.reliabilityScore = null;
  }

  /**
   * Record the input for a stage
   */
  recordStageInput(stageNumber, stageName, input) {
    if (!this.stages[stageNumber]) {
      this.stages[stageNumber] = {
        stage: stageNumber,
        name: stageName,
        startedAt: new Date().toISOString(),
        input: summarizeInput(input),
        output: null,
        validation_result: null,
        repair_actions: [],
        completedAt: null,
        elapsed_ms: null,
      };
    } else {
      this.stages[stageNumber].input = summarizeInput(input);
    }
  }

  /**
   * Record the output + enforcement result for a stage
   */
  recordStageOutput(stageNumber, stageName, output, enforcementLog, elapsed) {
    if (!this.stages[stageNumber]) {
      this.stages[stageNumber] = {
        stage: stageNumber,
        name: stageName,
        startedAt: new Date().toISOString(),
        input: null,
        output: null,
        validation_result: null,
        repair_actions: [],
        completedAt: null,
        elapsed_ms: null,
      };
    }

    const entry = this.stages[stageNumber];
    entry.output = summarizeOutput(output);
    entry.validation_result = enforcementLog || { passed: true };
    entry.completedAt = new Date().toISOString();
    entry.elapsed_ms = elapsed;
  }

  /**
   * Record a repair action
   */
  recordRepair(stageNumber, repair) {
    const record = {
      stage: stageNumber,
      timestamp: new Date().toISOString(),
      ...repair,
    };
    this.repairs.push(record);

    if (this.stages[stageNumber]) {
      this.stages[stageNumber].repair_actions.push(record);
    }
  }

  /**
   * Record the final compilation result
   */
  recordCompilationResult(result) {
    this.compilationResult = result;
  }

  /**
   * Record the reliability score
   */
  recordReliabilityScore(score) {
    this.reliabilityScore = score;
  }

  /**
   * Generate the full audit report
   */
  generateAuditReport() {
    return {
      session_id: this.sessionId,
      pipeline_version: '2.0.0',
      raw_input: this.rawInput.substring(0, 500),
      started_at: this.startedAt,
      completed_at: new Date().toISOString(),
      stages: Object.values(this.stages).sort((a, b) => a.stage - b.stage),
      total_repairs: this.repairs.length,
      repairs: this.repairs,
      compilation_result: this.compilationResult,
      reliability_score: this.reliabilityScore,
    };
  }

  /**
   * Save audit.json to the generated-apps directory
   */
  async saveAuditFile() {
    const report = this.generateAuditReport();
    await saveArtifact(this.sessionId, 'audit.json', JSON.stringify(report, null, 2));
    return report;
  }
}

// ─────────────────────────────────────────────
// Helpers — summarize large objects to keep audit.json manageable
// ─────────────────────────────────────────────

function summarizeInput(input) {
  if (typeof input === 'string') {
    return input.length > 500 ? input.substring(0, 500) + '...' : input;
  }
  if (typeof input === 'object' && input !== null) {
    const keys = Object.keys(input);
    return { _keys: keys, _count: keys.length };
  }
  return input;
}

function summarizeOutput(output) {
  if (typeof output !== 'object' || output === null) return output;

  const summary = {};
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value)) {
      summary[key] = { _type: 'array', _count: value.length };
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = { _type: 'object', _keys: Object.keys(value) };
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
