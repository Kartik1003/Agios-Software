// server/schemas/stage4.schema.js
// Zod schema for Stage 4 — Refinement Layer output contract

import { z } from 'zod';

const IssueSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(['ERROR', 'WARN', 'INFO']),
  layer: z.enum(['intent', 'design', 'schema', 'cross-layer']),
  description: z.string().min(1),
  auto_resolved: z.boolean(),
  resolution: z.string().nullable(),
});

const ValidationReportSchema = z.object({
  overall_status: z.enum(['PASS', 'WARN', 'FAIL']),
  confidence_score: z.number().min(0).max(100),
  issues: z.array(IssueSchema),
});

const CrossLayerCheckSchema = z.object({
  check: z.string().min(1),
  layers_involved: z.array(z.string()).min(1),
  status: z.enum(['PASS', 'FAIL']),
  detail: z.string().min(1),
});

const RefinementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['gap_fill', 'conflict_resolution', 'optimization', 'auto_add']),
  affected_layer: z.enum(['design', 'schema', 'cross-layer']),
  description: z.string().min(1),
  before: z.string(),
  after: z.string(),
});

const ExecutableConfigSchema = z.object({
  start: z.string().min(1),
  build: z.string().min(1),
  test: z.string().min(1),
  required_env_vars: z.array(z.string()),
  docker_base: z.string().min(1),
});

const FinalSpecSchema = z.object({
  project_name: z.string().min(1),
  version: z.string().min(1),
  summary: z.string().min(1),
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'ENTERPRISE']),
  estimated_dev_time: z.string().min(1),
  team_size_recommendation: z.string().min(1),
  deployment_target: z.string().min(1),
  deployment_ready: z.boolean(),
  executable_config: ExecutableConfigSchema,
  next_steps: z.array(z.string()).min(1),
});

export const Stage4Schema = z.object({
  validation_report: ValidationReportSchema,
  cross_layer_checks: z.array(CrossLayerCheckSchema).min(1),
  applied_refinements: z.array(RefinementSchema),
  final_spec: FinalSpecSchema,
});

/**
 * Semantic validation rules are now handled by the enforcement layer.
 * See: server/enforcement/ContractDefinitions.js (RULE-018 through RULE-020)
 * and server/enforcement/SemanticValidator.js
 */
