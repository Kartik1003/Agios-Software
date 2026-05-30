// server/evaluation/evaluate.js
// Runs the compiler over the required evaluation dataset and prints metrics.

import { initStore } from '../data/PersistentSessionStore.js';
import { registerAllStages } from '../pipeline/StageRegistry.js';
import { runPipeline } from '../pipeline/PipelineRunner.js';
import { evaluationPrompts } from './prompts.js';

process.env.AGIOS_LOCAL_MODE = process.env.AGIOS_LOCAL_MODE || 'true';

await initStore();
registerAllStages();

const results = [];

for (const [index, item] of evaluationPrompts.entries()) {
  const sessionId = `eval-${Date.now()}-${index + 1}`;
  const runStarted = Date.now();
  const result = await runPipeline(sessionId, item.prompt);
  const latencyMs = Date.now() - runStarted;
  const repairs = Object.values(result.enforcementLogs || {})
    .reduce((sum, log) => sum + (log.violations_fixed || 0), 0);

  results.push({
    id: index + 1,
    type: item.type,
    prompt: item.prompt,
    success: result.success,
    latency_ms: latencyMs,
    reliability_score: result.reliabilityScore || 0,
    repairs,
    failure_type: result.success ? null : (result.failedStage || result.error?.message || 'unknown'),
  });
}

const successes = results.filter(r => r.success).length;
const failures = results.filter(r => !r.success);
const totalLatency = results.reduce((sum, r) => sum + r.latency_ms, 0);
const totalRepairs = results.reduce((sum, r) => sum + r.repairs, 0);
const avgReliability = Math.round(results.reduce((sum, r) => sum + r.reliability_score, 0) / results.length);
const failureTypes = failures.reduce((acc, r) => {
  acc[r.failure_type] = (acc[r.failure_type] || 0) + 1;
  return acc;
}, {});

const summary = {
  total_prompts: results.length,
  product_prompts: results.filter(r => r.type === 'product').length,
  edge_case_prompts: results.filter(r => r.type === 'edge').length,
  success_rate: `${Math.round((successes / results.length) * 100)}%`,
  successes,
  failures: failures.length,
  average_latency_ms: Math.round(totalLatency / results.length),
  total_latency_ms: totalLatency,
  average_repairs_per_request: Number((totalRepairs / results.length).toFixed(2)),
  average_reliability_score: avgReliability,
  failure_types: failureTypes,
  cost_quality_tradeoff: {
    local_mode: 'Uses deterministic compiler when keys are absent: near-zero token cost and stable latency.',
    llm_mode: 'Provider cascade can improve semantic richness at higher latency/cost; enforcement and targeted repair avoid blind full retries.',
  },
};

console.log(JSON.stringify({ summary, results }, null, 2));
