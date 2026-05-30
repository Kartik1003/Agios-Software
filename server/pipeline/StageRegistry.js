// server/pipeline/StageRegistry.js
// Registry pattern — holds handler for each stage, individually testable

import { stageInfo as stage1 } from '../stages/IntentExtractor.js';
import { stageInfo as stage2 } from '../stages/SystemDesigner.js';
import { stageInfo as stage3 } from '../stages/SchemaGenerator.js';
import { stageInfo as stage4 } from '../stages/RefinementEngine.js';
import { stageInfo as stage5 } from '../stages/RuntimeGenerator.js';

const stages = new Map();

/**
 * Register all pipeline stages
 */
export function registerAllStages() {
  stages.set(1, stage1);
  stages.set(2, stage2);
  stages.set(3, stage3);
  stages.set(4, stage4);
  stages.set(5, stage5);
  console.log(`[StageRegistry] Registered ${stages.size} stages`);
}

/**
 * Get a stage by number
 * @param {number} stageNumber
 * @returns {{ number: number, name: string, execute: Function }}
 */
export function getStage(stageNumber) {
  const stage = stages.get(stageNumber);
  if (!stage) {
    throw new Error(`Stage ${stageNumber} is not registered`);
  }
  return stage;
}

/**
 * Get all registered stage numbers
 */
export function getStageNumbers() {
  return [...stages.keys()].sort((a, b) => a - b);
}

/**
 * Check if a stage is registered
 */
export function hasStage(stageNumber) {
  return stages.has(stageNumber);
}

/**
 * Get count of registered stages
 */
export function getStageCount() {
  return stages.size;
}
