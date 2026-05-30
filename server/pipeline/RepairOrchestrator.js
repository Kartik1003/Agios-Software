// server/pipeline/RepairOrchestrator.js
// Intelligent repair system that routes violations to either AutoFixer (minor)
// or SectionRegenerator (structural/complex).

import { applyAll } from '../enforcement/AutoFixer.js';
import { enforce, EnforcementError } from '../enforcement/SchemaEnforcer.js';
import { callLLM } from '../llm/client.js';

// Retry limits per section
const MAX_RETRIES = 3;
const repairState = new Map(); // sessionId -> { stageId -> { componentName -> retries } }

export async function repair(sessionId, stageId, output, violations, allPriorOutputs, auditTrail) {
  // 1. Classify failure
  const { minor, structural } = classifyFailure(violations);
  
  if (structural.length === 0 && minor.length > 0) {
    // Only minor fixes, just use auto-fixer (should already be done by Enforcer, but just in case)
    return { success: false, output, error: new Error('Unfixable minor errors remaining') };
  }

  // 2. We have structural errors. Identify the failing components
  const failedComponents = identifyFailedComponents(structural, stageId);
  
  let currentOutput = JSON.parse(JSON.stringify(output));
  let finalFixLog = [];

  for (const component of failedComponents) {
    const retries = getRetryCount(sessionId, stageId, component);
    if (retries >= MAX_RETRIES) {
      const msg = `Max retries (${MAX_RETRIES}) reached for component ${component}`;
      auditTrail.recordRepair(stageId, {
        failure_reason: 'Max retries exceeded',
        failed_component: component,
        repair_attempts: retries,
        repair_result: 'failed'
      });
      return { success: false, output: currentOutput, error: new Error(msg) };
    }

    incrementRetryCount(sessionId, stageId, component);
    const attempt = retries + 1;

    console.log(`[RepairOrchestrator] Regenerating ${component} (Attempt ${attempt}/${MAX_RETRIES})...`);
    
    // Component-specific violations
    const compViolations = structural.filter(v => 
      v.field_path === component || v.field_path?.startsWith(`${component}.`) || v.field_path === '_root'
    );
    
    if (compViolations.length === 0 && component !== '_root') {
        compViolations.push(...structural);
    }

    try {
      // LLM call to regenerate just this section
      const regenerated = await regenerateSection(stageId, component, currentOutput, compViolations, allPriorOutputs);
      
      // Merge back
      if (component === '_root') {
          currentOutput = regenerated;
      } else {
          currentOutput[component] = regenerated;
      }

      auditTrail.recordRepair(stageId, {
        failure_reason: compViolations.map(v => v.message).join('; '),
        failed_component: component,
        repair_attempts: attempt,
        repair_result: 'partial'
      });
      
    } catch (err) {
      console.error(`[RepairOrchestrator] LLM regeneration failed for ${component}:`, err);
    }
  }

  // 3. Re-validate the newly merged output
  try {
    const enforcementResult = enforce(stageId, currentOutput, allPriorOutputs);
    auditTrail.recordRepair(stageId, {
      failure_reason: 'Validation after repair',
      failed_component: 'all',
      repair_attempts: 1,
      repair_result: 'success'
    });
    return { success: true, enforcementResult };
  } catch (err) {
    if (err instanceof EnforcementError) {
      return { success: false, output: currentOutput, error: err, remainingViolations: err.violations };
    }
    return { success: false, output: currentOutput, error: err };
  }
}

function classifyFailure(violations) {
  const minor = [];
  const structural = [];

  for (const v of violations) {
    if (v.auto_fixable) {
      minor.push(v);
    } else {
      structural.push(v);
    }
  }
  return { minor, structural };
}

function identifyFailedComponents(structuralViolations, stageId) {
  const components = new Set();
  for (const v of structuralViolations) {
    if (!v.field_path) continue;
    
    if (v.field_path === '_root') {
      components.add('_root');
      continue;
    }

    const firstPart = v.field_path.split('.')[0].replace(/\[.*?\]/, '');
    
    // Top level keys that are modular
    const validKeys = [
      'ui_config', 'api_config', 'db_schema', 'auth_rules', 
      'entities', 'user_flows', 'roles', 'modules'
    ];
    
    if (validKeys.includes(firstPart)) {
      components.add(firstPart);
    } else {
      // Fallback
      components.add('_root');
    }
  }
  return [...components];
}

// Session state management for retries
function getRetryCount(sessionId, stageId, component) {
  if (!repairState.has(sessionId)) repairState.set(sessionId, {});
  const s = repairState.get(sessionId);
  if (!s[stageId]) s[stageId] = {};
  return s[stageId][component] || 0;
}

function incrementRetryCount(sessionId, stageId, component) {
  const s = repairState.get(sessionId);
  s[stageId][component] = (s[stageId][component] || 0) + 1;
}

// ─────────────────────────────────────────────
// LLM Regeneration
// ─────────────────────────────────────────────

async function regenerateSection(stageId, component, originalOutput, violations, allPriorOutputs) {
  const systemPrompt = `You are an expert software architect fixing a specific validation failure in a compiler pipeline.
You must ONLY regenerate the specific JSON component requested. Do not output the entire schema.

Component to regenerate: "${component}"

The previous version failed these validation rules:
${violations.map(v => `- [${v.rule_id}] ${v.message} (Suggestion: ${v.fix_suggestion})`).join('\n')}

Original full output for context (DO NOT RETURN THIS, only return the requested component):
\`\`\`json
${JSON.stringify(originalOutput, null, 2)}
\`\`\`

Return the completely fixed JSON for "${component}". Your output must be a valid JSON object or array that replaces the original value of "${component}".`;

  const userPrompt = `Regenerate the "${component}" section to fix the validation errors. Return ONLY the JSON for this component.`;

  const response = await callLLM(systemPrompt, userPrompt, {
    temperature: 0.1,
    maxTokens: 8192
  });

  return response;
}
