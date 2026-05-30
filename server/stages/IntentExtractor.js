// server/stages/IntentExtractor.js
// Stage 1 — Intent Extraction (Front-End Parser)
// Pure LLM caller — validation is handled by SchemaEnforcer in PipelineRunner.

import { callLLM } from '../llm/client.js';
import { getStage1Prompt } from '../prompts/stage1.prompt.js';
import { createParseError } from '../pipeline/ErrorHandler.js';
import { shouldUseDeterministicCompiler, compileStage } from '../pipeline/DeterministicCompiler.js';

const STAGE_NUMBER = 1;
const STAGE_NAME = 'Intent Extraction';

/**
 * Execute Stage 1: Parse raw NL input into typed IR
 *
 * @param {string} rawInput - The raw natural language input
 * @returns {Promise<{ success: boolean, data?: object, error?: object }>}
 */
export async function execute(rawInput) {
  try {
    if (shouldUseDeterministicCompiler()) {
      return { success: true, data: compileStage(STAGE_NUMBER, rawInput) };
    }

    // Call LLM with stage-specific prompt
    const systemPrompt = getStage1Prompt();
    const data = await callLLM(systemPrompt, rawInput, {
      temperature: 0.3,
      maxTokens: 4096,
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
