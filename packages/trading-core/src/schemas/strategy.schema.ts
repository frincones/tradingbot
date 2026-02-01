/**
 * Strategy Schemas
 * Zod validation schemas for strategy operations
 */

import { z } from 'zod';

// Strategy mode enum
export const StrategyModeSchema = z.enum(['paper', 'live', 'disabled']);

// Strategy state enum
export const StrategyStateSchema = z.enum([
  'IDLE',
  'SETUP',
  'TRIGGERED',
  'ORDERING',
  'IN_POSITION',
  'EXITING',
  'COOLDOWN',
]);

// Entry configuration
export const EntryConfigSchema = z.object({
  flush_threshold: z.number().min(0).max(1).default(0.7),
  burst_threshold: z.number().min(0).max(1).default(0.8),
  absorption_threshold: z.number().min(0).max(1).default(0.75),
  require_reclaim: z.boolean().default(true),
  require_whale_event: z.boolean().default(false),
});

// Exit configuration
export const ExitConfigSchema = z.object({
  tp_percent: z.number().min(0).max(100).default(2),
  sl_percent: z.number().min(0).max(100).default(1),
  time_stop_minutes: z.number().min(1).max(1440).default(60),
  trailing_stop_enabled: z.boolean().default(false),
  trailing_stop_percent: z.number().min(0).max(100).optional(),
});

// Execution configuration
export const ExecutionConfigSchema = z.object({
  order_type: z.enum(['market', 'limit']).default('market'),
  limit_slippage_percent: z.number().min(0).max(10).optional(),
  limit_timeout_seconds: z.number().min(1).max(300).optional(),
  retry_attempts: z.number().min(0).max(5).default(2),
});

// Risk configuration
export const RiskConfigSchema = z.object({
  max_position_usd: z.number().min(0).default(1000),
  max_daily_loss_usd: z.number().min(0).default(500),
  max_trades_per_day: z.number().min(1).max(100).default(10),
  cooldown_after_loss_minutes: z.number().min(0).max(1440).default(30),
});

// Full strategy configuration
export const StrategyConfigSchema = z.object({
  entry: EntryConfigSchema,
  exit: ExitConfigSchema,
  execution: ExecutionConfigSchema,
  risk: RiskConfigSchema,
});

// Create strategy input
export const CreateStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  symbol: z.string().default('BTC/USD'),
  mode: StrategyModeSchema.default('paper'),
});

// Update strategy input
export const UpdateStrategySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  mode: StrategyModeSchema.optional(),
  symbol: z.string().optional(),
});

// Create strategy version input
export const CreateStrategyVersionSchema = z.object({
  strategy_id: z.string().uuid(),
  config_json: StrategyConfigSchema,
  notes: z.string().max(500).optional(),
});

// Default strategy configuration
export const DEFAULT_STRATEGY_CONFIG = StrategyConfigSchema.parse({
  entry: {},
  exit: {},
  execution: {},
  risk: {},
});

