// server/enforcement/StructuralValidator.js
// Level 1 — Validates structural integrity of stage outputs.
// Uses Zod schemas for shape validation and maps errors into ViolationObject format.

import { v4 as uuidv4 } from 'uuid';
import { Stage1Schema } from '../schemas/stage1.schema.js';
import { Stage2Schema } from '../schemas/stage2.schema.js';
import { Stage3Schema } from '../schemas/stage3.schema.js';
import { Stage4Schema } from '../schemas/stage4.schema.js';

const zodSchemas = {
  1: Stage1Schema,
  2: Stage2Schema,
  3: Stage3Schema,
  4: Stage4Schema,
};

/**
 * Create a ViolationObject
 */
function createViolation(stage, ruleId, fieldPath, expected, received, message, autoFixable = false, fixSuggestion = null) {
  return {
    violation_id: uuidv4(),
    stage,
    level: 'structural',
    severity: 'ERROR',
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
 * Validate that the raw output is parseable JSON.
 * @param {*} rawOutput - Raw string or object from LLM
 * @returns {{ ok: boolean, data?: object, violation?: object }}
 */
export function validateJSON(rawOutput, stageId) {
  if (typeof rawOutput === 'object' && rawOutput !== null) {
    return { ok: true, data: rawOutput };
  }

  if (typeof rawOutput === 'string') {
    try {
      let cleaned = rawOutput.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const parsed = JSON.parse(cleaned);
      return { ok: true, data: parsed };
    } catch (e) {
      return {
        ok: false,
        violation: createViolation(
          stageId,
          'JSON-PARSE',
          '_root',
          'Valid JSON object',
          typeof rawOutput,
          `Failed to parse JSON: ${e.message}`
        ),
      };
    }
  }

  return {
    ok: false,
    violation: createViolation(
      stageId,
      'JSON-PARSE',
      '_root',
      'object or JSON string',
      typeof rawOutput,
      `Expected object or JSON string, got ${typeof rawOutput}`
    ),
  };
}

/**
 * Validate structural integrity using Zod schemas and contract field definitions.
 *
 * @param {number} stageId - Stage number (1-4)
 * @param {object} stageOutput - Parsed stage output
 * @param {object} contract - Contract definition from ContractDefinitions
 * @returns {{ valid: boolean, violations: Array }}
 */
export function validateStructure(stageId, stageOutput, contract) {
  const violations = [];

  // ── Step 1: Zod schema validation ──
  const schema = zodSchemas[stageId];
  if (!schema) {
    violations.push(createViolation(
      stageId, 'SCHEMA-MISSING', '_schema', `Zod schema for stage ${stageId}`, 'undefined',
      `No Zod schema defined for stage ${stageId}`
    ));
    return { valid: false, violations };
  }

  const parseResult = schema.safeParse(stageOutput);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const fieldPath = issue.path.join('.');
      const ruleId = findRuleIdForPath(contract.fields, fieldPath, issue);

      violations.push(createViolation(
        stageId,
        ruleId || 'ZOD-STRUCTURAL',
        fieldPath || '_root',
        describeExpected(issue),
        describeReceived(issue),
        issue.message,
        isAutoFixableZodIssue(issue, ruleId),
        suggestFix(issue, ruleId)
      ));
    }
  }

  // ── Step 2: Contract field-level validation (supplementary) ──
  // Check fields with patterns that Zod might not catch in all cases
  for (const field of contract.fields) {
    if (!field.pattern) continue;
    const values = extractValues(stageOutput, field.path);
    const regex = new RegExp(field.pattern);

    for (const { value, resolvedPath } of values) {
      if (typeof value !== 'string') continue;
      if (!regex.test(value)) {
        // Only add if not already caught by Zod
        const alreadyCaught = violations.some(v => v.field_path === resolvedPath && v.rule_id === field.rule_id);
        if (!alreadyCaught) {
          violations.push(createViolation(
            stageId,
            field.rule_id || 'PATTERN-MISMATCH',
            resolvedPath,
            `Match pattern: ${field.pattern}`,
            value,
            `Value "${value}" does not match required pattern ${field.pattern}`,
            isPatternAutoFixable(field.rule_id),
            getPatternFixSuggestion(field.rule_id, value)
          ));
        }
      }
    }
  }

  // ── Step 3: Array min_length checks (supplementary) ──
  for (const field of contract.fields) {
    if (field.min_length == null || field.type !== 'array') continue;
    const values = extractValues(stageOutput, field.path);
    for (const { value, resolvedPath } of values) {
      if (!Array.isArray(value)) continue;
      if (value.length < field.min_length) {
        const alreadyCaught = violations.some(v => v.field_path === resolvedPath);
        if (!alreadyCaught) {
          violations.push(createViolation(
            stageId,
            field.rule_id || 'MIN-LENGTH',
            resolvedPath,
            `Array with minimum ${field.min_length} items`,
            `Array with ${value.length} items`,
            `${resolvedPath} must have at least ${field.min_length} items, got ${value.length}`
          ));
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

/**
 * Extract values from an object given a dot-notation path with [] for arrays.
 * e.g., "actors[].role" → iterates over all actors, returns each .role
 * e.g., "non_functional.scalability" → returns single value
 */
function extractValues(obj, path) {
  const results = [];

  function recurse(current, pathParts, currentPath) {
    if (pathParts.length === 0) {
      results.push({ value: current, resolvedPath: currentPath });
      return;
    }

    const part = pathParts[0];
    const rest = pathParts.slice(1);

    if (part.endsWith('[]')) {
      const key = part.slice(0, -2);
      const arr = current?.[key];
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          recurse(arr[i], rest, `${currentPath}${key}[${i}].`);
        }
      }
    } else {
      const val = current?.[part];
      if (val !== undefined) {
        const separator = rest.length > 0 ? '.' : '';
        recurse(val, rest, `${currentPath}${part}${separator}`);
      }
    }
  }

  const parts = path.split('.').reduce((acc, segment) => {
    // Handle "actors[].role" → ["actors[]", "role"]
    // Handle "actors[]" → ["actors[]"]
    if (segment.includes('[]')) {
      const idx = segment.indexOf('[]');
      acc.push(segment.substring(0, idx + 2));
      const remainder = segment.substring(idx + 2);
      if (remainder.startsWith('.') && remainder.length > 1) {
        acc.push(remainder.substring(1));
      } else if (remainder.length > 0 && !remainder.startsWith('.')) {
        acc.push(remainder);
      }
    } else {
      acc.push(segment);
    }
    return acc;
  }, []);

  recurse(obj, parts, '');
  return results;
}

/**
 * Find a rule ID from contract fields that matches a given Zod error path.
 */
function findRuleIdForPath(fields, zodPath, issue) {
  // Convert zod path like "actors.0.role" to abstract path "actors[].role"
  const abstractPath = zodPath.replace(/\.\d+\./g, '[].').replace(/\.\d+$/, '[]');

  for (const field of fields) {
    if (field.rule_id && field.path === abstractPath) {
      return field.rule_id;
    }
  }

  // Also check if the path is a child of a contract field
  for (const field of fields) {
    if (field.rule_id && abstractPath.startsWith(field.path.replace('[]', ''))) {
      return field.rule_id;
    }
  }

  return null;
}

function describeExpected(zodIssue) {
  if (zodIssue.expected) return String(zodIssue.expected);
  if (zodIssue.code === 'invalid_enum_value') {
    return `One of: ${zodIssue.options?.join(', ')}`;
  }
  return zodIssue.message;
}

function describeReceived(zodIssue) {
  if (zodIssue.received !== undefined) return String(zodIssue.received);
  return 'unknown';
}

function isAutoFixableZodIssue(issue, ruleId) {
  // Allow all structural issues (including missing fields and enums) to be auto-fixed with safe defaults
  return true;
}

function isPatternAutoFixable(ruleId) {
  return ['RULE-012', 'RULE-013', 'RULE-017'].includes(ruleId);
}

function suggestFix(issue, ruleId) {
  if (ruleId === 'RULE-012') return 'Uppercase the HTTP method';
  if (ruleId === 'RULE-013') return 'Prepend / to the route path';
  if (ruleId === 'RULE-017') return 'Add # prefix to hex color';
  return null;
}

function getPatternFixSuggestion(ruleId, value) {
  if (ruleId === 'RULE-013') return `Prepend / to "${value}"`;
  if (ruleId === 'RULE-017') return `Add # prefix to "${value}"`;
  return null;
}

export { extractValues };
