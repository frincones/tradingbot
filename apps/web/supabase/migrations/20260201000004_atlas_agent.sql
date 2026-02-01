-- ============================================================================
-- Atlas Trade Manager Agent Migration
-- Tables for tracking trade reviews, decisions, and analysis cycles
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Atlas Cycle Type
DO $$ BEGIN
  CREATE TYPE public.atlas_cycle_type AS ENUM ('entry', 'trade');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Global Governor Status
DO $$ BEGIN
  CREATE TYPE public.atlas_governor_status AS ENUM ('NORMAL', 'CAUTION', 'EMERGENCY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Global Governor Action
DO $$ BEGIN
  CREATE TYPE public.atlas_governor_action AS ENUM (
    'NONE',
    'PAUSE_NEW_ENTRIES',
    'REQUIRE_HUMAN_APPROVAL',
    'CLOSE_ALL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Progress Assessment
DO $$ BEGIN
  CREATE TYPE public.atlas_progress_assessment AS ENUM ('GOOD', 'STALLING', 'BAD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Trade Category
DO $$ BEGIN
  CREATE TYPE public.atlas_trade_category AS ENUM ('HOLD', 'DEFEND', 'OPTIMIZE', 'EXIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Action Type
DO $$ BEGIN
  CREATE TYPE public.atlas_action_type AS ENUM (
    'MODIFY_STOP',
    'MODIFY_TP',
    'CLOSE_PARTIAL',
    'CLOSE_ALL',
    'CANCEL_ORDER',
    'REPLACE_ORDER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atlas Decision Status
DO $$ BEGIN
  CREATE TYPE public.atlas_decision_status AS ENUM ('pending', 'executed', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Extend paper_orders for Atlas tracking
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS mfe_usd DECIMAL(20, 2) DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS mae_usd DECIMAL(20, 2) DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS last_review_ts TIMESTAMPTZ;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS original_stop_loss DECIMAL(20, 8);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS original_take_profit DECIMAL(20, 8);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS source VARCHAR(50);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- Atlas Cycles Table
-- Tracks each Atlas analysis cycle (global state)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cycle Metadata
  cycle_id VARCHAR(50) NOT NULL,
  cycle_ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cycle Type: 'entry' (5min) or 'trade' (10min)
  cycle_type atlas_cycle_type NOT NULL DEFAULT 'entry',

  -- Global Governor State
  global_status atlas_governor_status NOT NULL DEFAULT 'NORMAL',
  global_action atlas_governor_action NOT NULL DEFAULT 'NONE',
  global_reasons TEXT[],

  -- Entry Gatekeeping Summary (populated only for cycle_type='entry')
  entries_approved INT NOT NULL DEFAULT 0,
  entries_wait INT NOT NULL DEFAULT 0,
  entries_blocked INT NOT NULL DEFAULT 0,

  -- Trade Management Summary (populated only for cycle_type='trade')
  trades_reviewed INT NOT NULL DEFAULT 0,
  total_actions_proposed INT NOT NULL DEFAULT 0,

  -- Improvement Plan
  improvement_plan_json JSONB,

  -- Full Response (for debugging/audit)
  full_response_json JSONB NOT NULL,

  -- Telemetry
  latency_ms INT,
  tokens_input INT,
  tokens_output INT,
  cost_usd DECIMAL(10, 6),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique constraint on cycle_id per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_cycles_user_cycle_id
  ON public.atlas_cycles(user_id, cycle_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_user_ts
  ON public.atlas_cycles(user_id, cycle_ts DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_status
  ON public.atlas_cycles(user_id, global_status);
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_type
  ON public.atlas_cycles(user_id, cycle_type, cycle_ts DESC);

-- ============================================================================
-- Atlas Reviews Table
-- Tracks each 10-minute review of open trades
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,

  -- Review Metadata
  review_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  cycle_id VARCHAR(50) NOT NULL,

  -- Assessment
  progress_assessment atlas_progress_assessment NOT NULL DEFAULT 'GOOD',
  category atlas_trade_category NOT NULL DEFAULT 'HOLD',

  -- Metrics at Review Time
  mfe_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  mae_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  unrealized_pnl_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  age_sec INT NOT NULL DEFAULT 0,

  -- Actions and Notes (JSONB for flexibility)
  actions_proposed JSONB NOT NULL DEFAULT '[]',
  notes_json JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_user_trade
  ON public.atlas_reviews(user_id, trade_id);
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_trade_ts
  ON public.atlas_reviews(trade_id, review_ts DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_cycle
  ON public.atlas_reviews(cycle_id);

-- ============================================================================
-- Atlas Decisions Table
-- Tracks individual actions proposed by Atlas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  review_id UUID REFERENCES public.atlas_reviews(id) ON DELETE SET NULL,

  -- Action Details
  action_type atlas_action_type NOT NULL,
  payload_json JSONB NOT NULL,

  -- Execution Status
  status atlas_decision_status NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  execution_result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_user_status
  ON public.atlas_decisions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_trade
  ON public.atlas_decisions(trade_id);
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_pending
  ON public.atlas_decisions(user_id) WHERE status = 'pending';

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.atlas_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_decisions ENABLE ROW LEVEL SECURITY;

-- Atlas Cycles Policies
CREATE POLICY "Users can view own atlas cycles"
  ON public.atlas_cycles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own atlas cycles"
  ON public.atlas_cycles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Atlas Reviews Policies
CREATE POLICY "Users can view own atlas reviews"
  ON public.atlas_reviews FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own atlas reviews"
  ON public.atlas_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Atlas Decisions Policies
CREATE POLICY "Users can view own atlas decisions"
  ON public.atlas_decisions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own atlas decisions"
  ON public.atlas_decisions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own atlas decisions"
  ON public.atlas_decisions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Enable Realtime
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.atlas_decisions;
