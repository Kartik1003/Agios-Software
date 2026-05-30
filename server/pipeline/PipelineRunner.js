// server/pipeline/PipelineRunner.js
// Orchestrates sequential stage execution (1→2→3→4)
// with SchemaEnforcer wrapping every stage call.

import { getStage, getStageNumbers } from './StageRegistry.js';
import { enforce, EnforcementError } from '../enforcement/SchemaEnforcer.js';
import { repair } from './RepairOrchestrator.js';
import { evaluateCompilationContract } from './CompilationContract.js';
import { EventEmitter } from 'events';

/**
 * Run the full pipeline sequentially.
 * Each stage result is enforced through the SchemaEnforcer before proceeding.
 * Emits events for real-time progress tracking.
 *
 * @param {string} sessionId
 * @param {string} rawInput
 * @param {EventEmitter} [emitter]
 * @returns {Promise<{ success: boolean, stages: object, finalOutput?: object, error?: object }>}
 */
export async function runPipeline(sessionId, rawInput, emitter = null) {
  const stageNumbers = getStageNumbers();
  const stageOutputs = {};
  const stageTimings = {};
  const enforcementLogs = {};
  const repairHistory = [];

  const emit = (event, data) => {
    if (emitter) {
      emitter.emit(event, data);
    }
  };

  emit('pipeline:start', { totalStages: stageNumbers.length, rawInput });

  for (const stageNum of stageNumbers) {
    const stage = getStage(stageNum);
    const startTime = Date.now();

    emit('stage:start', {
      stage: stageNum,
      name: stage.name,
    });

    // ── Step 1: Execute the stage (pure LLM call) ──
    let result;
    try {
      if (stageNum === 1) {
        result = await stage.execute(rawInput, null, sessionId);
      } else {
        result = await stage.execute(rawInput, stageOutputs, sessionId);
      }
    } catch (err) {
      result = {
        success: false,
        error: {
          compiler_error: true,
          stage: stageNum,
          stage_name: stage.name,
          error_type: 'parse_error',
          message: err.message,
          field: null,
          unresolved: [],
          suggestion: 'An unexpected error occurred. Check your input and try again.',
        },
      };
    }

    // If LLM call itself failed, halt
    if (!result.success) {
      const elapsed = Date.now() - startTime;
      stageTimings[stageNum] = elapsed;

      emit('stage:error', {
        stage: stageNum,
        name: stage.name,
        error: result.error,
        elapsed,
      });

      emit('pipeline:error', {
        stage: stageNum,
        error: result.error,
      });

      return {
        success: false,
        stages: stageOutputs,
        timings: stageTimings,
        enforcementLogs,
        failedStage: stageNum,
        error: result.error,
        allErrors: result.allErrors || [],
      };
    }

    // ── Step 2: Enforce the contract on the LLM output ──
    if (stageNum === 5) {
      // Stage 5 is Runtime Generation, it does not have a schema contract
      stageOutputs[stageNum] = result.data;
      const elapsed = Date.now() - startTime;
      stageTimings[stageNum] = elapsed;
      emit('stage:complete', {
        stage: stageNum,
        name: stage.name,
        elapsed,
        data: result.data,
      });
      continue;
    }

    try {
      const enforcementResult = enforce(stageNum, result.data, stageOutputs);

      // Use the enforcer's output (possibly auto-fixed)
      stageOutputs[stageNum] = enforcementResult.output;
      enforcementLogs[stageNum] = {
        violations_found: enforcementResult.violations_found,
        violations_fixed: enforcementResult.violations_fixed,
        warnings_remaining: enforcementResult.warnings_remaining,
        fix_log: enforcementResult.fix_log,
        warnings: enforcementResult.warnings,
        summary: enforcementResult.validation_summary,
      };

      const elapsed = Date.now() - startTime;
      stageTimings[stageNum] = elapsed;

      emit('stage:enforced', {
        stage: stageNum,
        name: stage.name,
        enforcement: enforcementLogs[stageNum],
      });

      emit('stage:complete', {
        stage: stageNum,
        name: stage.name,
        elapsed,
        data: enforcementResult.output,
      });

    } catch (err) {
      const elapsed = Date.now() - startTime;
      stageTimings[stageNum] = elapsed;

      if (err instanceof EnforcementError) {
        // Try to repair structural errors
        emit('stage:repair_start', { stage: stageNum, name: stage.name });
        
        // Note: We need a mock auditTrail here or pass the real one. 
        // For now, we'll use a mock that emits events which compile.js can catch.
        const auditTrailProxy = {
           recordRepair: (stage, record) => {
             repairHistory.push(record);
             emit('stage:repair_record', { stage, record });
           }
        };
        
        const repairResult = await repair(sessionId, stageNum, result.data, err.violations, stageOutputs, auditTrailProxy);
        
        if (repairResult.success) {
           // Repair worked!
           emit('stage:repair_success', { stage: stageNum, name: stage.name });
           
           // Use the newly enforced output
           stageOutputs[stageNum] = repairResult.enforcementResult.output;
           enforcementLogs[stageNum] = {
             violations_found: repairResult.enforcementResult.violations_found,
             violations_fixed: repairResult.enforcementResult.violations_fixed,
             warnings_remaining: repairResult.enforcementResult.warnings_remaining,
             fix_log: repairResult.enforcementResult.fix_log,
             warnings: repairResult.enforcementResult.warnings,
             summary: repairResult.enforcementResult.validation_summary,
           };
           continue; // Proceed to next stage
        }
        
        // If repair failed, structured halt
        const enforcementError = err.toJSON();

        emit('stage:enforcement_error', {
          stage: stageNum,
          name: stage.name,
          enforcement: enforcementError,
          elapsed,
        });

        emit('stage:error', {
          stage: stageNum,
          name: stage.name,
          error: {
            compiler_error: true,
            stage: stageNum,
            stage_name: stage.name,
            error_type: 'enforcement_failure',
            message: enforcementError.summary,
            field: enforcementError.violations[0]?.field_path || null,
            unresolved: enforcementError.violations.map(v => v.message),
            suggestion: enforcementError.suggested_fix,
            enforcement_detail: enforcementError,
          },
          elapsed,
        });

        emit('pipeline:error', {
          stage: stageNum,
          error: enforcementError,
        });

        return {
          success: false,
          stages: stageOutputs,
          timings: stageTimings,
          enforcementLogs,
          failedStage: stageNum,
          error: {
            compiler_error: true,
            stage: stageNum,
            stage_name: stage.name,
            error_type: 'enforcement_failure',
            message: enforcementError.summary,
            halted_at: enforcementError.halted_at,
            violations: enforcementError.violations,
            suggested_fix: enforcementError.suggested_fix,
          },
        };
      }

      // Unknown error during enforcement
      emit('stage:error', {
        stage: stageNum,
        name: stage.name,
        error: {
          compiler_error: true,
          stage: stageNum,
          stage_name: stage.name,
          error_type: 'enforcement_internal_error',
          message: err.message,
          field: null,
          unresolved: [],
          suggestion: 'An internal error occurred during schema enforcement.',
        },
        elapsed,
      });

      emit('pipeline:error', {
        stage: stageNum,
        error: { message: err.message },
      });

      return {
        success: false,
        stages: stageOutputs,
        timings: stageTimings,
        enforcementLogs,
        failedStage: stageNum,
        error: {
          compiler_error: true,
          stage: stageNum,
          stage_name: stage.name,
          error_type: 'enforcement_internal_error',
          message: err.message,
        },
      };
    }
  }

  const contractResult = evaluateCompilationContract(
    stageOutputs,
    enforcementLogs,
    repairHistory,
    stageOutputs[5] ? true : false
  );

  emit('pipeline:complete', {
    stages: stageOutputs,
    timings: stageTimings,
    enforcementLogs,
    contractResult,
  });

  return {
    success: contractResult.passed,
    stages: stageOutputs,
    timings: stageTimings,
    enforcementLogs,
    finalOutput: stageOutputs[4],
    reliabilityScore: contractResult.score.reliability_score,
    error: contractResult.passed ? null : { message: 'Compilation contract failed', diagnostics: contractResult.diagnostics },
    failedStage: contractResult.passed ? null : 'CompilationContract'
  };
}

/**
 * Create an event emitter for pipeline progress tracking
 */
export function createPipelineEmitter() {
  return new EventEmitter();
}
