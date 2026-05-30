// server/schemas/stage1.schema.js
// Zod schema for Stage 1 — Intent Extraction output contract

import { z } from 'zod';

export const NonFunctionalSchema = z.object({
  scalability: z.enum(['low', 'medium', 'high']),
  security: z.enum(['low', 'medium', 'high']),
  performance: z.enum(['low', 'medium', 'high']),
  availability: z.string().min(1),
});

export const ActorSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['user', 'admin', 'system', 'guest']),
  permissions: z.array(z.string()).min(1),
});

export const Stage1Schema = z.object({
  intent_type: z.enum(['web_app', 'api_service', 'dashboard', 'mobile_app', 'saas_platform', 'cli_tool']),
  domain: z.string().min(1),
  primary_goal: z.string().min(1),
  features: z.array(z.string().min(1)).min(2),
  actors: z.array(ActorSchema).min(1),
  data_needs: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string()),
  integrations: z.array(z.string()),
  non_functional: NonFunctionalSchema,
});

/**
 * Semantic validation rules are now handled by the enforcement layer.
 * See: server/enforcement/ContractDefinitions.js (RULE-001 through RULE-004)
 * and server/enforcement/SemanticValidator.js
 */
