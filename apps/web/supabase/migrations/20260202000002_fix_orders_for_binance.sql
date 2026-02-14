-- ============================================================================
-- FIX ORDERS TABLE FOR BINANCE INTEGRATION
-- Migration: 20260202000002_fix_orders_for_binance.sql
--
-- Issues fixed:
-- 1. intent_id is NOT NULL but Binance orders come from agent_alerts, not trade_intents
-- 2. Need alert_id column to link orders to agent_alerts
-- ============================================================================

-- 1. Make intent_id nullable (Binance orders bypass trade_intents flow)
ALTER TABLE public.orders ALTER COLUMN intent_id DROP NOT NULL;

-- 2. Add alert_id column for linking orders to agent_alerts
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES public.agent_alerts(id);

-- 3. Create index for alert_id lookups
CREATE INDEX IF NOT EXISTS idx_orders_alert_id
  ON public.orders(alert_id)
  WHERE alert_id IS NOT NULL;

-- 4. Add comment
COMMENT ON COLUMN public.orders.alert_id IS 'Link to agent_alert that triggered this order (for AI-driven entries)';
