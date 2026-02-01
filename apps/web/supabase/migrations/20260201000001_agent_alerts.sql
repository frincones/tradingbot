/**
 * Agent Alerts Table
 * Stores AI-generated trading alerts from LiquidationPattern Sentinel
 */

-- Alert decision types
CREATE TYPE public.alert_decision AS ENUM ('ALERT', 'NO_ALERT', 'NEED_MORE_DATA');

-- Alert recommendation types
CREATE TYPE public.alert_recommendation AS ENUM ('APPROVE', 'WAIT', 'BLOCK');

-- Alert status lifecycle
CREATE TYPE public.alert_status AS ENUM ('new', 'viewed', 'dismissed', 'actioned', 'expired');

-- Main alerts table
CREATE TABLE public.agent_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  agent_trace_id UUID REFERENCES public.agent_traces(id) ON DELETE SET NULL,

  -- Timestamp and symbol
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  symbol VARCHAR(20) NOT NULL,

  -- Alert classification
  decision alert_decision NOT NULL,
  setup setup_type NOT NULL, -- Reuses existing LONG/SHORT/NONE enum

  -- Pattern detection details
  pattern_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"type": "FLUSH_RECLAIM", "flush_score": 85, "burst_score": 72, "confirmations": {...}}

  -- Investment thesis
  thesis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"title": "...", "reasoning": "...", "supporting_factors": [...], "risk_factors": [...]}

  -- Execution candidate (nullable - only for APPROVE recommendations)
  execution_json JSONB,
  -- Example: {"entry_zone": {"min": X, "max": Y}, "stop_loss": Z, "take_profit": W, "position_size_pct": 2}

  -- Agent assessment
  confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  recommendation alert_recommendation NOT NULL,
  risk_notes TEXT[] DEFAULT '{}',

  -- Status tracking
  status alert_status NOT NULL DEFAULT 'new',
  viewed_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  action_taken VARCHAR(50), -- 'executed', 'modified', 'ignored'
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comment
COMMENT ON TABLE public.agent_alerts IS 'AI-generated trading alerts from LiquidationPattern Sentinel agent';

-- Indexes for efficient querying
CREATE INDEX idx_agent_alerts_user_status ON public.agent_alerts(user_id, status, ts DESC);
CREATE INDEX idx_agent_alerts_user_ts ON public.agent_alerts(user_id, ts DESC);
CREATE INDEX idx_agent_alerts_symbol ON public.agent_alerts(symbol, ts DESC);
CREATE INDEX idx_agent_alerts_new ON public.agent_alerts(user_id) WHERE status = 'new';
CREATE INDEX idx_agent_alerts_recommendation ON public.agent_alerts(recommendation) WHERE status = 'new';

-- Auto-update updated_at trigger
CREATE TRIGGER update_agent_alerts_updated_at
  BEFORE UPDATE ON public.agent_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-expire old alerts function
CREATE OR REPLACE FUNCTION public.expire_old_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agent_alerts
  SET status = 'expired', updated_at = now()
  WHERE status IN ('new', 'viewed')
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- RLS Policies
ALTER TABLE public.agent_alerts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own alerts
CREATE POLICY "Users can view own alerts"
  ON public.agent_alerts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own alerts (status changes)
CREATE POLICY "Users can update own alerts"
  ON public.agent_alerts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only service role can insert alerts (from API)
CREATE POLICY "Service role can insert alerts"
  ON public.agent_alerts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can delete their own alerts
CREATE POLICY "Users can delete own alerts"
  ON public.agent_alerts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_alerts;

-- Set replica identity for realtime
ALTER TABLE public.agent_alerts REPLICA IDENTITY FULL;
