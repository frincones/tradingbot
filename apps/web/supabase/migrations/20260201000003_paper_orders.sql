-- ============================================================================
-- Paper Orders Migration
-- Simulated trading orders for validating agent effectiveness
-- ============================================================================

-- Paper Order Status Type
DO $$ BEGIN
  CREATE TYPE public.paper_order_status AS ENUM (
    'open',
    'closed_tp',
    'closed_sl',
    'closed_manual',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Paper Order Exit Reason Type
DO $$ BEGIN
  CREATE TYPE public.paper_order_exit_reason AS ENUM (
    'take_profit',
    'stop_loss',
    'manual',
    'expired',
    'tp1',
    'tp2',
    'tp3'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Paper Orders Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES public.agent_alerts(id) ON DELETE SET NULL,

  -- Order Details
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20, 8) NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  size_usd DECIMAL(20, 2) NOT NULL,

  -- Risk Management (from agent)
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  take_profit_targets JSONB,

  -- Current State
  status paper_order_status NOT NULL DEFAULT 'open',
  current_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 2),
  unrealized_pnl_pct DECIMAL(10, 4),

  -- Close Details
  exit_price DECIMAL(20, 8),
  exit_time TIMESTAMPTZ,
  realized_pnl DECIMAL(20, 2),
  realized_pnl_pct DECIMAL(10, 4),
  exit_reason paper_order_exit_reason,

  -- Agent Metadata
  agent_confidence DECIMAL(3, 2),
  pattern_type VARCHAR(50),
  thesis_title VARCHAR(200),
  thesis_reasoning TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paper_orders_user_status ON public.paper_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_orders_user_created ON public.paper_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_orders_open ON public.paper_orders(user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_paper_orders_symbol ON public.paper_orders(symbol, status);

-- ============================================================================
-- Paper Trading Stats Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Aggregated Stats
  total_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,

  total_pnl DECIMAL(20, 2) NOT NULL DEFAULT 0,
  avg_win DECIMAL(20, 2) DEFAULT 0,
  avg_loss DECIMAL(20, 2) DEFAULT 0,
  profit_factor DECIMAL(10, 2) DEFAULT 0,
  max_drawdown DECIMAL(20, 2) DEFAULT 0,

  -- Per Pattern Stats (JSONB)
  pattern_stats JSONB NOT NULL DEFAULT '{}',

  -- Streak Info
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  worst_streak INT DEFAULT 0,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trading_stats ENABLE ROW LEVEL SECURITY;

-- Paper Orders: Users can only access their own orders
CREATE POLICY "Users can view own paper orders"
  ON public.paper_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own paper orders"
  ON public.paper_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper orders"
  ON public.paper_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own paper orders"
  ON public.paper_orders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Paper Trading Stats: Users can only access their own stats
CREATE POLICY "Users can view own paper stats"
  ON public.paper_trading_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own paper stats"
  ON public.paper_trading_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper stats"
  ON public.paper_trading_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Updated_at trigger for paper_orders
CREATE TRIGGER set_paper_orders_updated_at
  BEFORE UPDATE ON public.paper_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for paper_trading_stats
CREATE TRIGGER set_paper_trading_stats_updated_at
  BEFORE UPDATE ON public.paper_trading_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Enable Realtime for paper_orders
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_orders;
