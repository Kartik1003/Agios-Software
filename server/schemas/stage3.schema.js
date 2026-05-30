// server/schemas/stage3.schema.js
// Zod schema for Stage 3 — Schema Generation output contract

import { z } from 'zod';

// ── UI Config ──
const PageSchema = z.object({
  name: z.string().min(1),
  route: z.string().min(1),
  layout: z.string().min(1),
  components: z.array(z.string()),
  data_sources: z.array(z.string()),
  allowed_roles: z.array(z.string()),
});

const NavigationSchema = z.object({
  label: z.string().min(1),
  route: z.string().min(1),
  icon: z.string(),
  roles: z.array(z.string()),
});

const ThemeSchema = z.object({
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),
  font: z.string().min(1),
  style: z.string().min(1), // Relaxed from enum
});

const UIConfigSchema = z.object({
  framework: z.string().min(1),
  pages: z.array(PageSchema).min(1),
  navigation: z.array(NavigationSchema).min(1),
  theme: ThemeSchema,
});

// ── API Config ──
const EndpointSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1), // Relaxed from enum
  path: z.string().min(1),
  description: z.string().min(1),
  auth_required: z.boolean(),
  roles: z.array(z.string()),
  query_params: z.array(z.string()),
  body_schema: z.string().nullable(),
  response_schema: z.string().min(1),
  rate_limit: z.string().nullable(),
});

const APIConfigSchema = z.object({
  style: z.string().min(1), // Relaxed from enum
  base_path: z.string().min(1),
  versioning: z.string().min(1),
  endpoints: z.array(EndpointSchema).min(1),
});

// ── DB Schema ──
const ColumnSchema = z.object({
  name: z.string().min(1),
  sql_type: z.string().min(1),
  nullable: z.boolean(),
  default: z.string().nullable(),
  pk: z.boolean(),
  fk: z.string().nullable(),
  unique: z.boolean(),
});

const IndexSchema = z.object({
  columns: z.array(z.string()).min(1),
  unique: z.boolean(),
});

const ForeignKeySchema = z.object({
  column: z.string().min(1),
  references: z.string().min(1),
});

const TableSchema = z.object({
  name: z.string().min(1),
  columns: z.array(ColumnSchema).min(1),
  indexes: z.array(IndexSchema),
  foreign_keys: z.array(ForeignKeySchema),
});

const DBSchemaSchema = z.object({
  engine: z.string().min(1), // Relaxed from enum
  tables: z.array(TableSchema).min(1),
  migrations: z.array(z.string()),
});

// ── Auth Rules ──
const AuthRuleSchema = z.object({
  resource: z.string().min(1),
  action: z.string().min(1), // Relaxed from enum
  roles: z.array(z.string()).min(1),
  condition: z.string().nullable(),
  deny_default: z.boolean(),
});

const AuthRulesSchema = z.object({
  mechanism: z.string().min(1), // Relaxed from enum
  jwt_expiry: z.string().min(1),
  refresh_token: z.boolean(),
  mfa_required: z.boolean(),
  rules: z.array(AuthRuleSchema).min(1),
  public_routes: z.array(z.string()),
  protected_routes: z.array(z.string()),
});

// ── Combined Stage 3 Schema ──
export const Stage3Schema = z.object({
  ui_config: UIConfigSchema,
  api_config: APIConfigSchema,
  db_schema: DBSchemaSchema,
  auth_rules: AuthRulesSchema,
});

/**
 * Semantic and cross-layer validation rules are now handled by the enforcement layer.
 * See: server/enforcement/ContractDefinitions.js (RULE-010 through RULE-016)
 * server/enforcement/CrossLayerValidator.js and server/enforcement/SemanticValidator.js
 */
