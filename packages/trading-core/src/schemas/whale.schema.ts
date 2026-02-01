/**
 * Whale Schemas
 * Zod validation schemas for whale tracking
 */

import { z } from 'zod';

// Whale status enum
export const WhaleStatusSchema = z.enum(['active', 'inactive', 'archived']);

// Add whale input
export const AddWhaleSchema = z.object({
  address: z.string().min(10).max(100),
  label: z.string().max(100).optional(),
  source: z.string().max(50).default('manual'),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// Update whale input
export const UpdateWhaleSchema = z.object({
  label: z.string().max(100).optional(),
  status: WhaleStatusSchema.optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// Whale position schema
export const WhalePositionSchema = z.object({
  symbol: z.string(),
  size: z.number(),
  side: z.enum(['long', 'short']),
  entry_price: z.number().positive(),
  current_price: z.number().positive(),
  unrealized_pnl: z.number(),
  leverage: z.number().min(1).max(100),
});

// Whale state schema
export const WhaleStateSchema = z.object({
  positions: z.array(WhalePositionSchema),
  total_value_usd: z.number(),
  total_pnl_usd: z.number(),
  margin_used: z.number().min(0),
  margin_available: z.number().min(0),
});

// Whale position change schema
export const WhalePositionChangeSchema = z.object({
  symbol: z.string(),
  old_size: z.number(),
  new_size: z.number(),
  size_change: z.number(),
  size_change_percent: z.number(),
});

// Whale delta schema
export const WhaleDeltaSchema = z.object({
  positions_opened: z.array(WhalePositionSchema),
  positions_closed: z.array(WhalePositionSchema),
  positions_increased: z.array(WhalePositionChangeSchema),
  positions_decreased: z.array(WhalePositionChangeSchema),
  total_value_change: z.number(),
});

// Create snapshot input
export const CreateSnapshotSchema = z.object({
  whale_id: z.string().uuid(),
  state_json: WhaleStateSchema,
  delta_json: WhaleDeltaSchema.optional(),
  is_significant: z.boolean().default(false),
  significance_reason: z.string().max(100).optional(),
});

