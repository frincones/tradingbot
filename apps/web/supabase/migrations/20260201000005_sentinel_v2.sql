/**
 * Sentinel V2 Migration
 * Adds support for dual alert types (RISK_ALERT / TRADE_ALERT) and multi-timeframe context
 */

-- ============================================================================
-- NEW ENUM TYPES
-- ============================================================================

-- Alert type: RISK for warnings, TRADE for entry signals
CREATE TYPE public.alert_type AS ENUM ('RISK_ALERT', 'TRADE_ALERT');

-- Risk alert subtypes
CREATE TYPE public.risk_alert_type AS ENUM (
  'WHALE_SELLING_PRESSURE',
  'WHALE_BUYING_PRESSURE',
  'VOLATILITY_SPIKE',
  'LIQUIDATION_CASCADE_RISK',
  'MARKET_STRESS',
  'MOMENTUM_EXHAUSTION'
);

-- Risk severity levels
CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Alert timeframe
CREATE TYPE public.alert_timeframe AS ENUM ('10m', '1h', '4h');

-- ============================================================================
-- ALTER agent_alerts TABLE
-- ============================================================================

-- Add alert_type column with default for backward compatibility
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS alert_type alert_type NOT NULL DEFAULT 'TRADE_ALERT';

-- Add risk_type column (only for RISK_ALERT)
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_type risk_alert_type;

-- Add risk_level column (only for RISK_ALERT)
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_level risk_level;

-- Add timeframe column
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS timeframe alert_timeframe NOT NULL DEFAULT '10m';

-- Add reference to alert that this one updates
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS updates_alert_id UUID REFERENCES public.agent_alerts(id) ON DELETE SET NULL;

-- Add dual confidence scores
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_confidence DECIMAL(3,2);

ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS setup_confidence DECIMAL(3,2);

-- Add timeframe context JSON
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS timeframe_context JSONB;

-- ============================================================================
-- CONSTRAINTS (soft - allows null for backward compatibility)
-- ============================================================================

-- risk_level is only valid for RISK_ALERT
ALTER TABLE public.agent_alerts
ADD CONSTRAINT chk_risk_level_only_for_risk_alert
CHECK (
  (alert_type = 'RISK_ALERT') OR
  (risk_level IS NULL)
);

-- Note: We don't enforce risk_type NOT NULL for RISK_ALERT to allow gradual migration
-- The application layer handles this validation

-- ============================================================================
-- NEW INDEXES
-- ============================================================================

-- Index for window-based cooldown queries
CREATE INDEX IF NOT EXISTS idx_agent_alerts_window_cooldown
ON public.agent_alerts(user_id, symbol, alert_type, created_at DESC);

-- Index for finding alerts by type
CREATE INDEX IF NOT EXISTS idx_agent_alerts_type
ON public.agent_alerts(alert_type, status);

-- Index for finding alerts that update others
CREATE INDEX IF NOT EXISTS idx_agent_alerts_updates
ON public.agent_alerts(updates_alert_id)
WHERE updates_alert_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.agent_alerts.alert_type IS 'Type of alert: RISK_ALERT for warnings, TRADE_ALERT for entry signals';
COMMENT ON COLUMN public.agent_alerts.risk_type IS 'Specific risk type (only for RISK_ALERT)';
COMMENT ON COLUMN public.agent_alerts.risk_level IS 'Severity level (only for RISK_ALERT)';
COMMENT ON COLUMN public.agent_alerts.timeframe IS 'Analysis timeframe: 10m, 1h, or 4h';
COMMENT ON COLUMN public.agent_alerts.updates_alert_id IS 'Reference to alert that this one updates (for ALERT_UPDATE)';
COMMENT ON COLUMN public.agent_alerts.risk_confidence IS 'Confidence score for risk analysis (0.0-1.0)';
COMMENT ON COLUMN public.agent_alerts.setup_confidence IS 'Confidence score for trade setup analysis (0.0-1.0)';
COMMENT ON COLUMN public.agent_alerts.timeframe_context IS 'Multi-timeframe analysis context JSON';

-- ============================================================================
-- BACKWARD COMPATIBILITY
-- ============================================================================

-- Update existing alerts to have TRADE_ALERT type and setup_confidence from confidence
UPDATE public.agent_alerts
SET
  alert_type = 'TRADE_ALERT',
  setup_confidence = confidence,
  risk_confidence = 0
WHERE alert_type IS NULL OR setup_confidence IS NULL;
