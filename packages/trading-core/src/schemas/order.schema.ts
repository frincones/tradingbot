/**
 * Order Schemas
 * Zod validation schemas for order operations
 */

import { z } from 'zod';

// Order side enum
export const OrderSideSchema = z.enum(['buy', 'sell']);

// Order type enum
export const OrderTypeSchema = z.enum(['market', 'limit', 'stop_limit']);

// Order status enum
export const OrderStatusSchema = z.enum([
  'pending',
  'submitted',
  'accepted',
  'filled',
  'partially_filled',
  'cancelled',
  'rejected',
  'expired',
]);

// Time in force enum
export const TimeInForceSchema = z.enum(['gtc', 'ioc', 'day', 'fok']);

// Intent status enum
export const IntentStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'executed',
  'cancelled',
  'expired',
]);

// Create trade intent input
export const CreateIntentSchema = z.object({
  strategy_id: z.string().uuid(),
  signal_id: z.string().uuid().optional(),
  side: OrderSideSchema,
  qty_usd: z.number().min(1).max(100000),
  intended_price: z.number().positive().optional(),
});

// Create order input
export const CreateOrderSchema = z.object({
  intent_id: z.string().uuid(),
  strategy_id: z.string().uuid(),
  symbol: z.string().default('BTC/USD'),
  side: OrderSideSchema,
  order_type: OrderTypeSchema,
  qty: z.number().positive(),
  limit_price: z.number().positive().optional(),
  stop_price: z.number().positive().optional(),
  time_in_force: TimeInForceSchema.default('gtc'),
  is_paper: z.boolean().default(true),
});

// Cancel order input
export const CancelOrderSchema = z.object({
  order_id: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

// Order update from broker
export const OrderUpdateSchema = z.object({
  alpaca_order_id: z.string(),
  status: OrderStatusSchema,
  filled_qty: z.number().min(0).optional(),
  filled_avg_price: z.number().positive().optional(),
  submitted_at: z.string().datetime().optional(),
  filled_at: z.string().datetime().optional(),
  cancelled_at: z.string().datetime().optional(),
});

// Fill record from broker
export const FillSchema = z.object({
  order_id: z.string().uuid(),
  alpaca_fill_id: z.string().optional(),
  price: z.number().positive(),
  qty: z.number().positive(),
  notional: z.number().positive(),
  fee: z.number().min(0).default(0),
  filled_at: z.string().datetime(),
});

