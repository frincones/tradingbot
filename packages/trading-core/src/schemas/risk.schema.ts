/**
 * Risk Schemas
 * Zod validation schemas for risk management
 */

import { z } from 'zod';

// Risk severity enum
export const RiskSeveritySchema = z.enum(['info', 'warning', 'critical', 'fatal']);

// Risk event input
export const CreateRiskEventSchema = z.object({
  strategy_id: z.string().uuid().optional(),
  severity: RiskSeveritySchema,
  code: z.string().max(50),
  message: z.string().max(500).optional(),
  details_json: z.record(z.unknown()).optional(),
  action_taken: z.string().max(50).optional(),
});

// Acknowledge risk event
export const AcknowledgeRiskEventSchema = z.object({
  event_id: z.string().uuid(),
});

// Update risk bumpers
export const UpdateRiskBumpersSchema = z.object({
  max_daily_loss_usd: z.number().min(0).optional(),
  max_position_usd: z.number().min(0).optional(),
  max_trades_per_day: z.number().min(1).max(100).optional(),
  cooldown_minutes: z.number().min(0).max(1440).optional(),
});

// Activate kill switch
export const ActivateKillSwitchSchema = z.object({
  reason: z.string().max(100),
});

// Risk check result
export const RiskCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  value: z.number().optional(),
  threshold: z.number().optional(),
});

// Risk assessment result
export const RiskAssessmentSchema = z.object({
  approved: z.boolean(),
  risk_score: z.number().min(0).max(100),
  checks: z.array(RiskCheckSchema),
  summary: z.string(),
});

