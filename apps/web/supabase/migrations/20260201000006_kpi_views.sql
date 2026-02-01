-- ============================================================================
-- KPI Views and Functions Migration
-- Real-time KPIs for trading dashboard
-- ============================================================================

-- ============================================================================
-- SECTION 1: Trade KPIs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_trade_kpis AS
SELECT
  user_id,
  -- Volume metrics
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE status = 'open') as open_trades,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as trades_today,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as trades_this_week,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as trades_this_month,

  -- Size metrics
  COALESCE(SUM(size_usd), 0)::DECIMAL(20,2) as total_volume_usd,
  COALESCE(AVG(size_usd), 0)::DECIMAL(20,2) as avg_position_size_usd,
  COALESCE(MAX(size_usd), 0)::DECIMAL(20,2) as max_position_size_usd,

  -- Side distribution
  COUNT(*) FILTER (WHERE side = 'LONG') as long_count,
  COUNT(*) FILTER (WHERE side = 'SHORT') as short_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE side = 'SHORT') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE side = 'LONG')::DECIMAL / COUNT(*) FILTER (WHERE side = 'SHORT'), 2)
    ELSE COUNT(*) FILTER (WHERE side = 'LONG')::DECIMAL
  END as long_short_ratio,

  -- Temporal metrics (for closed trades)
  COALESCE(
    AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60) FILTER (WHERE exit_time IS NOT NULL),
    0
  )::DECIMAL(10,2) as avg_hold_time_minutes,
  COALESCE(
    MIN(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60) FILTER (WHERE exit_time IS NOT NULL),
    0
  )::DECIMAL(10,2) as min_hold_time_minutes,
  COALESCE(
    MAX(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60) FILTER (WHERE exit_time IS NOT NULL),
    0
  )::DECIMAL(10,2) as max_hold_time_minutes

FROM public.paper_orders
GROUP BY user_id;

COMMENT ON VIEW public.v_trade_kpis IS 'Real-time trade KPIs aggregated by user';

-- ============================================================================
-- SECTION 2: P&L KPIs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_pnl_kpis AS
SELECT
  user_id,

  -- Realized P&L
  COALESCE(SUM(realized_pnl), 0)::DECIMAL(20,2) as total_realized_pnl_usd,
  COALESCE(SUM(realized_pnl) FILTER (WHERE exit_time >= CURRENT_DATE), 0)::DECIMAL(20,2) as realized_pnl_today,
  COALESCE(SUM(realized_pnl) FILTER (WHERE exit_time >= CURRENT_DATE - INTERVAL '7 days'), 0)::DECIMAL(20,2) as realized_pnl_this_week,
  COALESCE(SUM(realized_pnl) FILTER (WHERE exit_time >= CURRENT_DATE - INTERVAL '30 days'), 0)::DECIMAL(20,2) as realized_pnl_this_month,

  -- Unrealized P&L
  COALESCE(SUM(unrealized_pnl) FILTER (WHERE status = 'open'), 0)::DECIMAL(20,2) as total_unrealized_pnl_usd,

  -- Win/Loss metrics
  COUNT(*) FILTER (WHERE status != 'open') as closed_trades,
  COUNT(*) FILTER (WHERE realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE realized_pnl <= 0 AND status != 'open') as losing_trades,

  -- Win rate
  CASE
    WHEN COUNT(*) FILTER (WHERE status != 'open') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE realized_pnl > 0)::DECIMAL / COUNT(*) FILTER (WHERE status != 'open') * 100, 2)
    ELSE 0
  END as win_rate,

  -- Profit Factor
  CASE
    WHEN ABS(COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl < 0), 0)) > 0
    THEN ROUND(COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl > 0), 0) / ABS(COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl < 0), 1)), 2)
    ELSE COALESCE(SUM(realized_pnl) FILTER (WHERE realized_pnl > 0), 0)::DECIMAL
  END as profit_factor,

  -- Average win/loss
  COALESCE(AVG(realized_pnl) FILTER (WHERE realized_pnl > 0), 0)::DECIMAL(20,2) as avg_win_usd,
  COALESCE(AVG(realized_pnl) FILTER (WHERE realized_pnl < 0), 0)::DECIMAL(20,2) as avg_loss_usd,

  -- MFE/MAE (Max Favorable/Adverse Excursion)
  COALESCE(AVG(mfe_usd), 0)::DECIMAL(20,2) as avg_mfe_usd,
  COALESCE(AVG(mae_usd), 0)::DECIMAL(20,2) as avg_mae_usd,

  -- Expectancy
  CASE
    WHEN COUNT(*) FILTER (WHERE status != 'open') > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE realized_pnl > 0)::DECIMAL / COUNT(*) FILTER (WHERE status != 'open') * COALESCE(AVG(realized_pnl) FILTER (WHERE realized_pnl > 0), 0)) -
      ((1 - COUNT(*) FILTER (WHERE realized_pnl > 0)::DECIMAL / COUNT(*) FILTER (WHERE status != 'open')) * ABS(COALESCE(AVG(realized_pnl) FILTER (WHERE realized_pnl < 0), 0)))
    , 2)
    ELSE 0
  END as expectancy_usd,

  -- Exit reason distribution
  COUNT(*) FILTER (WHERE exit_reason = 'stop_loss') as sl_exits,
  COUNT(*) FILTER (WHERE exit_reason IN ('take_profit', 'tp1', 'tp2', 'tp3')) as tp_exits,
  COUNT(*) FILTER (WHERE exit_reason = 'manual') as manual_exits,
  COUNT(*) FILTER (WHERE exit_reason = 'expired') as expired_exits

FROM public.paper_orders
GROUP BY user_id;

COMMENT ON VIEW public.v_pnl_kpis IS 'Real-time P&L KPIs aggregated by user';

-- ============================================================================
-- SECTION 3: Sentinel Agent KPIs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_sentinel_kpis AS
SELECT
  aa.user_id,

  -- Alert production
  COUNT(*) as total_alerts,
  COUNT(*) FILTER (WHERE aa.created_at >= CURRENT_DATE) as alerts_today,
  COUNT(*) FILTER (WHERE aa.created_at >= CURRENT_DATE - INTERVAL '7 days') as alerts_this_week,

  -- By decision
  COUNT(*) FILTER (WHERE aa.decision = 'ALERT') as alert_decisions,
  COUNT(*) FILTER (WHERE aa.decision = 'NO_ALERT') as no_alert_decisions,
  COUNT(*) FILTER (WHERE aa.decision = 'NEED_MORE_DATA') as need_data_decisions,

  -- By recommendation
  COUNT(*) FILTER (WHERE aa.recommendation = 'APPROVE') as approve_recommendations,
  COUNT(*) FILTER (WHERE aa.recommendation = 'WAIT') as wait_recommendations,
  COUNT(*) FILTER (WHERE aa.recommendation = 'BLOCK') as block_recommendations,

  -- Average confidence
  COALESCE(AVG(aa.confidence), 0)::DECIMAL(3,2) as avg_confidence,

  -- Status distribution
  COUNT(*) FILTER (WHERE aa.status = 'new') as new_alerts,
  COUNT(*) FILTER (WHERE aa.status = 'viewed') as viewed_alerts,
  COUNT(*) FILTER (WHERE aa.status = 'actioned') as actioned_alerts,
  COUNT(*) FILTER (WHERE aa.status = 'dismissed') as dismissed_alerts,
  COUNT(*) FILTER (WHERE aa.status = 'expired') as expired_alerts,

  -- Conversion (alerts that became paper orders)
  COUNT(DISTINCT po.id) as alerts_converted_to_trades,
  CASE
    WHEN COUNT(*) FILTER (WHERE aa.decision = 'ALERT') > 0
    THEN ROUND(COUNT(DISTINCT po.id)::DECIMAL / COUNT(*) FILTER (WHERE aa.decision = 'ALERT') * 100, 2)
    ELSE 0
  END as conversion_rate

FROM public.agent_alerts aa
LEFT JOIN public.paper_orders po ON po.alert_id = aa.id
GROUP BY aa.user_id;

COMMENT ON VIEW public.v_sentinel_kpis IS 'Real-time Sentinel agent KPIs';

-- ============================================================================
-- SECTION 4: Atlas Entry KPIs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_atlas_entry_kpis AS
SELECT
  user_id,

  -- Cycle metrics
  COUNT(*) as total_cycles,
  COUNT(*) FILTER (WHERE cycle_ts >= CURRENT_DATE) as cycles_today,
  COUNT(*) FILTER (WHERE cycle_ts >= CURRENT_DATE - INTERVAL '7 days') as cycles_this_week,

  -- Entry decisions
  COALESCE(SUM(entries_approved), 0) as total_approved,
  COALESCE(SUM(entries_wait), 0) as total_wait,
  COALESCE(SUM(entries_blocked), 0) as total_blocked,

  -- Approval rate
  CASE
    WHEN COALESCE(SUM(entries_approved + entries_wait + entries_blocked), 0) > 0
    THEN ROUND(SUM(entries_approved)::DECIMAL / SUM(entries_approved + entries_wait + entries_blocked) * 100, 2)
    ELSE 0
  END as approval_rate,

  -- Global Governor events
  COUNT(*) FILTER (WHERE global_status = 'CAUTION') as caution_events,
  COUNT(*) FILTER (WHERE global_status = 'EMERGENCY') as emergency_events,
  COUNT(*) FILTER (WHERE global_action != 'NONE') as action_events,

  -- Performance
  COALESCE(AVG(latency_ms), 0)::INT as avg_latency_ms,
  COALESCE(SUM(cost_usd), 0)::DECIMAL(10,4) as total_cost_usd,
  COALESCE(SUM(tokens_input), 0) as total_tokens_input,
  COALESCE(SUM(tokens_output), 0) as total_tokens_output

FROM public.atlas_cycles
WHERE cycle_type = 'entry'
GROUP BY user_id;

COMMENT ON VIEW public.v_atlas_entry_kpis IS 'Real-time Atlas Entry Gatekeeping KPIs';

-- ============================================================================
-- SECTION 5: Atlas Trade Manager KPIs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_atlas_trade_kpis AS
SELECT
  ac.user_id,

  -- Cycle metrics
  COUNT(DISTINCT ac.id) as total_cycles,
  COUNT(DISTINCT ac.id) FILTER (WHERE ac.cycle_ts >= CURRENT_DATE) as cycles_today,

  -- Trade reviews
  COALESCE(SUM(ac.trades_reviewed), 0) as total_trades_reviewed,

  -- Categories from reviews
  COUNT(ar.id) FILTER (WHERE ar.category = 'HOLD') as hold_count,
  COUNT(ar.id) FILTER (WHERE ar.category = 'DEFEND') as defend_count,
  COUNT(ar.id) FILTER (WHERE ar.category = 'OPTIMIZE') as optimize_count,
  COUNT(ar.id) FILTER (WHERE ar.category = 'EXIT') as exit_count,

  -- Actions
  COALESCE(SUM(ac.total_actions_proposed), 0) as total_actions_proposed,
  COUNT(ad.id) FILTER (WHERE ad.status = 'executed') as actions_executed,
  COUNT(ad.id) FILTER (WHERE ad.status = 'failed') as actions_failed,
  COUNT(ad.id) FILTER (WHERE ad.status = 'skipped') as actions_skipped,

  -- Action types
  COUNT(ad.id) FILTER (WHERE ad.action_type = 'MODIFY_STOP') as modify_stop_actions,
  COUNT(ad.id) FILTER (WHERE ad.action_type = 'MODIFY_TP') as modify_tp_actions,
  COUNT(ad.id) FILTER (WHERE ad.action_type = 'CLOSE_PARTIAL') as close_partial_actions,
  COUNT(ad.id) FILTER (WHERE ad.action_type = 'CLOSE_ALL') as close_all_actions,

  -- Performance
  COALESCE(AVG(ac.latency_ms), 0)::INT as avg_latency_ms,
  COALESCE(SUM(ac.cost_usd), 0)::DECIMAL(10,4) as total_cost_usd

FROM public.atlas_cycles ac
LEFT JOIN public.atlas_reviews ar ON ar.cycle_id = ac.cycle_id AND ar.user_id = ac.user_id
LEFT JOIN public.atlas_decisions ad ON ad.review_id = ar.id
WHERE ac.cycle_type = 'trade'
GROUP BY ac.user_id;

COMMENT ON VIEW public.v_atlas_trade_kpis IS 'Real-time Atlas Trade Manager KPIs';

-- ============================================================================
-- SECTION 6: Pattern Performance View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_pattern_performance AS
SELECT
  po.user_id,
  po.pattern_type,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE po.realized_pnl > 0) as winning_trades,
  COUNT(*) FILTER (WHERE po.realized_pnl <= 0 AND po.status != 'open') as losing_trades,
  CASE
    WHEN COUNT(*) FILTER (WHERE po.status != 'open') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE po.realized_pnl > 0)::DECIMAL / COUNT(*) FILTER (WHERE po.status != 'open') * 100, 2)
    ELSE 0
  END as win_rate,
  COALESCE(SUM(po.realized_pnl), 0)::DECIMAL(20,2) as total_pnl,
  COALESCE(AVG(po.realized_pnl) FILTER (WHERE po.status != 'open'), 0)::DECIMAL(20,2) as avg_pnl,
  COALESCE(AVG(po.agent_confidence), 0)::DECIMAL(3,2) as avg_confidence,
  COALESCE(
    AVG(EXTRACT(EPOCH FROM (po.exit_time - po.entry_time)) / 60) FILTER (WHERE po.exit_time IS NOT NULL),
    0
  )::DECIMAL(10,2) as avg_hold_time_minutes
FROM public.paper_orders po
WHERE po.pattern_type IS NOT NULL
GROUP BY po.user_id, po.pattern_type;

COMMENT ON VIEW public.v_pattern_performance IS 'Performance metrics by pattern type';

-- ============================================================================
-- SECTION 7: Combined Agent Costs View
-- ============================================================================

CREATE OR REPLACE VIEW public.v_agent_costs AS
SELECT
  user_id,

  -- From agent_traces
  COALESCE(SUM(cost_usd) FILTER (WHERE agent_name = 'sentinel'), 0)::DECIMAL(10,4) as sentinel_cost_usd,
  COALESCE(SUM(tokens_input) FILTER (WHERE agent_name = 'sentinel'), 0) as sentinel_tokens_input,
  COALESCE(SUM(tokens_output) FILTER (WHERE agent_name = 'sentinel'), 0) as sentinel_tokens_output,
  COALESCE(AVG(latency_ms) FILTER (WHERE agent_name = 'sentinel'), 0)::INT as sentinel_avg_latency_ms,
  COUNT(*) FILTER (WHERE agent_name = 'sentinel') as sentinel_calls,

  -- Total
  COALESCE(SUM(cost_usd), 0)::DECIMAL(10,4) as total_cost_usd,
  COALESCE(SUM(tokens_input), 0) as total_tokens_input,
  COALESCE(SUM(tokens_output), 0) as total_tokens_output

FROM public.agent_traces
GROUP BY user_id;

COMMENT ON VIEW public.v_agent_costs IS 'Agent costs and token usage';

-- ============================================================================
-- SECTION 8: Main KPI Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_all_kpis(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  trade_kpis JSONB;
  pnl_kpis JSONB;
  sentinel_kpis JSONB;
  atlas_entry_kpis JSONB;
  atlas_trade_kpis JSONB;
  agent_costs JSONB;
  pattern_performance JSONB;
BEGIN
  -- Trade KPIs
  SELECT COALESCE(row_to_json(t)::jsonb, '{}'::jsonb) INTO trade_kpis
  FROM public.v_trade_kpis t WHERE user_id = p_user_id;

  -- P&L KPIs
  SELECT COALESCE(row_to_json(p)::jsonb, '{}'::jsonb) INTO pnl_kpis
  FROM public.v_pnl_kpis p WHERE user_id = p_user_id;

  -- Sentinel KPIs
  SELECT COALESCE(row_to_json(s)::jsonb, '{}'::jsonb) INTO sentinel_kpis
  FROM public.v_sentinel_kpis s WHERE user_id = p_user_id;

  -- Atlas Entry KPIs
  SELECT COALESCE(row_to_json(ae)::jsonb, '{}'::jsonb) INTO atlas_entry_kpis
  FROM public.v_atlas_entry_kpis ae WHERE user_id = p_user_id;

  -- Atlas Trade KPIs
  SELECT COALESCE(row_to_json(at)::jsonb, '{}'::jsonb) INTO atlas_trade_kpis
  FROM public.v_atlas_trade_kpis at WHERE user_id = p_user_id;

  -- Agent Costs
  SELECT COALESCE(row_to_json(ac)::jsonb, '{}'::jsonb) INTO agent_costs
  FROM public.v_agent_costs ac WHERE user_id = p_user_id;

  -- Pattern Performance (as array)
  SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb) INTO pattern_performance
  FROM public.v_pattern_performance pp WHERE user_id = p_user_id;

  -- Build result
  result := jsonb_build_object(
    'trades', COALESCE(trade_kpis, '{}'::jsonb),
    'pnl', COALESCE(pnl_kpis, '{}'::jsonb),
    'sentinel', COALESCE(sentinel_kpis, '{}'::jsonb),
    'atlas_entry', COALESCE(atlas_entry_kpis, '{}'::jsonb),
    'atlas_trade', COALESCE(atlas_trade_kpis, '{}'::jsonb),
    'agent_costs', COALESCE(agent_costs, '{}'::jsonb),
    'pattern_performance', COALESCE(pattern_performance, '[]'::jsonb),
    'generated_at', NOW()
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.fn_get_all_kpis IS 'Get all KPIs for a user as JSONB';

-- ============================================================================
-- SECTION 9: Equity Snapshots Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  equity_usd DECIMAL(20,2) NOT NULL DEFAULT 0,
  realized_pnl_cumulative DECIMAL(20,2) NOT NULL DEFAULT 0,
  unrealized_pnl DECIMAL(20,2) NOT NULL DEFAULT 0,
  open_positions_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equity_snapshots_user_ts
ON public.equity_snapshots(user_id, ts DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equity_snapshots_user_ts_unique
ON public.equity_snapshots(user_id, date_trunc('hour', ts AT TIME ZONE 'UTC'));

COMMENT ON TABLE public.equity_snapshots IS 'Hourly equity snapshots for equity curve';

-- RLS
ALTER TABLE public.equity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own equity snapshots"
  ON public.equity_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own equity snapshots"
  ON public.equity_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SECTION 10: Equity Curve Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_equity_curve(
  p_user_id UUID,
  p_period INTERVAL DEFAULT '7 days'
)
RETURNS TABLE(
  bucket TIMESTAMPTZ,
  equity_usd DECIMAL,
  realized_pnl DECIMAL,
  unrealized_pnl DECIMAL,
  open_positions INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('hour', es.ts) as bucket,
    AVG(es.equity_usd)::DECIMAL(20,2) as equity_usd,
    AVG(es.realized_pnl_cumulative)::DECIMAL(20,2) as realized_pnl,
    AVG(es.unrealized_pnl)::DECIMAL(20,2) as unrealized_pnl,
    MAX(es.open_positions_count) as open_positions
  FROM public.equity_snapshots es
  WHERE es.user_id = p_user_id
    AND es.ts > NOW() - p_period
  GROUP BY date_trunc('hour', es.ts)
  ORDER BY bucket;
END;
$$;

COMMENT ON FUNCTION public.fn_get_equity_curve IS 'Get equity curve data for charting';

-- ============================================================================
-- SECTION 11: Trigger to Auto-Create Equity Snapshot on Trade Close
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_equity_on_trade_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_realized_total DECIMAL(20,2);
  v_unrealized_total DECIMAL(20,2);
  v_open_count INT;
BEGIN
  -- Only trigger on status change to closed
  IF OLD.status = 'open' AND NEW.status != 'open' THEN
    -- Calculate totals
    SELECT
      COALESCE(SUM(realized_pnl), 0),
      COALESCE(SUM(unrealized_pnl) FILTER (WHERE status = 'open'), 0),
      COUNT(*) FILTER (WHERE status = 'open')
    INTO v_realized_total, v_unrealized_total, v_open_count
    FROM public.paper_orders
    WHERE user_id = NEW.user_id;

    -- Insert or update equity snapshot
    INSERT INTO public.equity_snapshots (
      user_id,
      ts,
      equity_usd,
      realized_pnl_cumulative,
      unrealized_pnl,
      open_positions_count
    ) VALUES (
      NEW.user_id,
      NOW(),
      v_realized_total + v_unrealized_total,
      v_realized_total,
      v_unrealized_total,
      v_open_count
    )
    ON CONFLICT (user_id, date_trunc('hour', ts AT TIME ZONE 'UTC'))
    DO UPDATE SET
      equity_usd = EXCLUDED.equity_usd,
      realized_pnl_cumulative = EXCLUDED.realized_pnl_cumulative,
      unrealized_pnl = EXCLUDED.unrealized_pnl,
      open_positions_count = EXCLUDED.open_positions_count;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_update_equity_on_trade_close ON public.paper_orders;

CREATE TRIGGER trg_update_equity_on_trade_close
  AFTER UPDATE ON public.paper_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_equity_on_trade_close();

-- ============================================================================
-- SECTION 12: Grant Permissions
-- ============================================================================

-- Grant select on views to authenticated users
GRANT SELECT ON public.v_trade_kpis TO authenticated;
GRANT SELECT ON public.v_pnl_kpis TO authenticated;
GRANT SELECT ON public.v_sentinel_kpis TO authenticated;
GRANT SELECT ON public.v_atlas_entry_kpis TO authenticated;
GRANT SELECT ON public.v_atlas_trade_kpis TO authenticated;
GRANT SELECT ON public.v_pattern_performance TO authenticated;
GRANT SELECT ON public.v_agent_costs TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.fn_get_all_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_equity_curve TO authenticated;
