// server/stages/SystemDesigner.js
// Stage 2 — System Design (Architecture Layer)
// Pure LLM caller — validation is handled by SchemaEnforcer in PipelineRunner.

import { callLLM } from '../llm/client.js';
import { getStage2Prompt } from '../prompts/stage2.prompt.js';
import { buildContext } from '../pipeline/ContextBuilder.js';
import { createParseError, createContractViolation } from '../pipeline/ErrorHandler.js';
import { shouldUseDeterministicCompiler, compileStage } from '../pipeline/DeterministicCompiler.js';

const STAGE_NUMBER = 2;
const STAGE_NAME = 'System Design';

/**
 * Execute Stage 2: Convert Stage 1 IR into full architecture
 *
 * @param {string} rawInput - Original NL input
 * @param {object} stageOutputs - { 1: Stage1Output }
 * @returns {Promise<{ success: boolean, data?: object, error?: object }>}
 */
export async function execute(rawInput, stageOutputs) {
  try {
    if (!stageOutputs[1]) {
      return {
        success: false,
        error: createContractViolation(STAGE_NUMBER, STAGE_NAME, 'Stage 1 output is required but missing.'),
      };
    }

    if (shouldUseDeterministicCompiler()) {
      return { success: true, data: compileStage(STAGE_NUMBER, rawInput, stageOutputs) };
    }

    const context = buildContext(STAGE_NUMBER, rawInput, stageOutputs);
    const systemPrompt = getStage2Prompt();

    const data = await callLLM(systemPrompt, context, {
      temperature: 0.3,
      maxTokens: 8192,
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
