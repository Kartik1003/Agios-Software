// server/enforcement/SemanticValidator.js
// Level 2 — Validates semantic integrity within a single stage output.
// Checks numeric ranges, duplicate IDs, self-referential consistency,
// and stage-specific business logic rules.

import { v4 as uuidv4 } from 'uuid';
import { getInternalRules, getSemanticRules } from './ContractDefinitions.js';

/**
 * Create a semantic-level ViolationObject
 */
function createViolation(stage, ruleId, fieldPath, expected, received, message, severity = 'ERROR', autoFixable = false, fixSuggestion = null) {
  return {
    violation_id: uuidv4(),
    stage,
    level: 'semantic',
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
 * Validate semantic integrity of a stage output.
 *
 * @param {number} stageId - Stage number (1-4)
 * @param {object} stageOutput - Parsed stage output
 * @param {object} contract - Contract definition
 * @returns {{ valid: boolean, violations: Array }}
 */
export function validateSemantics(stageId, stageOutput, contract) {
  const violations = [];

  // ── Generic: Numeric range checks from contract fields ──
  for (const field of contract.fields) {
    if (!field.range) continue;
    const [min, max] = field.range;
    const value = getNestedValue(stageOutput, field.path);
    if (typeof value === 'number' && (value < min || value > max)) {
      violations.push(createViolation(
        stageId,
        field.rule_id || 'RANGE-VIOLATION',
        field.path,
        `Number in range [${min}, ${max}]`,
        String(value),
        `${field.path} must be between ${min} and ${max}, got ${value}`,
        'ERROR',
        true,
        `Clamp value to [${min}, ${max}]`
      ));
    }
  }

  // ── Generic: Duplicate ID checks within arrays ──
  checkDuplicateIds(stageId, stageOutput, violations);

  // ── Stage-specific internal consistency rules ──
  const internalRules = getInternalRules(stageId);
  for (const rule of internalRules) {
    switch (rule.type) {
      case 'fk_resolution':
        validateForeignKeys(stageId, stageOutput, violations, rule);
        break;
      case 'data_source_resolution':
        validateDataSources(stageId, stageOutput, violations, rule);
        break;
      case 'route_overlap':
        validateRouteOverlap(stageId, stageOutput, violations, rule);
        break;
    }
  }

  // ── Stage-specific semantic rules ──
  const semanticRules = getSemanticRules(stageId);
  for (const rule of semanticRules) {
    switch (rule.type) {
      case 'deployment_status_consistency':
        validateDeploymentStatus(stageId, stageOutput, violations, rule);
        break;
      case 'confidence_range_warn':
        validateConfidenceWarn(stageId, stageOutput, violations, rule);
        break;
      case 'confidence_range_fail':
        validateConfidenceFail(stageId, stageOutput, violations, rule);
        break;
    }
  }

  // ── Stage 3: endpoint roles must exist in auth_rules ──
  if (stageId === 3) {
    validateEndpointRoles(stageId, stageOutput, violations);
    validatePageAllowedRoles(stageId, stageOutput, violations);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ─────────────────────────────────────────────
// Internal consistency checkers
// ─────────────────────────────────────────────

/**
 * RULE-014: Every FK in db_schema.tables[].columns[].fk must resolve
 * to a real table.column pair within the same db_schema.
 */
function validateForeignKeys(stageId, output, violations, rule) {
  const tables = output.db_schema?.tables;
  if (!Array.isArray(tables)) return;

  // Build set of valid "table.column" pairs
  const validPairs = new Set();
  for (const table of tables) {
    for (const col of table.columns || []) {
      validPairs.add(`${table.name}.${col.name}`);
    }
  }

  // Also check foreign_keys array on each table
  for (const table of tables) {
    // Check columns with fk field
    for (const col of table.columns || []) {
      if (col.fk && typeof col.fk === 'string' && col.fk.length > 0) {
        if (!validPairs.has(col.fk)) {
          violations.push(createViolation(
            stageId,
            rule.id,
            `db_schema.tables[${table.name}].columns[${col.name}].fk`,
            `Valid table.column reference (one of: ${[...validPairs].slice(0, 5).join(', ')}...)`,
            col.fk,
            `FK "${col.fk}" on ${table.name}.${col.name} does not resolve to a known table.column pair`,
            rule.severity,
            false,
            'Ensure the referenced table and column exist in db_schema'
          ));
        }
      }
    }

    // Check foreign_keys array
    for (const fk of table.foreign_keys || []) {
      if (fk.references && typeof fk.references === 'string') {
        if (!validPairs.has(fk.references)) {
          violations.push(createViolation(
            stageId,
            rule.id,
            `db_schema.tables[${table.name}].foreign_keys[${fk.column}].references`,
            `Valid table.column reference`,
            fk.references,
            `FK reference "${fk.references}" from ${table.name}.${fk.column} does not resolve`,
            rule.severity,
            false,
            'Ensure the referenced table and column exist in db_schema'
          ));
        }
      }
    }
  }
}

/**
 * RULE-015: Every ui_config.pages[].data_sources[] must reference
 * a real api_config.endpoints[].id.
 */
function validateDataSources(stageId, output, violations, rule) {
  const endpoints = output.api_config?.endpoints;
  const pages = output.ui_config?.pages;
  if (!Array.isArray(endpoints) || !Array.isArray(pages)) return;

  const endpointIds = new Set(endpoints.map(e => e.id?.toLowerCase()));

  for (const page of pages) {
    for (const ds of page.data_sources || []) {
      if (!endpointIds.has(ds.toLowerCase())) {
        violations.push(createViolation(
          stageId,
          rule.id,
          `ui_config.pages[${page.name}].data_sources`,
          `Valid endpoint ID (one of: ${[...endpointIds].slice(0, 5).join(', ')}...)`,
          ds,
          `Data source "${ds}" on page "${page.name}" does not match any endpoint ID`,
          rule.severity,
          false,
          'Use an endpoint ID from api_config.endpoints[].id'
        ));
      }
    }
  }
}

/**
 * RULE-016: No route can appear in both public_routes[] and protected_routes[].
 */
function validateRouteOverlap(stageId, output, violations, rule) {
  const publicRoutes = output.auth_rules?.public_routes || [];
  const protectedRoutes = output.auth_rules?.protected_routes || [];
  const publicSet = new Set(publicRoutes);

  for (const route of protectedRoutes) {
    if (publicSet.has(route)) {
      violations.push(createViolation(
        stageId,
        rule.id,
        'auth_rules.public_routes / auth_rules.protected_routes',
        `Route "${route}" in only one list`,
        `Route "${route}" found in BOTH lists`,
        `Route "${route}" appears in both public_routes and protected_routes`,
        rule.severity,
        true,
        `Remove "${route}" from public_routes`
      ));
    }
  }
}

/**
 * RULE-019: deployment_ready must be false when overall_status = FAIL
 */
function validateDeploymentStatus(stageId, output, violations, rule) {
  const status = output.validation_report?.overall_status;
  const deployReady = output.final_spec?.deployment_ready;

  if (status === 'FAIL' && deployReady === true) {
    violations.push(createViolation(
      stageId,
      rule.id,
      'final_spec.deployment_ready',
      'false (because overall_status = FAIL)',
      'true',
      'deployment_ready must be false when overall_status is FAIL',
      rule.severity,
      true,
      'Set deployment_ready to false'
    ));
  }
}

/**
 * RULE-018-WARN: confidence_score must be ≤ 70 when overall_status = WARN
 */
function validateConfidenceWarn(stageId, output, violations, rule) {
  const status = output.validation_report?.overall_status;
  const score = output.validation_report?.confidence_score;

  if (status === 'WARN' && typeof score === 'number' && score > 70) {
    violations.push(createViolation(
      stageId,
      rule.id,
      'validation_report.confidence_score',
      '≤ 70 (because overall_status = WARN)',
      String(score),
      `confidence_score must be ≤ 70 when status is WARN, got ${score}`,
      rule.severity,
      true,
      'Clamp confidence_score to 70'
    ));
  }
}

/**
 * RULE-018-FAIL: confidence_score must be ≤ 40 when overall_status = FAIL
 */
function validateConfidenceFail(stageId, output, violations, rule) {
  const status = output.validation_report?.overall_status;
  const score = output.validation_report?.confidence_score;

  if (status === 'FAIL' && typeof score === 'number' && score > 40) {
    violations.push(createViolation(
      stageId,
      rule.id,
      'validation_report.confidence_score',
      '≤ 40 (because overall_status = FAIL)',
      String(score),
      `confidence_score must be ≤ 40 when status is FAIL, got ${score}`,
      rule.severity,
      true,
      'Clamp confidence_score to 40'
    ));
  }
}

/**
 * Stage 3 internal: Every endpoint role must exist in auth_rules.rules[].roles[]
 */
function validateEndpointRoles(stageId, output, violations) {
  const authRoles = new Set();
  for (const rule of output.auth_rules?.rules || []) {
    for (const r of rule.roles || []) {
      authRoles.add(r.toLowerCase());
    }
  }

  for (const endpoint of output.api_config?.endpoints || []) {
    for (const role of endpoint.roles || []) {
      if (!authRoles.has(role.toLowerCase())) {
        violations.push(createViolation(
          stageId,
          'ENDPOINT-ROLE-AUTH',
          `api_config.endpoints[${endpoint.id}].roles`,
          `Role in auth_rules.rules[].roles[] (known: ${[...authRoles].join(', ')})`,
          role,
          `Endpoint "${endpoint.id}" references role "${role}" not found in auth_rules`,
          'ERROR'
        ));
      }
    }
  }
}

/**
 * Stage 3 internal: Every page allowed_roles[] must exist in auth_rules.rules[].roles[]
 */
function validatePageAllowedRoles(stageId, output, violations) {
  const authRoles = new Set();
  for (const rule of output.auth_rules?.rules || []) {
    for (const r of rule.roles || []) {
      authRoles.add(r.toLowerCase());
    }
  }

  for (const page of output.ui_config?.pages || []) {
    for (const role of page.allowed_roles || []) {
      if (!authRoles.has(role.toLowerCase())) {
        violations.push(createViolation(
          stageId,
          'PAGE-ROLE-AUTH',
          `ui_config.pages[${page.name}].allowed_roles`,
          `Role in auth_rules.rules[].roles[]`,
          role,
          `Page "${page.name}" references role "${role}" not found in auth_rules`,
          'ERROR'
        ));
      }
    }
  }
}

// ─────────────────────────────────────────────
// Utility: Duplicate ID detection
// ─────────────────────────────────────────────

function checkDuplicateIds(stageId, output, violations) {
  // Check api_config.endpoints[].id
  if (output.api_config?.endpoints) {
    const ids = output.api_config.endpoints.map(e => e.id);
    const dupes = findDuplicates(ids);
    for (const dupe of dupes) {
      violations.push(createViolation(
        stageId,
        'DUPLICATE-ID',
        'api_config.endpoints[].id',
        `Unique ID`,
        dupe,
        `Duplicate endpoint ID: "${dupe}"`,
        'ERROR'
      ));
    }
  }

  // Check db_schema.tables[].name
  if (output.db_schema?.tables) {
    const names = output.db_schema.tables.map(t => t.name);
    const dupes = findDuplicates(names);
    for (const dupe of dupes) {
      violations.push(createViolation(
        stageId,
        'DUPLICATE-ID',
        'db_schema.tables[].name',
        'Unique table name',
        dupe,
        `Duplicate table name: "${dupe}"`,
        'ERROR'
      ));
    }
  }

  // Check modules[].name (Stage 2)
  if (output.modules) {
    const names = output.modules.map(m => m.name);
    const dupes = findDuplicates(names);
    for (const dupe of dupes) {
      violations.push(createViolation(
        stageId,
        'DUPLICATE-ID',
        'modules[].name',
        'Unique module name',
        dupe,
        `Duplicate module name: "${dupe}"`,
        'WARN'
      ));
    }
  }
}

function findDuplicates(arr) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of arr) {
    if (seen.has(item)) dupes.add(item);
    seen.add(item);
  }
  return [...dupes];
}

/**
 * Get a nested value from an object using a simple dot path (no array wildcards).
 */
function getNestedValue(obj, path) {
  const parts = path.replace(/\[\]/g, '').split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}
