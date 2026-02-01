/*
 * ============================================================================
 * TRADINGBOT TRIGGERS & FUNCTIONS
 * Automated database logic for trading operations
 * ============================================================================
 */

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to set user_id from auth context
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_bumpers_state_updated_at
  BEFORE UPDATE ON public.risk_bumpers_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whale_watchlist_updated_at
  BEFORE UPDATE ON public.whale_watchlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SET USER_ID TRIGGERS
-- ============================================================================

CREATE TRIGGER set_strategies_user_id
  BEFORE INSERT ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_positions_user_id
  BEFORE INSERT ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_risk_events_user_id
  BEFORE INSERT ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_risk_bumpers_state_user_id
  BEFORE INSERT ON public.risk_bumpers_state
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_whale_watchlist_user_id
  BEFORE INSERT ON public.whale_watchlist
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_agent_traces_user_id
  BEFORE INSERT ON public.agent_traces
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_agent_proposals_user_id
  BEFORE INSERT ON public.agent_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_daily_metrics_user_id
  BEFORE INSERT ON public.daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_system_config_user_id
  BEFORE INSERT ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_api_keys_user_id
  BEFORE INSERT ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ============================================================================
-- STRATEGY STATE MACHINE
-- ============================================================================

-- Function to handle strategy state transitions
CREATE OR REPLACE FUNCTION public.handle_strategy_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transition BOOLEAN := FALSE;
BEGIN
  -- Update state_updated_at when state changes
  IF OLD.current_state != NEW.current_state THEN
    NEW.state_updated_at = NOW();
  END IF;

  -- Define valid state transitions (using uppercase ENUMs)
  IF OLD.current_state = 'IDLE' AND NEW.current_state IN ('SETUP', 'IDLE') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'SETUP' AND NEW.current_state IN ('TRIGGERED', 'IDLE', 'COOLDOWN') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'TRIGGERED' AND NEW.current_state IN ('ORDERING', 'IDLE', 'COOLDOWN') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'ORDERING' AND NEW.current_state IN ('IN_POSITION', 'IDLE', 'COOLDOWN') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'IN_POSITION' AND NEW.current_state IN ('EXITING', 'IDLE') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'EXITING' AND NEW.current_state IN ('IDLE', 'COOLDOWN') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = 'COOLDOWN' AND NEW.current_state IN ('IDLE', 'SETUP') THEN
    valid_transition := TRUE;
  ELSIF OLD.current_state = NEW.current_state THEN
    valid_transition := TRUE; -- Allow staying in same state
  END IF;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.current_state, NEW.current_state;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_strategy_state_transition
  BEFORE UPDATE OF current_state ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.handle_strategy_state_transition();

-- ============================================================================
-- ORDER LIFECYCLE
-- ============================================================================

-- Function to update order status and strategy state
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update strategy state based on order status
  IF NEW.status = 'filled' AND OLD.status != 'filled' THEN
    UPDATE public.strategies
    SET current_state = 'IN_POSITION'
    WHERE id = NEW.strategy_id;

    -- Update intent status
    UPDATE public.trade_intents
    SET status = 'executed', executed_at = NOW()
    WHERE id = NEW.intent_id;
  ELSIF NEW.status IN ('cancelled', 'rejected') THEN
    UPDATE public.strategies
    SET current_state = 'COOLDOWN'
    WHERE id = NEW.strategy_id;

    -- Update intent status
    UPDATE public.trade_intents
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = NEW.intent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER handle_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change();

-- ============================================================================
-- POSITION MANAGEMENT
-- ============================================================================

-- Function to update position on fill
CREATE OR REPLACE FUNCTION public.update_position_on_fill()
RETURNS TRIGGER AS $$
DECLARE
  order_record RECORD;
  existing_position RECORD;
BEGIN
  -- Get order details
  SELECT * INTO order_record FROM public.orders WHERE id = NEW.order_id;

  -- Check for existing position
  SELECT * INTO existing_position
  FROM public.positions
  WHERE strategy_id = order_record.strategy_id
    AND symbol = order_record.symbol
    AND is_open = TRUE;

  IF existing_position IS NOT NULL THEN
    -- Update existing position
    IF order_record.side = 'buy' THEN
      UPDATE public.positions SET
        qty = qty + NEW.qty,
        avg_entry_price = (avg_entry_price * qty + NEW.price * NEW.qty) / (qty + NEW.qty),
        updated_at = NOW()
      WHERE id = existing_position.id;
    ELSE
      UPDATE public.positions SET
        qty = qty - NEW.qty,
        realized_pnl = realized_pnl + (NEW.price - avg_entry_price) * NEW.qty,
        updated_at = NOW()
      WHERE id = existing_position.id;

      -- Close position if quantity reaches zero
      UPDATE public.positions SET
        is_open = FALSE,
        closed_at = NOW(),
        close_reason = 'filled'
      WHERE id = existing_position.id AND qty <= 0;
    END IF;
  ELSE
    -- Create new position
    INSERT INTO public.positions (
      strategy_id,
      user_id,
      symbol,
      side,
      qty,
      avg_entry_price,
      current_price,
      is_open,
      entry_intent_id,
      entry_order_id,
      entry_at
    )
    SELECT
      order_record.strategy_id,
      s.user_id,
      order_record.symbol,
      order_record.side,
      NEW.qty,
      NEW.price,
      NEW.price,
      TRUE,
      order_record.intent_id,
      order_record.id,
      NOW()
    FROM public.strategies s
    WHERE s.id = order_record.strategy_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_position_on_fill
  AFTER INSERT ON public.fills
  FOR EACH ROW EXECUTE FUNCTION public.update_position_on_fill();

-- ============================================================================
-- RISK MANAGEMENT
-- ============================================================================

-- Function to check risk limits before order
CREATE OR REPLACE FUNCTION public.check_risk_limits()
RETURNS TRIGGER AS $$
DECLARE
  bumpers RECORD;
  open_positions INTEGER;
  strategy_user_id UUID;
BEGIN
  -- Get strategy user_id
  SELECT user_id INTO strategy_user_id
  FROM public.strategies
  WHERE id = NEW.strategy_id;

  -- Get risk bumpers state for today
  SELECT * INTO bumpers
  FROM public.risk_bumpers_state
  WHERE user_id = strategy_user_id
    AND strategy_id = NEW.strategy_id
    AND trading_day = CURRENT_DATE;

  IF bumpers IS NOT NULL THEN
    -- Check if kill switch is active
    IF bumpers.kill_switch_active THEN
      -- Log risk event
      INSERT INTO public.risk_events (
        user_id, strategy_id, severity, code, message
      ) VALUES (
        strategy_user_id, NEW.strategy_id, 'fatal', 'KILL_SWITCH_ACTIVE',
        'Order rejected: Kill switch is active - ' || COALESCE(bumpers.kill_switch_reason, 'Unknown reason')
      );
      RAISE EXCEPTION 'Trading is halted: Kill switch is active';
    END IF;

    -- Check if in cooldown
    IF bumpers.cooldown_until IS NOT NULL AND bumpers.cooldown_until > NOW() THEN
      INSERT INTO public.risk_events (
        user_id, strategy_id, severity, code, message
      ) VALUES (
        strategy_user_id, NEW.strategy_id, 'warning', 'COOLDOWN_ACTIVE',
        'Order rejected: Strategy is in cooldown until ' || bumpers.cooldown_until::text
      );
      RAISE EXCEPTION 'Strategy is in cooldown';
    END IF;
  END IF;

  -- Check max open positions
  SELECT COUNT(*) INTO open_positions
  FROM public.positions
  WHERE user_id = strategy_user_id AND is_open = TRUE;

  -- Limit to 5 max open positions (configurable via strategy config)
  IF open_positions >= 5 THEN
    INSERT INTO public.risk_events (
      user_id, strategy_id, severity, code, message
    ) VALUES (
      strategy_user_id, NEW.strategy_id, 'warning', 'MAX_POSITIONS_REACHED',
      'Max open positions reached: ' || open_positions
    );
    RAISE EXCEPTION 'Maximum open positions reached';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_risk_before_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.check_risk_limits();

-- ============================================================================
-- WHALE TRACKING
-- ============================================================================

-- Function to record whale event when significant change detected
CREATE OR REPLACE FUNCTION public.detect_whale_event()
RETURNS TRIGGER AS $$
DECLARE
  previous_snapshot RECORD;
BEGIN
  -- Only process if marked as significant
  IF NEW.is_significant = TRUE THEN
    -- Auto-create whale event
    INSERT INTO public.whale_events (
      whale_id,
      snapshot_id,
      ts,
      event_type,
      details_json
    ) VALUES (
      NEW.whale_id,
      NEW.id,
      NEW.ts,
      COALESCE(NEW.significance_reason, 'significant_change'),
      NEW.delta_json
    );

    -- Update whale last activity
    UPDATE public.whale_watchlist
    SET last_activity_at = NEW.ts
    WHERE id = NEW.whale_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER detect_whale_event_trigger
  AFTER INSERT ON public.whale_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.detect_whale_event();

-- ============================================================================
-- AUDIT LOGGING
-- ============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  entity_id_val UUID;
BEGIN
  -- Get the entity ID
  IF TG_OP = 'DELETE' THEN
    entity_id_val := OLD.id;
  ELSE
    entity_id_val := NEW.id;
  END IF;

  INSERT INTO public.audit_log (
    user_id,
    ts,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    source
  ) VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    NOW(),
    TG_OP,
    TG_TABLE_NAME,
    entity_id_val,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
    'trigger'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for critical tables
CREATE TRIGGER audit_strategies
  AFTER INSERT OR UPDATE OR DELETE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_positions
  AFTER INSERT OR UPDATE OR DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_risk_events
  AFTER INSERT ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_api_keys
  AFTER INSERT OR UPDATE OR DELETE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get user's active strategy
CREATE OR REPLACE FUNCTION public.get_active_strategy(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR(100),
  current_state strategy_state,
  mode strategy_mode,
  symbol VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name, s.current_state, s.mode, s.symbol
  FROM public.strategies s
  WHERE s.user_id = p_user_id
    AND s.enabled = TRUE
  ORDER BY s.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get position summary
CREATE OR REPLACE FUNCTION public.get_position_summary(p_user_id UUID)
RETURNS TABLE (
  total_positions BIGINT,
  total_exposure NUMERIC,
  unrealized_pnl NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(qty * COALESCE(current_price, avg_entry_price)), 0)::NUMERIC,
    COALESCE(SUM(p.unrealized_pnl), 0)::NUMERIC
  FROM public.positions p
  WHERE p.user_id = p_user_id AND p.is_open = TRUE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to initialize daily risk bumpers
CREATE OR REPLACE FUNCTION public.init_daily_risk_bumpers()
RETURNS TRIGGER AS $$
BEGIN
  -- Create risk bumpers entry for today if it doesn't exist
  INSERT INTO public.risk_bumpers_state (
    user_id,
    strategy_id,
    trading_day,
    daily_loss_usd,
    daily_trades_count,
    kill_switch_active
  ) VALUES (
    NEW.user_id,
    NEW.id,
    CURRENT_DATE,
    0,
    0,
    FALSE
  )
  ON CONFLICT (user_id, strategy_id, trading_day) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER init_strategy_risk_bumpers
  AFTER INSERT ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.init_daily_risk_bumpers();

-- Function to update daily metrics on position close
CREATE OR REPLACE FUNCTION public.update_daily_metrics_on_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_open = FALSE AND OLD.is_open = TRUE THEN
    -- Upsert daily metrics
    INSERT INTO public.daily_metrics (
      user_id,
      strategy_id,
      trading_day,
      total_trades,
      winning_trades,
      losing_trades,
      net_pnl
    ) VALUES (
      NEW.user_id,
      NEW.strategy_id,
      CURRENT_DATE,
      1,
      CASE WHEN NEW.realized_pnl > 0 THEN 1 ELSE 0 END,
      CASE WHEN NEW.realized_pnl <= 0 THEN 1 ELSE 0 END,
      NEW.realized_pnl
    )
    ON CONFLICT (user_id, strategy_id, trading_day) DO UPDATE SET
      total_trades = daily_metrics.total_trades + 1,
      winning_trades = daily_metrics.winning_trades + CASE WHEN NEW.realized_pnl > 0 THEN 1 ELSE 0 END,
      losing_trades = daily_metrics.losing_trades + CASE WHEN NEW.realized_pnl <= 0 THEN 1 ELSE 0 END,
      net_pnl = daily_metrics.net_pnl + NEW.realized_pnl,
      updated_at = NOW();

    -- Update risk bumpers
    UPDATE public.risk_bumpers_state
    SET
      daily_loss_usd = daily_loss_usd + CASE WHEN NEW.realized_pnl < 0 THEN ABS(NEW.realized_pnl) ELSE 0 END,
      daily_trades_count = daily_trades_count + 1,
      updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND strategy_id = NEW.strategy_id
      AND trading_day = CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_metrics_on_position_close
  AFTER UPDATE OF is_open ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_daily_metrics_on_close();

