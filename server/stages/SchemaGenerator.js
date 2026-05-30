// server/stages/SchemaGenerator.js
// Stage 3 — Schema Generation (Code-Gen Back-End)
// Pure LLM caller — validation is handled by SchemaEnforcer in PipelineRunner.

import { callLLM } from '../llm/client.js';
import { getStage3Prompt } from '../prompts/stage3.prompt.js';
import { buildContext } from '../pipeline/ContextBuilder.js';
import { createParseError, createContractViolation } from '../pipeline/ErrorHandler.js';
import { shouldUseDeterministicCompiler, compileStage } from '../pipeline/DeterministicCompiler.js';

const STAGE_NUMBER = 3;
const STAGE_NAME = 'Schema Generation';

/**
 * Execute Stage 3: Generate 4 config schemas
 *
 * @param {string} rawInput - Original NL input
 * @param {object} stageOutputs - { 1: Stage1Output, 2: Stage2Output }
 * @returns {Promise<{ success: boolean, data?: object, error?: object }>}
 */
export async function execute(rawInput, stageOutputs) {
  try {
    if (!stageOutputs[1] || !stageOutputs[2]) {
      return {
        success: false,
        error: createContractViolation(
          STAGE_NUMBER,
          STAGE_NAME,
          'Stage 1 and Stage 2 outputs are required but missing.'
        ),
      };
    }

    if (shouldUseDeterministicCompiler()) {
      return { success: true, data: compileStage(STAGE_NUMBER, rawInput, stageOutputs) };
    }

    const context = buildContext(STAGE_NUMBER, rawInput, stageOutputs);
    const systemPrompt = getStage3Prompt();

    const data = await callLLM(systemPrompt, context, {
      temperature: 0.3,
      maxTokens: 16384,  // Stage 3 produces large output
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
