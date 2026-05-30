// server/schemas/stage2.schema.js
// Zod schema for Stage 2 — System Design output contract

import { z } from 'zod';

export const ModuleSchema = z.object({
  name: z.string().min(1),
  layer: z.string().min(1), // Relaxed from enum to allow LLM flexibility
  responsibility: z.string().min(1),
  exposes: z.array(z.string()),
  depends_on: z.array(z.string()),
});

export const AttributeSchema = z.object({
  field: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  indexed: z.boolean(),
});

export const RelationshipSchema = z.object({
  target: z.string().min(1),
  cardinality: z.string().min(1), // Relaxed from strict enum
  label: z.string().min(1),
});

export const EntitySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  attributes: z.array(AttributeSchema).min(1),
  relationships: z.array(RelationshipSchema),
});

export const UserFlowSchema = z.object({
  name: z.string().min(1),
  actors: z.array(z.string()).min(1),
  trigger: z.string().min(1),
  steps: z.array(z.string()).min(1),
  outcome: z.string().min(1),
});

export const RoleSchema = z.object({
  name: z.string().min(1),
  level: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  restrictions: z.array(z.string()),
});

export const TechStackSchema = z.object({
  frontend: z.string().min(1),
  backend: z.string().min(1),
  database: z.string().min(1),
  cache: z.string().nullable().optional(), // Allow null/missing cache
  auth_provider: z.string().min(1),
  hosting: z.string().min(1),
});

export const Stage2Schema = z.object({
  app_name: z.string().min(1),
  description: z.string().min(1),
  architecture_pattern: z.string().min(1), // Relaxed from enum
  modules: z.array(ModuleSchema).min(3),
  entities: z.array(EntitySchema).min(1),
  user_flows: z.array(UserFlowSchema).min(1),
  roles: z.array(RoleSchema).min(1),
  tech_stack: TechStackSchema,
});

/**
 * Semantic and cross-layer validation rules are now handled by the enforcement layer.
 * See: server/enforcement/ContractDefinitions.js (RULE-005 through RULE-009)
 * and server/enforcement/CrossLayerValidator.js
 */
