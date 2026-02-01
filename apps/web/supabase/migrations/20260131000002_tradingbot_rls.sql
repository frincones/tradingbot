/*
 * ============================================================================
 * TRADINGBOT RLS POLICIES
 * Row Level Security for all trading tables
 * ============================================================================
 */

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_bumpers_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STRATEGIES POLICIES
-- ============================================================================

CREATE POLICY "strategies_select" ON public.strategies
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "strategies_insert" ON public.strategies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "strategies_update" ON public.strategies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "strategies_delete" ON public.strategies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- STRATEGY VERSIONS POLICIES
-- ============================================================================

CREATE POLICY "strategy_versions_select" ON public.strategy_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "strategy_versions_insert" ON public.strategy_versions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- ============================================================================
-- SIGNALS POLICIES
-- ============================================================================

CREATE POLICY "signals_select" ON public.signals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- ============================================================================
-- TRADE INTENTS POLICIES
-- ============================================================================

CREATE POLICY "trade_intents_select" ON public.trade_intents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- ============================================================================
-- FILLS POLICIES
-- ============================================================================

CREATE POLICY "fills_select" ON public.fills
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.strategies s ON s.id = o.strategy_id
    WHERE o.id = order_id AND s.user_id = auth.uid()
  ));

-- ============================================================================
-- POSITIONS POLICIES
-- ============================================================================

CREATE POLICY "positions_select" ON public.positions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- RISK EVENTS POLICIES
-- ============================================================================

CREATE POLICY "risk_events_select" ON public.risk_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.strategies s
      WHERE s.id = strategy_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "risk_events_update" ON public.risk_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- RISK BUMPERS STATE POLICIES
-- ============================================================================

CREATE POLICY "risk_bumpers_state_select" ON public.risk_bumpers_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "risk_bumpers_state_update" ON public.risk_bumpers_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- WHALE WATCHLIST POLICIES
-- ============================================================================

CREATE POLICY "whale_watchlist_all" ON public.whale_watchlist
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- WHALE SNAPSHOTS POLICIES
-- ============================================================================

CREATE POLICY "whale_snapshots_select" ON public.whale_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whale_watchlist w
    WHERE w.id = whale_id AND w.user_id = auth.uid()
  ));

-- ============================================================================
-- WHALE EVENTS POLICIES
-- ============================================================================

CREATE POLICY "whale_events_select" ON public.whale_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whale_watchlist w
    WHERE w.id = whale_id AND w.user_id = auth.uid()
  ));

-- ============================================================================
-- AGENT TRACES POLICIES
-- ============================================================================

CREATE POLICY "agent_traces_select" ON public.agent_traces
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- AGENT PROPOSALS POLICIES
-- ============================================================================

CREATE POLICY "agent_proposals_select" ON public.agent_proposals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "agent_proposals_update" ON public.agent_proposals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- MARKET DATA CACHE POLICIES (readable by all authenticated)
-- ============================================================================

CREATE POLICY "market_data_cache_select" ON public.market_data_cache
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- DAILY METRICS POLICIES
-- ============================================================================

CREATE POLICY "daily_metrics_select" ON public.daily_metrics
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- SYSTEM CONFIG POLICIES
-- ============================================================================

CREATE POLICY "system_config_all" ON public.system_config
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- API KEYS POLICIES
-- ============================================================================

CREATE POLICY "api_keys_all" ON public.api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- AUDIT LOG POLICIES
-- ============================================================================

CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- SERVICE ROLE POLICIES (for backend microservices)
-- ============================================================================

CREATE POLICY "service_role_strategies" ON public.strategies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_strategy_versions" ON public.strategy_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_signals" ON public.signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_trade_intents" ON public.trade_intents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_orders" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_fills" ON public.fills
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_positions" ON public.positions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_risk_events" ON public.risk_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_risk_bumpers_state" ON public.risk_bumpers_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_whale_watchlist" ON public.whale_watchlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_whale_snapshots" ON public.whale_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_whale_events" ON public.whale_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_agent_traces" ON public.agent_traces
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_agent_proposals" ON public.agent_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_market_data_cache" ON public.market_data_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_daily_metrics" ON public.daily_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_system_config" ON public.system_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_api_keys" ON public.api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_audit_log" ON public.audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Grant all permissions on trading tables to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
