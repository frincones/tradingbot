/**
 * API Key Schemas
 * Zod validation schemas for API key management
 */

import { z } from 'zod';

// Provider enum
export const ApiProviderSchema = z.enum(['alpaca', 'openai', 'hyperliquid']);

// Add API key input
export const AddApiKeySchema = z.object({
  provider: ApiProviderSchema,
  key_name: z.string().max(100).optional(),
  api_key: z.string().min(10).max(500),
  api_secret: z.string().min(10).max(500).optional(),
});

// Update API key input
export const UpdateApiKeySchema = z.object({
  key_name: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});

// Validate API key input
export const ValidateApiKeySchema = z.object({
  provider: ApiProviderSchema,
  api_key: z.string().min(10).max(500),
  api_secret: z.string().min(10).max(500).optional(),
});

// System config schema
export const SystemConfigSchema = z.object({
  alpaca_paper_enabled: z.boolean().default(true),
  alpaca_live_enabled: z.boolean().default(false),
  enable_whale_tracking: z.boolean().default(true),
  enable_agent_explanations: z.boolean().default(true),
  enable_agent_proposals: z.boolean().default(false),
  notify_on_trade: z.boolean().default(true),
  notify_on_risk_event: z.boolean().default(true),
  notify_on_proposal: z.boolean().default(true),
  notification_channels: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(false),
  }).default({ email: true, push: false }),
});

// Update system config input
export const UpdateSystemConfigSchema = SystemConfigSchema.partial();

