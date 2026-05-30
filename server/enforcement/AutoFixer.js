// server/enforcement/AutoFixer.js
// Attempts to automatically fix violations where auto_fixable = true.
// Returns a mutated output, fix log, and list of unfixed violations.

import { v4 as uuidv4 } from 'uuid';

/**
 * Attempt to fix a single violation.
 *
 * @param {object} violation - ViolationObject with auto_fixable=true
 * @param {object} stageOutput - The stage output to mutate (deep clone before calling)
 * @returns {{ fixed: boolean, mutatedOutput: object, description: string }}
 */
export function attemptFix(violation, stageOutput) {
  const ruleId = violation.rule_id;

  switch (ruleId) {
    case 'RULE-012':
      return fixHttpMethod(violation, stageOutput);
    case 'RULE-013':
      return fixRoutePath(violation, stageOutput);
    case 'RULE-016':
      return fixRouteOverlap(violation, stageOutput);
    case 'RULE-017':
      return fixHexColor(violation, stageOutput);
    case 'RULE-018':
    case 'RULE-018-WARN':
    case 'RULE-018-FAIL':
      return fixConfidenceScore(violation, stageOutput);
    case 'RULE-019':
      return fixDeploymentReady(violation, stageOutput);
    case 'AUTO-TIMESTAMPS':
      return fixMissingTimestamps(violation, stageOutput);
    case 'AUTO-FK-INDEX':
      return fixMissingFkIndex(violation, stageOutput);
    case 'RANGE-VIOLATION':
      return fixRangeViolation(violation, stageOutput);
    case 'RULE-007':
      return fixMissingRole(violation, stageOutput);
    case 'RULE-008':
      return fixMissingEntity(violation, stageOutput);
    case 'RULE-009':
      return fixMissingUserFlow(violation, stageOutput);
    case 'RULE-010':
      return fixMissingTable(violation, stageOutput);
    case 'RULE-011':
      return fixMissingAuthRole(violation, stageOutput);
    case 'ZOD-STRUCTURAL':
    case 'SCHEMA-MISSING':
    case 'PATTERN-MISMATCH':
    case 'MIN-LENGTH':
      return fixGenericStructural(violation, stageOutput);
    default:
      return { fixed: false, mutatedOutput: stageOutput, description: `No auto-fix available for ${ruleId}` };
  }
}

function setNestedValue(obj, path, value) {
  if (!path || path === '_root') return;
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null) {
      current[part] = isNaN(parts[i+1]) ? {} : [];
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function fixGenericStructural(violation, output) {
  const path = violation.field_path;
  if (!path || path === '_root') return { fixed: false, mutatedOutput: output, description: 'Cannot auto-fix root structure' };
  
  let defaultValue = 'Auto-filled due to LLM omission';
  const expected = (violation.expected || '').toLowerCase();
  
  if (expected.includes('array')) defaultValue = [];
  else if (expected.includes('boolean')) defaultValue = false;
  else if (expected.includes('number')) defaultValue = 0;
  else if (expected.includes('object') && !expected.includes('string')) defaultValue = {};

  setNestedValue(output, path, defaultValue);
  return { fixed: true, mutatedOutput: output, description: `Auto-filled default for missing/invalid field: ${path}` };
}

/**
 * Apply all possible fixes to a set of violations.
 *
 * @param {Array} violations - Array of ViolationObjects
 * @param {object} stageOutput - The stage output to fix
 * @returns {{ output: object, fixLog: Array, unfixed: Array }}
 */
export function applyAll(violations, stageOutput) {
  // Deep clone the output so we don't mutate the original
  let output = JSON.parse(JSON.stringify(stageOutput));
  const fixLog = [];
  const unfixed = [];

  // First pass: apply auto-fixable violations
  for (const violation of violations) {
    if (violation.auto_fixable) {
      const result = attemptFix(violation, output);
      if (result.fixed) {
        output = result.mutatedOutput;
        fixLog.push({
          violation_id: violation.violation_id,
          rule_id: violation.rule_id,
          fix_applied: result.description,
          field_path: violation.field_path,
        });
      } else {
        unfixed.push(violation);
      }
    } else {
      unfixed.push(violation);
    }
  }

  // Second pass: auto-add timestamps and FK indexes (proactive fixes)
  if (output.db_schema?.tables) {
    const timestampFixes = addMissingTimestamps(output);
    fixLog.push(...timestampFixes);

    const indexFixes = addMissingFkIndexes(output);
    fixLog.push(...indexFixes);
  }

  return { output, fixLog, unfixed };
}

// ─────────────────────────────────────────────
// Fix implementations
// ─────────────────────────────────────────────

/**
 * RULE-012: HTTP method → uppercase
 */
function fixHttpMethod(violation, output) {
  const endpoints = output.api_config?.endpoints;
  if (!endpoints) return { fixed: false, mutatedOutput: output, description: 'No endpoints found' };

  let fixed = false;
  for (const ep of endpoints) {
    if (typeof ep.method === 'string' && ep.method !== ep.method.toUpperCase()) {
      ep.method = ep.method.toUpperCase();
      fixed = true;
    }
  }

  return { fixed, mutatedOutput: output, description: 'Uppercased HTTP method(s)' };
}

/**
 * RULE-013: Route path → prepend /
 */
function fixRoutePath(violation, output) {
  const endpoints = output.api_config?.endpoints;
  if (!endpoints) return { fixed: false, mutatedOutput: output, description: 'No endpoints found' };

  let fixed = false;
  for (const ep of endpoints) {
    if (typeof ep.path === 'string' && !ep.path.startsWith('/')) {
      ep.path = '/' + ep.path;
      fixed = true;
    }
  }

  return { fixed, mutatedOutput: output, description: 'Prepended / to route path(s)' };
}

/**
 * RULE-016: Route in both public and protected → remove from public
 */
function fixRouteOverlap(violation, output) {
  const publicRoutes = output.auth_rules?.public_routes;
  const protectedRoutes = output.auth_rules?.protected_routes;
  if (!publicRoutes || !protectedRoutes) return { fixed: false, mutatedOutput: output, description: 'No routes found' };

  const protectedSet = new Set(protectedRoutes);
  const newPublic = publicRoutes.filter(r => !protectedSet.has(r));

  if (newPublic.length < publicRoutes.length) {
    output.auth_rules.public_routes = newPublic;
    return { fixed: true, mutatedOutput: output, description: 'Removed overlapping routes from public_routes' };
  }

  return { fixed: false, mutatedOutput: output, description: 'No overlapping routes found' };
}

/**
 * RULE-017: Hex color → add # prefix
 */
function fixHexColor(violation, output) {
  const theme = output.ui_config?.theme;
  if (!theme) return { fixed: false, mutatedOutput: output, description: 'No theme found' };

  let fixed = false;
  for (const key of ['primary_color', 'secondary_color']) {
    if (typeof theme[key] === 'string' && !theme[key].startsWith('#')) {
      // Check if it's a valid hex without #
      if (/^[0-9a-fA-F]{3,6}$/.test(theme[key])) {
        theme[key] = '#' + theme[key];
        fixed = true;
      }
    }
  }

  return { fixed, mutatedOutput: output, description: 'Added # prefix to hex color(s)' };
}

/**
 * RULE-018/018-WARN/018-FAIL: Clamp confidence_score to valid range for status
 */
function fixConfidenceScore(violation, output) {
  const report = output.validation_report;
  if (!report) return { fixed: false, mutatedOutput: output, description: 'No validation_report found' };

  const status = report.overall_status;
  let score = report.confidence_score;
  let fixed = false;

  if (typeof score !== 'number') {
    return { fixed: false, mutatedOutput: output, description: 'confidence_score is not a number' };
  }

  // Clamp to 0-100
  if (score < 0) { score = 0; fixed = true; }
  if (score > 100) { score = 100; fixed = true; }

  // Status-specific clamping
  if (status === 'WARN' && score > 70) { score = 70; fixed = true; }
  if (status === 'FAIL' && score > 40) { score = 40; fixed = true; }

  if (fixed) {
    report.confidence_score = score;
    return { fixed: true, mutatedOutput: output, description: `Clamped confidence_score to ${score} for status ${status}` };
  }

  return { fixed: false, mutatedOutput: output, description: 'confidence_score already in valid range' };
}

/**
 * RULE-019: Set deployment_ready = false when overall_status = FAIL
 */
function fixDeploymentReady(violation, output) {
  if (output.validation_report?.overall_status === 'FAIL' && output.final_spec?.deployment_ready === true) {
    output.final_spec.deployment_ready = false;
    return { fixed: true, mutatedOutput: output, description: 'Set deployment_ready to false (status = FAIL)' };
  }
  return { fixed: false, mutatedOutput: output, description: 'No fix needed' };
}

/**
 * Generic range clamping
 */
function fixRangeViolation(violation, output) {
  const path = violation.field_path;
  const parts = path.replace(/\[\]/g, '').split('.');
  let current = output;

  for (let i = 0; i < parts.length - 1; i++) {
    current = current?.[parts[i]];
  }

  const lastKey = parts[parts.length - 1];
  if (current && typeof current[lastKey] === 'number') {
    const expected = violation.expected;
    const rangeMatch = expected.match(/\[(\d+),\s*(\d+)\]/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      current[lastKey] = Math.max(min, Math.min(max, current[lastKey]));
      return { fixed: true, mutatedOutput: output, description: `Clamped ${path} to [${min}, ${max}]` };
    }
  }

  return { fixed: false, mutatedOutput: output, description: 'Could not clamp range' };
}

/**
 * Placeholder for explicit fix call
 */
function fixMissingTimestamps(violation, output) {
  return { fixed: false, mutatedOutput: output, description: 'Handled by proactive pass' };
}

function fixMissingFkIndex(violation, output) {
  return { fixed: false, mutatedOutput: output, description: 'Handled by proactive pass' };
}

function fixMissingRole(violation, output) {
  const match = violation.message.match(/"([^"]+)" has no match/);
  if (match) {
    if (!output.roles) output.roles = [];
    const missingRole = match[1];
    output.roles.push({
      name: missingRole,
      level: 'user',
      capabilities: [`Access ${missingRole} features`],
      restrictions: []
    });
    return { fixed: true, mutatedOutput: output, description: `Auto-injected missing role "${missingRole}"` };
  }
  return { fixed: false, mutatedOutput: output, description: 'Could not extract missing role name' };
}

/**
 * RULE-008: Auto-inject missing entities
 */
function fixMissingEntity(violation, output) {
  const match = violation.message.match(/"([^"]+)" has no match/);
  if (match && output.entities) {
    const missingName = match[1];
    output.entities.push({
      name: missingName,
      description: `Auto-generated entity for ${missingName}`,
      attributes: [
        { field: 'id', type: 'uuid', required: true, indexed: true }
      ],
      relationships: []
    });
    return { fixed: true, mutatedOutput: output, description: `Auto-injected missing entity "${missingName}"` };
  }
  return { fixed: false, mutatedOutput: output, description: 'Could not extract missing entity name' };
}

/**
 * RULE-009: Auto-inject missing user flows
 */
function fixMissingUserFlow(violation, output) {
  const match = violation.message.match(/Feature "([^"]+)" has no matching/);
  if (match && output.user_flows) {
    const missingFeature = match[1];
    output.user_flows.push({
      name: missingFeature,
      actors: ['System'], // Default actor
      trigger: `Triggered by user to ${missingFeature}`,
      steps: [`System processes ${missingFeature}`],
      outcome: `Successfully completed ${missingFeature}`
    });
    return { fixed: true, mutatedOutput: output, description: `Auto-injected missing user flow for feature "${missingFeature}"` };
  }
  return { fixed: false, mutatedOutput: output, description: 'Could not extract missing feature name' };
}

/**
 * RULE-010: Auto-inject missing database tables
 */
function fixMissingTable(violation, output) {
  const match = violation.message.match(/"([^"]+)" has no match/);
  if (match) {
    if (!output.db_schema) output.db_schema = {};
    if (!output.db_schema.tables) output.db_schema.tables = [];
    
    const missingEntity = match[1];
    const tableName = missingEntity.toLowerCase().replace(/\s+/g, '_');
    output.db_schema.tables.push({
      name: tableName,
      columns: [
        { name: 'id', sql_type: 'UUID', nullable: false, default: 'gen_random_uuid()', pk: true, fk: null, unique: true }
      ],
      indexes: [],
      foreign_keys: []
    });
    return { fixed: true, mutatedOutput: output, description: `Auto-injected missing table "${tableName}" for entity "${missingEntity}"` };
  }
  return { fixed: false, mutatedOutput: output, description: 'Could not extract missing entity name' };
}

/**
 * RULE-011: Auto-inject missing auth rules for roles
 */
function fixMissingAuthRole(violation, output) {
  const match = violation.message.match(/"([^"]+)" has no match/);
  if (match) {
    if (!output.auth_rules) output.auth_rules = {};
    if (!output.auth_rules.rules) output.auth_rules.rules = [];
    
    const missingRole = match[1];
    const routeName = missingRole.toLowerCase().replace(/\s+/g, '-');
    output.auth_rules.rules.push({
      resource: `/api/v1/${routeName}-access`,
      action: 'read',
      roles: [missingRole],
      condition: null,
      deny_default: true
    });
    return { fixed: true, mutatedOutput: output, description: `Auto-injected missing auth rule for role "${missingRole}"` };
  }
  return { fixed: false, mutatedOutput: output, description: 'Could not extract missing role name' };
}

// ─────────────────────────────────────────────
// Proactive fixes (not triggered by violations, but applied automatically)
// ─────────────────────────────────────────────

/**
 * AUTO-TIMESTAMPS: Add created_at and updated_at columns to tables that lack them
 */
function addMissingTimestamps(output) {
  const fixes = [];
  const tables = output.db_schema?.tables || [];

  for (const table of tables) {
    const colNames = new Set(table.columns.map(c => c.name.toLowerCase()));

    if (!colNames.has('created_at')) {
      table.columns.push({
        name: 'created_at',
        sql_type: 'TIMESTAMP',
        nullable: false,
        default: 'CURRENT_TIMESTAMP',
        pk: false,
        fk: null,
        unique: false,
      });
      fixes.push({
        violation_id: uuidv4(),
        rule_id: 'AUTO-TIMESTAMPS',
        fix_applied: `Added created_at column to table "${table.name}"`,
        field_path: `db_schema.tables[${table.name}].columns`,
      });
    }

    if (!colNames.has('updated_at')) {
      table.columns.push({
        name: 'updated_at',
        sql_type: 'TIMESTAMP',
        nullable: false,
        default: 'CURRENT_TIMESTAMP',
        pk: false,
        fk: null,
        unique: false,
      });
      fixes.push({
        violation_id: uuidv4(),
        rule_id: 'AUTO-TIMESTAMPS',
        fix_applied: `Added updated_at column to table "${table.name}"`,
        field_path: `db_schema.tables[${table.name}].columns`,
      });
    }
  }

  return fixes;
}

/**
 * AUTO-FK-INDEX: Add index for any FK column that doesn't have one
 */
function addMissingFkIndexes(output) {
  const fixes = [];
  const tables = output.db_schema?.tables || [];

  for (const table of tables) {
    // Find all FK columns
    const fkColumns = table.columns.filter(c => c.fk && typeof c.fk === 'string');

    // Find all indexed columns
    const indexedColumns = new Set();
    for (const idx of table.indexes || []) {
      for (const col of idx.columns) {
        indexedColumns.add(col);
      }
    }

    for (const fkCol of fkColumns) {
      if (!indexedColumns.has(fkCol.name)) {
        if (!table.indexes) table.indexes = [];
        table.indexes.push({
          columns: [fkCol.name],
          unique: false,
        });
        fixes.push({
          violation_id: uuidv4(),
          rule_id: 'AUTO-FK-INDEX',
          fix_applied: `Added index for FK column "${fkCol.name}" on table "${table.name}"`,
          field_path: `db_schema.tables[${table.name}].indexes`,
        });
      }
    }
  }

  return fixes;
}
