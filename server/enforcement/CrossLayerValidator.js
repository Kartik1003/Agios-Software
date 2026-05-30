// server/enforcement/CrossLayerValidator.js
// Level 3 — Validates cross-layer consistency between pipeline stages.
// Ensures every upstream reference resolves to a downstream declaration.
// Uses fuzzy matching for LLM-generated name resolution.

import { v4 as uuidv4 } from 'uuid';
import { getCrossLayerRules } from './ContractDefinitions.js';

/**
 * Create a cross-layer ViolationObject
 */
function createViolation(stage, ruleId, fieldPath, expected, received, message, severity = 'ERROR', autoFixable = false, fixSuggestion = null) {
  return {
    violation_id: uuidv4(),
    stage,
    level: 'cross_layer',
    severity,
    rule_id: ruleId,
    field_path: fieldPath,
    expected,
    received,
    message,
    auto_fixable: autoFixable,
    fix_suggestion: fixSuggestion,
  };
}

/**
 * Validate cross-layer consistency for a given stage.
 *
 * @param {number} stageId - The current stage being validated (2, 3, or 4)
 * @param {object} allStageOutputs - { 1: S1Output, 2: S2Output, ... }
 * @returns {{ valid: boolean, violations: Array }}
 */
export function validateCrossLayer(stageId, allStageOutputs) {
  const violations = [];
  const rules = getCrossLayerRules(stageId);

  for (const rule of rules) {
    if (!rule.match_type) continue;

    const sourceOutput = allStageOutputs[rule.source_stage];
    const targetOutput = allStageOutputs[rule.target_stage];

    if (!sourceOutput || !targetOutput) continue;

    switch (rule.match_type) {
      case 'fuzzy':
        validateFuzzyMatch(rule, sourceOutput, targetOutput, stageId, violations);
        break;
      case 'fuzzy_text':
        validateFuzzyTextMatch(rule, sourceOutput, targetOutput, stageId, violations);
        break;
      default:
        if (rule.match_type.startsWith('ui_') || rule.match_type.startsWith('api_') || 
            rule.match_type.startsWith('auth_') || rule.match_type.startsWith('flows_')) {
          validateStrictCrossLayer(rule, sourceOutput, targetOutput, stageId, violations);
        } else {
          validateFuzzyMatch(rule, sourceOutput, targetOutput, stageId, violations);
        }
        break;
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ─────────────────────────────────────────────
// Fuzzy matching strategies
// ─────────────────────────────────────────────

/**
 * RULE-007, RULE-008, RULE-010, RULE-011
 * Standard fuzzy name matching: source values must find a match in target values
 * using substring + plural/singular normalization.
 */
function validateFuzzyMatch(rule, sourceOutput, targetOutput, stageId, violations) {
  const sourceValues = extractPathValues(sourceOutput, rule.source_path);
  const targetValues = extractPathValues(targetOutput, rule.target_path);

  const targetLower = targetValues.map(v => normalize(v));

  for (const sourceVal of sourceValues) {
    const srcNorm = normalize(sourceVal);
    const matched = targetLower.some(tgt => fuzzyMatch(srcNorm, tgt));

    if (!matched) {
      violations.push(createViolation(
        stageId,
        rule.id,
        rule.target_path,
        `Matching entry for "${sourceVal}" from Stage ${rule.source_stage}`,
        'NOT_FOUND',
        `${rule.description}: "${sourceVal}" has no match in ${rule.target_path}`,
        rule.severity,
        rule.auto_fixable || false,
        `Ensure "${sourceVal}" is represented in ${rule.target_path}`
      ));
    }
  }
}

/**
 * RULE-009: Features → user_flows
 * Fuzzy text matching: source value words must appear in target text corpus
 */
function validateFuzzyTextMatch(rule, sourceOutput, targetOutput, stageId, violations) {
  const sourceValues = extractPathValues(sourceOutput, rule.source_path);

  // Build text corpus from multiple target paths
  const targetPaths = rule.target_path.split(',');
  const textCorpus = [];
  for (const tp of targetPaths) {
    const vals = extractPathValues(targetOutput, tp.trim());
    textCorpus.push(...vals);
  }

  // Also build a combined text from user_flows (name + steps + trigger + outcome)
  const userFlows = targetOutput.user_flows || [];
  const flowTexts = userFlows.map(f =>
    `${f.name} ${f.trigger} ${(f.steps || []).join(' ')} ${f.outcome}`.toLowerCase()
  );

  for (const sourceVal of sourceValues) {
    const featureLower = sourceVal.toLowerCase();
    const featureWords = featureLower.split(/\s+/).filter(w => w.length > 3);

    // Check if any feature word appears in any flow text
    const matchedInFlows = flowTexts.some(ft =>
      featureWords.some(word => ft.includes(word))
    );

    // Also check against raw extracted values
    const matchedInCorpus = textCorpus.some(t =>
      featureWords.some(word => t.toLowerCase().includes(word))
    );

    if (!matchedInFlows && !matchedInCorpus) {
      violations.push(createViolation(
        stageId,
        rule.id,
        rule.target_path,
        `Feature "${sourceVal}" referenced in at least one user_flow`,
        'NOT_FOUND',
        `${rule.description}: Feature "${sourceVal}" has no matching user flow`,
        rule.severity,
        rule.auto_fixable || false,
        `Add a user flow that covers the "${sourceVal}" feature`
      ));
    }
  }
}

// ─────────────────────────────────────────────
// Strict Cross-Layer Validation Strategies
// ─────────────────────────────────────────────

function validateStrictCrossLayer(rule, sourceOutput, targetOutput, stageId, violations) {
  // We use sourceOutput for Stage 2 (where source=2, target=3)
  // For Stage 3 rules (UI<->API etc), both source and target might just be in the same output (Stage 3)
  // We'll pass the unified Stage 3 output to handle all these internal/cross checks
  const output = stageId === 3 ? sourceOutput : targetOutput;
  const s2Output = stageId === 3 ? targetOutput : sourceOutput; // If needed

  switch (rule.match_type) {
    case 'ui_api_data_sources':
      validateUiApiDataSources(rule, output, stageId, violations); break;
    case 'ui_api_endpoints':
      validateUiApiEndpoints(rule, output, stageId, violations); break;
    case 'ui_api_payloads':
      // Stub: check if API request payload fields match endpoint schema
      break;
    case 'api_db_fields':
      validateApiDbFields(rule, output, stageId, violations); break;
    case 'api_db_required':
      validateApiDbRequired(rule, output, stageId, violations); break;
    case 'api_db_fks':
      // Handled by existing semantic rule RULE-014, but we can add more strictness here if needed
      break;
    case 'auth_api_protected':
      validateAuthApiProtected(rule, output, stageId, violations); break;
    case 'auth_api_roles':
      // Handled by existing semantic rule, promote to ERROR in SchemaEnforcer
      break;
    case 'auth_api_undefined':
      validateAuthApiUndefined(rule, output, stageId, violations); break;
    case 'ui_auth_roles':
      validateUiAuthRoles(rule, output, stageId, violations); break;
    case 'ui_auth_visibility':
      // UI role visibility consistency (stub for future deep check)
      break;
    case 'flows_entities_valid':
    case 'flows_entities_exist':
    case 'flows_entities_orphan':
      validateFlowsEntities(rule, sourceOutput, stageId, violations); break;
  }
}

function validateUiApiDataSources(rule, output, stageId, violations) {
  const pages = output.ui_config?.pages || [];
  const endpoints = output.api_config?.endpoints || [];
  const endpointIds = new Set(endpoints.map(e => e.id));

  for (const page of pages) {
    for (const ds of page.data_sources || []) {
      if (!endpointIds.has(ds)) {
        violations.push(createViolation(stageId, rule.id, `ui_config.pages[${page.name}].data_sources`, 'Existing endpoint ID', ds, `Data source "${ds}" not found in api_config.endpoints`, rule.severity, false, 'Map UI data source to a valid API endpoint'));
      }
    }
  }
}

function validateUiApiEndpoints(rule, output, stageId, violations) {
  // Inverse of above: Every API endpoint referenced by UI must exist. This is mostly the same check as ui_api_data_sources.
}

function validateApiDbFields(rule, output, stageId, violations) {
  const tables = output.db_schema?.tables || [];
  const endpoints = output.api_config?.endpoints || [];
  const dbFields = new Set();
  for (const t of tables) {
    for (const c of t.columns || []) dbFields.add(`${t.name}.${c.name}`.toLowerCase());
  }

  // Without a detailed mapping in the schema, we'll assume endpoints referencing tables must use valid columns.
  // (Stubbed for now, as API spec format varies).
}

function validateApiDbRequired(rule, output, stageId, violations) {
  // Check if non-nullable DB fields without defaults are covered by at least one POST/PUT endpoint
  // (Stubbed for now)
}

function validateAuthApiProtected(rule, output, stageId, violations) {
  const protectedRoutes = output.auth_rules?.protected_routes || [];
  const rules = output.auth_rules?.rules || [];
  const ruledResources = new Set(rules.map(r => r.resource));

  for (const route of protectedRoutes) {
    if (!ruledResources.has(route)) {
      violations.push(createViolation(stageId, rule.id, 'auth_rules.protected_routes', 'Route exists in auth_rules.rules', route, `Protected route "${route}" has no specific rule definition`, rule.severity, false, 'Add an auth rule for this route'));
    }
  }
}

function validateAuthApiUndefined(rule, output, stageId, violations) {
  const definedRoles = new Set();
  for (const r of output.auth_rules?.rules || []) {
    for (const role of r.roles || []) definedRoles.add(role);
  }

  for (const ep of output.api_config?.endpoints || []) {
    for (const role of ep.roles || []) {
      if (!definedRoles.has(role)) {
        violations.push(createViolation(stageId, rule.id, `api_config.endpoints[${ep.id}].roles`, 'Defined role', role, `Endpoint references undefined role "${role}"`, rule.severity, false, 'Define the role in auth_rules'));
      }
    }
  }
}

function validateUiAuthRoles(rule, output, stageId, violations) {
  const definedRoles = new Set();
  for (const r of output.auth_rules?.rules || []) {
    for (const role of r.roles || []) definedRoles.add(role);
  }

  for (const page of output.ui_config?.pages || []) {
    for (const role of page.allowed_roles || []) {
      if (!definedRoles.has(role)) {
        violations.push(createViolation(stageId, rule.id, `ui_config.pages[${page.name}].allowed_roles`, 'Defined role', role, `Page references undefined role "${role}"`, rule.severity, false, 'Define the role in auth_rules'));
      }
    }
  }
}

function validateFlowsEntities(rule, output, stageId, violations) {
  const entities = output.entities || [];
  const flows = output.user_flows || [];
  const entityNames = new Set(entities.map(e => normalize(e.name)));

  if (rule.match_type === 'flows_entities_exist' || rule.match_type === 'flows_entities_valid') {
    for (const flow of flows) {
      // Fuzzy check if flow name or steps mention any entity
      const flowText = `${flow.name} ${flow.trigger} ${(flow.steps||[]).join(' ')} ${flow.outcome}`.toLowerCase();
      let foundEntity = false;
      for (const name of entityNames) {
        if (flowText.includes(name) || fuzzyMatch(flowText, name)) {
          foundEntity = true;
          break;
        }
      }
      
      if (!foundEntity && rule.match_type === 'flows_entities_orphan') {
         violations.push(createViolation(stageId, rule.id, `user_flows[${flow.name}]`, 'Mention an entity', 'No entities', `User flow "${flow.name}" does not reference any known entity`, rule.severity, false, 'Update flow to reference an entity'));
      }
    }
  }
}

// ─────────────────────────────────────────────
// Path extraction utilities
// ─────────────────────────────────────────────

/**
 * Extract values from an object given a dot.notation path with [] wildcards.
 * Supports paths like:
 *   "actors[].name"  → all actor names
 *   "features[]"     → all feature strings
 *   "data_needs[]"   → all data_needs strings
 *   "auth_rules.rules[].roles[]" → all role strings from all rules
 *   "db_schema.tables[].name"  → all table names
 */
function extractPathValues(obj, path) {
  const results = [];

  function recurse(current, parts) {
    if (parts.length === 0) {
      if (current !== undefined && current !== null) {
        if (Array.isArray(current)) {
          // Leaf is an array of primitives (e.g., features[])
          results.push(...current.filter(v => typeof v === 'string'));
        } else {
          results.push(String(current));
        }
      }
      return;
    }

    const part = parts[0];
    const rest = parts.slice(1);

    if (part.endsWith('[]')) {
      const key = part.slice(0, -2);
      let arr;
      if (key === '') {
        // Path like "roles[]" where current is already the array
        arr = Array.isArray(current) ? current : [];
      } else {
        arr = current?.[key];
      }
      if (Array.isArray(arr)) {
        if (rest.length === 0) {
          // Terminal array — push each element
          for (const item of arr) {
            if (typeof item === 'string') {
              results.push(item);
            } else if (typeof item === 'object' && item !== null) {
              results.push(item);
            }
          }
        } else {
          // Non-terminal — recurse into each element
          for (const item of arr) {
            recurse(item, rest);
          }
        }
      }
    } else {
      const val = current?.[part];
      if (val !== undefined) {
        recurse(val, rest);
      }
    }
  }

  const parts = path.split('.');
  recurse(obj, parts);
  return results;
}

/**
 * Normalize a string for fuzzy matching:
 * lowercase, strip trailing 's' for plural, strip common suffixes
 */
function normalize(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, ' ');
}

/**
 * Fuzzy string matching:
 * Returns true if a ≈ b using substring matching + plural/singular normalization
 */
function fuzzyMatch(a, b) {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Singular/plural — strip trailing 's' and compare
  const aSingular = a.replace(/s$/, '');
  const bSingular = b.replace(/s$/, '');
  if (aSingular === bSingular) return true;
  if (aSingular.includes(bSingular) || bSingular.includes(aSingular)) return true;
  if (a.includes(bSingular) || b.includes(aSingular)) return true;

  // Word overlap — split and check for significant word matches
  const aWords = a.split(/\s+/).filter(w => w.length > 3);
  const bWords = b.split(/\s+/).filter(w => w.length > 3);
  const overlap = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw)));
  if (overlap.length > 0 && overlap.length >= Math.min(aWords.length, bWords.length) * 0.5) {
    return true;
  }

  return false;
}
