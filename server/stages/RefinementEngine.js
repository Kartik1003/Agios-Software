// server/stages/RefinementEngine.js
// Stage 4 — Refinement Layer (Optimizer + Validator)
// Pure LLM caller — validation is handled by SchemaEnforcer in PipelineRunner.

import { callLLM } from '../llm/client.js';
import { getStage4Prompt } from '../prompts/stage4.prompt.js';
import { buildContext } from '../pipeline/ContextBuilder.js';
import { createParseError, createContractViolation } from '../pipeline/ErrorHandler.js';
import { shouldUseDeterministicCompiler, compileStage } from '../pipeline/DeterministicCompiler.js';

const STAGE_NUMBER = 4;
const STAGE_NAME = 'Refinement Layer';

/**
 * Execute Stage 4: Cross-validate, refine, and emit final spec
 *
 * @param {string} rawInput - Original NL input
 * @param {object} stageOutputs - { 1: Stage1Output, 2: Stage2Output, 3: Stage3Output }
 * @returns {Promise<{ success: boolean, data?: object, error?: object }>}
 */
export async function execute(rawInput, stageOutputs) {
  try {
    if (!stageOutputs[1] || !stageOutputs[2] || !stageOutputs[3]) {
      return {
        success: false,
        error: createContractViolation(
          STAGE_NUMBER,
          STAGE_NAME,
          'All prior stage outputs (1, 2, 3) are required but one or more are missing.'
        ),
      };
    }

    if (shouldUseDeterministicCompiler()) {
      return { success: true, data: compileStage(STAGE_NUMBER, rawInput, stageOutputs) };
    }

    const context = buildContext(STAGE_NUMBER, rawInput, stageOutputs);
    const systemPrompt = getStage4Prompt();

    const data = await callLLM(systemPrompt, context, {
      temperature: 0.2,  // Lower temperature for validation/refinement
      maxTokens: 16384,
    });

    // Return raw data — enforcement layer handles validation
    return { success: true, data };

  } catch (err) {
    return {
      success: false,
      error: createParseError(STAGE_NUMBER, STAGE_NAME, err.message),
    };
  }
}

export const stageInfo = {
  number: STAGE_NUMBER,
  name: STAGE_NAME,
  execute,
};
