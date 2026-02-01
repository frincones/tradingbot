/*
 * ============================================================================
 * TRADINGBOT REALTIME CONFIGURATION
 * Enable Supabase Realtime for trading tables
 * ============================================================================
 */

-- ============================================================================
-- ENABLE REALTIME PUBLICATION
-- ============================================================================

-- Create publication for realtime if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- ============================================================================
-- ADD TABLES TO REALTIME PUBLICATION
-- ============================================================================

-- Core trading tables - high priority for real-time updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.strategies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_intents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;

-- Risk management tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_bumpers_state;

-- Whale tracking tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.whale_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whale_snapshots;

-- AI agent tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_traces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_proposals;

-- Market data cache (for real-time price updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data_cache;

-- ============================================================================
-- REPLICA IDENTITY CONFIGURATION
-- Required for UPDATE and DELETE events in Realtime
-- ============================================================================

-- Set REPLICA IDENTITY to FULL for tables that need complete row data
ALTER TABLE public.strategies REPLICA IDENTITY FULL;
ALTER TABLE public.signals REPLICA IDENTITY FULL;
ALTER TABLE public.trade_intents REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.fills REPLICA IDENTITY FULL;
ALTER TABLE public.positions REPLICA IDENTITY FULL;
ALTER TABLE public.risk_events REPLICA IDENTITY FULL;
ALTER TABLE public.risk_bumpers_state REPLICA IDENTITY FULL;
ALTER TABLE public.whale_events REPLICA IDENTITY FULL;
ALTER TABLE public.whale_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.agent_traces REPLICA IDENTITY FULL;
ALTER TABLE public.agent_proposals REPLICA IDENTITY FULL;
ALTER TABLE public.market_data_cache REPLICA IDENTITY FULL;

-- ============================================================================
-- REALTIME BROADCAST CHANNELS
-- Configuration for custom broadcast channels
-- ============================================================================

-- Note: Broadcast channels are configured at the application level
-- The following channels will be used:

-- 1. trading:signals - Signal detection broadcasts
-- 2. trading:orders - Order status updates
-- 3. trading:positions - Position changes
-- 4. risk:events - Risk event notifications
-- 5. whale:events - Whale activity alerts
-- 6. agent:proposals - AI agent proposals for approval

-- ============================================================================
-- PRESENCE CHANNELS
-- For tracking active users and sessions
-- ============================================================================

-- Note: Presence channels are also configured at the application level
-- The following presence channels will be used:

-- 1. presence:workbench - Track active workbench users
-- 2. presence:trading - Track users with active trading sessions

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON PUBLICATION supabase_realtime IS 'Publication for Supabase Realtime - includes all trading tables for live updates';

