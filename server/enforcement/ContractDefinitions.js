// server/enforcement/ContractDefinitions.js
// Defines all 20 enforcement rules as data structures for each pipeline stage.
// Each contract has field-level constraints and cross-layer reference rules.

/**
 * ViolationObject shape (for reference):
 * {
 *   violation_id, stage, level, severity, rule_id,
 *   field_path, expected, received, message,
 *   auto_fixable, fix_suggestion
 * }
 */

// ─────────────────────────────────────────────
// Stage 1 — Intent Extraction field rules
// ─────────────────────────────────────────────
const stage1Fields = [
  {
    path: 'intent_type',
    type: 'enum',
    required: true,
    enum_values: ['web_app', 'api_service', 'dashboard', 'mobile_app', 'saas_platform', 'cli_tool'],
    rule_id: null,
  },
  {
    path: 'domain',
    type: 'string',
    required: true,
  },
  {
    path: 'primary_goal',
    type: 'string',
    required: true,
  },
  {
    path: 'features',
    type: 'array',
    required: true,
    min_length: 2,
    rule_id: 'RULE-002',
  },
  {
    path: 'actors',
    type: 'array',
    required: true,
    min_length: 1,
  },
  // RULE-001: actors[].role enum
  {
    path: 'actors[].role',
    type: 'enum',
    required: true,
    enum_values: ['user', 'admin', 'system', 'guest'],
    rule_id: 'RULE-001',
  },
  {
    path: 'actors[].name',
    type: 'string',
    required: true,
  },
  {
    path: 'actors[].permissions',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'data_needs',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'constraints',
    type: 'array',
    required: true,
  },
  {
    path: 'integrations',
    type: 'array',
    required: true,
  },
  // RULE-003 & RULE-004
  {
    path: 'non_functional.scalability',
    type: 'enum',
    required: true,
    enum_values: ['low', 'medium', 'high'],
    rule_id: 'RULE-003',
  },
  {
    path: 'non_functional.security',
    type: 'enum',
    required: true,
    enum_values: ['low', 'medium', 'high'],
    rule_id: 'RULE-004',
  },
  {
    path: 'non_functional.performance',
    type: 'enum',
    required: true,
    enum_values: ['low', 'medium', 'high'],
  },
  {
    path: 'non_functional.availability',
    type: 'string',
    required: true,
  },
];

// ─────────────────────────────────────────────
// Stage 2 — System Design field rules
// ─────────────────────────────────────────────
const stage2Fields = [
  {
    path: 'app_name',
    type: 'string',
    required: true,
  },
  {
    path: 'description',
    type: 'string',
    required: true,
  },
  // RULE-005
  {
    path: 'architecture_pattern',
    type: 'enum',
    required: true,
    enum_values: ['monolith', 'MVC', 'microservices', 'serverless', 'event-driven', 'layered'],
    rule_id: 'RULE-005',
  },
  {
    path: 'modules',
    type: 'array',
    required: true,
    min_length: 3,
  },
  // RULE-006
  {
    path: 'modules[].layer',
    type: 'enum',
    required: true,
    enum_values: ['presentation', 'business', 'data', 'infrastructure'],
    rule_id: 'RULE-006',
  },
  {
    path: 'modules[].name',
    type: 'string',
    required: true,
  },
  {
    path: 'modules[].responsibility',
    type: 'string',
    required: true,
  },
  {
    path: 'entities',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'entities[].name',
    type: 'string',
    required: true,
  },
  {
    path: 'user_flows',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'user_flows[].name',
    type: 'string',
    required: true,
  },
  {
    path: 'roles',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'roles[].name',
    type: 'string',
    required: true,
  },
  {
    path: 'tech_stack',
    type: 'object',
    required: true,
  },
];

// ─────────────────────────────────────────────
// Stage 3 — Schema Generation field rules
// ─────────────────────────────────────────────
const stage3Fields = [
  {
    path: 'ui_config',
    type: 'object',
    required: true,
  },
  {
    path: 'ui_config.pages',
    type: 'array',
    required: true,
    min_length: 1,
  },
  // RULE-017
  {
    path: 'ui_config.theme.primary_color',
    type: 'string',
    required: true,
    pattern: '^#[0-9a-fA-F]{3,6}$',
    rule_id: 'RULE-017',
  },
  {
    path: 'ui_config.theme.secondary_color',
    type: 'string',
    required: true,
    pattern: '^#[0-9a-fA-F]{3,6}$',
    rule_id: 'RULE-017',
  },
  {
    path: 'api_config',
    type: 'object',
    required: true,
  },
  {
    path: 'api_config.endpoints',
    type: 'array',
    required: true,
    min_length: 1,
  },
  // RULE-012
  {
    path: 'api_config.endpoints[].method',
    type: 'enum',
    required: true,
    enum_values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    rule_id: 'RULE-012',
  },
  // RULE-013
  {
    path: 'api_config.endpoints[].path',
    type: 'string',
    required: true,
    pattern: '^/',
    rule_id: 'RULE-013',
  },
  {
    path: 'api_config.endpoints[].id',
    type: 'string',
    required: true,
  },
  {
    path: 'db_schema',
    type: 'object',
    required: true,
  },
  {
    path: 'db_schema.tables',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'auth_rules',
    type: 'object',
    required: true,
  },
  {
    path: 'auth_rules.rules',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'auth_rules.public_routes',
    type: 'array',
    required: true,
  },
  {
    path: 'auth_rules.protected_routes',
    type: 'array',
    required: true,
  },
];

// ─────────────────────────────────────────────
// Stage 4 — Refinement field rules
// ─────────────────────────────────────────────
const stage4Fields = [
  {
    path: 'validation_report',
    type: 'object',
    required: true,
  },
  {
    path: 'validation_report.overall_status',
    type: 'enum',
    required: true,
    enum_values: ['PASS', 'WARN', 'FAIL'],
  },
  // RULE-018
  {
    path: 'validation_report.confidence_score',
    type: 'number',
    required: true,
    range: [0, 100],
    rule_id: 'RULE-018',
  },
  {
    path: 'validation_report.issues',
    type: 'array',
    required: true,
  },
  {
    path: 'cross_layer_checks',
    type: 'array',
    required: true,
    min_length: 1,
  },
  {
    path: 'applied_refinements',
    type: 'array',
    required: true,
  },
  // RULE-020
  {
    path: 'applied_refinements[].affected_layer',
    type: 'enum',
    required: true,
    enum_values: ['intent', 'design', 'schema', 'cross-layer'],
    rule_id: 'RULE-020',
  },
  {
    path: 'final_spec',
    type: 'object',
    required: true,
  },
  {
    path: 'final_spec.deployment_ready',
    type: 'boolean',
    required: true,
  },
  {
    path: 'final_spec.project_name',
    type: 'string',
    required: true,
  },
  {
    path: 'final_spec.version',
    type: 'string',
    required: true,
  },
  {
    path: 'final_spec.next_steps',
    type: 'array',
    required: true,
    min_length: 1,
  },
];

// ─────────────────────────────────────────────
// Cross-Layer Rules
// ─────────────────────────────────────────────

// Stage 2 receives Stage 1 — check S1→S2 mappings
const stage2CrossLayerRules = [
  // RULE-007
  {
    id: 'RULE-007',
    description: 'Every actors[].name in S1 must produce a roles[].name in S2',
    source_stage: 1,
    source_path: 'actors[].name',
    target_stage: 2,
    target_path: 'roles[].name',
    match_type: 'fuzzy',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // RULE-008
  {
    id: 'RULE-008',
    description: 'Every data_needs[] item in S1 must produce an entities[].name in S2',
    source_stage: 1,
    source_path: 'data_needs[]',
    target_stage: 2,
    target_path: 'entities[].name',
    match_type: 'fuzzy',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // RULE-009
  {
    id: 'RULE-009',
    description: 'Every features[] item in S1 must appear in at least one user_flows[] in S2',
    source_stage: 1,
    source_path: 'features[]',
    target_stage: 2,
    target_path: 'user_flows[].name,user_flows[].steps[]',
    match_type: 'fuzzy_text',
    severity: 'ERROR',
    auto_fixable: true,
  },
];

// Stage 3 receives S1 + S2 — check S2→S3 mappings
const stage3CrossLayerRules = [
  // RULE-010
  {
    id: 'RULE-010',
    description: 'Every entities[].name in S2 must produce a db_schema.tables[].name in S3',
    source_stage: 2,
    source_path: 'entities[].name',
    target_stage: 3,
    target_path: 'db_schema.tables[].name',
    match_type: 'fuzzy',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // RULE-011
  {
    id: 'RULE-011',
    description: 'Every roles[].name in S2 must appear in at least one auth_rules.rules[].roles[] in S3',
    source_stage: 2,
    source_path: 'roles[].name',
    target_stage: 3,
    target_path: 'auth_rules.rules[].roles[]',
    match_type: 'fuzzy',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // RULE-CLV-012: FLOWS ↔ SYSTEM DESIGN
  {
    id: 'RULE-CLV-012',
    description: 'All user_flows must reference valid entities from Stage 2',
    source_stage: 2,
    source_path: 'entities[].name',
    target_stage: 3, // Since flows are in S2, but we validate S2->S2 consistency or S2->S3? Wait, flows are in S2. So we check it in S2 semantic rules or cross layer? The prompt says flows ↔ system design. Actually, flows are in S2, entities are in S2. I can add it to Stage 2 internal rules.
    // Wait, the prompt implies adding these to CrossLayerValidator.
    // I will use match_type: 'exact' or 'flows_entities'
  }
];

// Phase 2: New Cross Layer Rules for Stage 3 & 4
const stage3CrossLayerRulesExtended = [
  ...stage3CrossLayerRules,
  
  // A. UI ↔ API
  {
    id: 'RULE-CLV-001',
    description: 'Every UI page data_sources[] must map to an existing api_config.endpoints[].id',
    source_stage: 3,
    match_type: 'ui_api_data_sources',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-002',
    description: 'Every API endpoint referenced by UI components must exist',
    source_stage: 3,
    match_type: 'ui_api_endpoints',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-003',
    description: 'API request payload fields must match endpoint schema',
    source_stage: 3,
    match_type: 'ui_api_payloads', // Might be hard to check if UI doesn't have detailed payloads, but we'll implement a stub or check if possible
    severity: 'ERROR',
    auto_fixable: false,
  },

  // B. API ↔ DATABASE
  {
    id: 'RULE-CLV-004',
    description: 'Every endpoint field referencing a DB column must exist in db_schema',
    source_stage: 3,
    match_type: 'api_db_fields',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-005',
    description: 'Required DB fields must be handled by at least one API endpoint',
    source_stage: 3,
    match_type: 'api_db_required',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-006',
    description: 'FK relationships in endpoints must be valid',
    source_stage: 3,
    match_type: 'api_db_fks',
    severity: 'ERROR',
    auto_fixable: false,
  },

  // C. AUTH ↔ API
  {
    id: 'RULE-CLV-007',
    description: 'Every protected_routes[] entry must have a matching auth_rules.rules[] entry',
    source_stage: 3,
    match_type: 'auth_api_protected',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-008',
    description: 'Role permissions in auth rules must match endpoint access roles',
    source_stage: 3,
    match_type: 'auth_api_roles',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-009',
    description: 'No endpoint may reference undefined roles',
    source_stage: 3,
    match_type: 'auth_api_undefined',
    severity: 'ERROR',
    auto_fixable: false,
  },

  // D. UI ↔ AUTH
  {
    id: 'RULE-CLV-010',
    description: 'Pages with allowed_roles must reference roles that exist in auth_rules',
    source_stage: 3,
    match_type: 'ui_auth_roles',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-011',
    description: 'Role visibility must be consistent across pages and auth rules',
    source_stage: 3,
    match_type: 'ui_auth_visibility',
    severity: 'ERROR',
    auto_fixable: false,
  }
];

// E. FLOWS ↔ SYSTEM DESIGN (Stage 2 internal, but we can put it here as Stage 2 cross-layer for simplicity)
const stage2CrossLayerRulesExtended = [
  ...stage2CrossLayerRules,
  {
    id: 'RULE-CLV-012',
    description: 'All user_flows must reference valid entities from Stage 2',
    source_stage: 2,
    match_type: 'flows_entities_valid',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-013',
    description: 'All entity references in flows must exist in entities[]',
    source_stage: 2,
    match_type: 'flows_entities_exist',
    severity: 'ERROR',
    auto_fixable: false,
  },
  {
    id: 'RULE-CLV-014',
    description: 'No orphan workflows (flows with no linked entity)',
    source_stage: 2,
    match_type: 'flows_entities_orphan',
    severity: 'ERROR',
    auto_fixable: false,
  }
];

// Stage 3 internal consistency rules (semantic level)
const stage3InternalRules = [
  // RULE-014
  {
    id: 'RULE-014',
    description: 'db_schema.tables[].columns[].fk must resolve to a real table.column pair',
    type: 'fk_resolution',
    severity: 'ERROR',
    auto_fixable: false,
  },
  // RULE-015
  {
    id: 'RULE-015',
    description: 'ui_config.pages[].data_sources[] must reference a real endpoints[].id',
    type: 'data_source_resolution',
    severity: 'ERROR',
    auto_fixable: false,
  },
  // RULE-016
  {
    id: 'RULE-016',
    description: 'No route can appear in both public_routes[] and protected_routes[]',
    type: 'route_overlap',
    severity: 'ERROR',
    auto_fixable: true,
  },
];

// Stage 4 semantic rules
const stage4SemanticRules = [
  // RULE-019
  {
    id: 'RULE-019',
    description: 'deployment_ready must be false when overall_status = FAIL',
    type: 'deployment_status_consistency',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // Confidence score clamping for WARN
  {
    id: 'RULE-018-WARN',
    description: 'confidence_score must be ≤ 70 when overall_status = WARN',
    type: 'confidence_range_warn',
    severity: 'ERROR',
    auto_fixable: true,
  },
  // Confidence score clamping for FAIL
  {
    id: 'RULE-018-FAIL',
    description: 'confidence_score must be ≤ 40 when overall_status = FAIL',
    type: 'confidence_range_fail',
    severity: 'ERROR',
    auto_fixable: true,
  },
];

// ─────────────────────────────────────────────
// Contracts per stage
// ─────────────────────────────────────────────
const contracts = {
  1: {
    stage: 1,
    fields: stage1Fields,
    cross_layer_rules: [],
    internal_rules: [],
    semantic_rules: [],
  },
  2: {
    stage: 2,
    fields: stage2Fields,
    cross_layer_rules: stage2CrossLayerRulesExtended,
    internal_rules: [],
    semantic_rules: [],
  },
  3: {
    stage: 3,
    fields: stage3Fields,
    cross_layer_rules: stage3CrossLayerRulesExtended,
    internal_rules: stage3InternalRules,
    semantic_rules: [],
  },
  4: {
    stage: 4,
    fields: stage4Fields,
    cross_layer_rules: [],
    internal_rules: [],
    semantic_rules: stage4SemanticRules,
  },
};

/**
 * Get the full contract for a stage
 * @param {number} stageId
 * @returns {object} Contract definition
 */
export function getContract(stageId) {
  const contract = contracts[stageId];
  if (!contract) throw new Error(`No contract defined for stage ${stageId}`);
  return contract;
}

/**
 * Get cross-layer rules for a stage
 * @param {number} stageId
 * @returns {Array} Cross-layer rule definitions
 */
export function getCrossLayerRules(stageId) {
  return contracts[stageId]?.cross_layer_rules || [];
}

/**
 * Get internal consistency rules for a stage
 * @param {number} stageId
 * @returns {Array}
 */
export function getInternalRules(stageId) {
  return contracts[stageId]?.internal_rules || [];
}

/**
 * Get semantic rules for a stage
 * @param {number} stageId
 * @returns {Array}
 */
export function getSemanticRules(stageId) {
  return contracts[stageId]?.semantic_rules || [];
}

/**
 * Map of auto-fixable rule IDs
 */
export const AUTO_FIXABLE_RULES = new Set([
  'RULE-012', // HTTP method → uppercase
  'RULE-013', // Route → prepend /
  'RULE-016', // Route overlap → remove from public
  'RULE-017', // Hex color → add #
  'RULE-018', // Confidence score → clamp
  'RULE-018-WARN',
  'RULE-018-FAIL',
  'RULE-019', // deployment_ready → false on FAIL
  'AUTO-TIMESTAMPS', // Add created_at/updated_at
  'AUTO-FK-INDEX', // Add index for FK columns
]);

export const STAGE_NAMES = {
  1: 'Intent Extraction',
  2: 'System Design',
  3: 'Schema Generation',
  4: 'Refinement Layer',
};
