# 📋 PLAN DE TRABAJO COMPLETO — Tradingbot Agentic AI

**Versión:** 1.0
**Fecha:** 2026-01-31
**Stack:** Next.js 15 + Supabase + Render + Hyperliquid + Alpaca + OpenAI

---

## 📌 RESUMEN EJECUTIVO

Este plan cubre el **100% de la implementación** del PRD técnico para construir una plataforma de trading automatizado que:

1. **Ingesta datos** de Hyperliquid (WebSocket + Info API)
2. **Genera señales** (flush, burst, whale events)
3. **Ejecuta órdenes** en Alpaca (BTC/USD, paper → live)
4. **Usa agentes OpenAI** para explicabilidad, supervisión y reportes
5. **Muestra dashboard** con auditoría completa y control total

---

## 🏗️ ARQUITECTURA DE IMPLEMENTACIÓN

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Vercel)                               │
│  Next.js 15 App Router + React 19 + Shadcn/UI + TailwindCSS                 │
│  ├── Dashboard (signals, positions, orders, PnL)                            │
│  ├── Strategy Management (config, enable/disable)                           │
│  ├── Risk Controls (bumpers, kill switch)                                   │
│  ├── Whale Watchlist (manual + auto discovery)                              │
│  ├── Agent Console (chat, explanations, proposals)                          │
│  └── Audit Trail (full trade history)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE (Cloud)                                   │
│  PostgreSQL + Auth + Realtime + Storage + Edge Functions                    │
│  ├── Tables: strategies, signals, intents, orders, fills, positions, etc.  │
│  ├── RLS: user_id/strategy_id scoping                                       │
│  ├── Realtime: live updates → dashboard                                     │
│  └── Edge Functions: lightweight webhooks                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MICROSERVICIOS (Render)                               │
│  Always-on Node.js/TypeScript services                                      │
│  ├── hl-market-ingestor (WebSocket HL → features)                           │
│  ├── feature-signal-engine (calcular scores → signals)                      │
│  ├── strategy-engine (state machine: IDLE → IN_POSITION → ...)             │
│  ├── whale-tracker (watchlist + deltas)                                     │
│  ├── risk-engine (bumpers, kill switch)                                     │
│  ├── alpaca-execution-engine (orders → Alpaca API)                          │
│  ├── agent-orchestrator (OpenAI Responses + Agents SDK)                     │
│  └── scheduler (cron: refresh, aggregations, reports)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   HYPERLIQUID API   │  │     ALPACA API      │  │     OPENAI API      │
│  WebSocket + Info   │  │  Trading (paper/    │  │  Responses API +    │
│  (market data,      │  │  live) + Streaming  │  │  Agents SDK         │
│  whale positions)   │  │  Market Data        │  │  (explanations,     │
│                     │  │                     │  │   supervision)      │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## 📊 FASE 0: SUPABASE DATABASE SCHEMA

### 0.1 Migración Principal — Tablas Core

**Archivo:** `apps/web/supabase/migrations/20260131_tradingbot_schema.sql`

```sql
-- ============================================================================
-- TRADINGBOT SCHEMA v1.0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------

CREATE TYPE public.strategy_mode AS ENUM ('paper', 'live', 'disabled');
CREATE TYPE public.setup_type AS ENUM ('LONG', 'SHORT', 'NONE');
CREATE TYPE public.intent_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired');
CREATE TYPE public.order_status AS ENUM ('pending', 'submitted', 'accepted', 'filled', 'partially_filled', 'cancelled', 'rejected', 'expired');
CREATE TYPE public.order_type AS ENUM ('market', 'limit', 'stop_limit');
CREATE TYPE public.order_side AS ENUM ('buy', 'sell');
CREATE TYPE public.time_in_force AS ENUM ('gtc', 'ioc', 'day', 'fok');
CREATE TYPE public.risk_severity AS ENUM ('info', 'warning', 'critical', 'fatal');
CREATE TYPE public.whale_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE public.strategy_state AS ENUM ('IDLE', 'SETUP', 'TRIGGERED', 'ORDERING', 'IN_POSITION', 'EXITING', 'COOLDOWN');

-- ----------------------------------------------------------------------------
-- 2. STRATEGIES (Configuración de estrategias)
-- ----------------------------------------------------------------------------

CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  mode strategy_mode NOT NULL DEFAULT 'paper',
  symbol VARCHAR(20) NOT NULL DEFAULT 'BTC/USD',

  -- State machine
  current_state strategy_state NOT NULL DEFAULT 'IDLE',
  state_updated_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, name)
);

-- ----------------------------------------------------------------------------
-- 3. STRATEGY VERSIONS (Historial de configuración)
-- ----------------------------------------------------------------------------

CREATE TABLE public.strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Thresholds de entrada
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    config_json structure:
    {
      "entry": {
        "flush_threshold": 0.75,
        "burst_threshold": 0.70,
        "absorption_threshold": 0.60,
        "require_reclaim": true,
        "require_whale_event": false
      },
      "exit": {
        "tp_percent": 2.0,
        "sl_percent": 1.0,
        "time_stop_minutes": 60,
        "trailing_stop_enabled": false,
        "trailing_stop_percent": 0.5
      },
      "execution": {
        "order_type": "market",
        "limit_slippage_percent": 0.1,
        "limit_timeout_seconds": 30,
        "retry_attempts": 3
      },
      "risk": {
        "max_position_usd": 1000,
        "max_daily_loss_usd": 500,
        "max_trades_per_day": 10,
        "cooldown_after_loss_minutes": 15
      }
    }
  */

  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(strategy_id, version)
);

-- ----------------------------------------------------------------------------
-- 4. SIGNALS (Señales generadas por el engine)
-- ----------------------------------------------------------------------------

CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  setup setup_type NOT NULL,

  -- Scores calculados
  scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    {
      "flush": 0.82,
      "burst": 0.74,
      "absorption": 0.63,
      "momentum": 0.55
    }
  */

  -- Confirmaciones
  confirmations_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    {
      "reclaim": true,
      "whale_event": false,
      "volume_spike": true
    }
  */

  -- Niveles clave
  levels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    {
      "key_level": 102450.5,
      "entry_price": 102400.0,
      "stop_loss": 101400.0,
      "take_profit": 104400.0
    }
  */

  -- Raw data snapshot
  raw_data_ref TEXT, -- S3/storage reference for full snapshot

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para queries por tiempo
CREATE INDEX idx_signals_strategy_ts ON public.signals(strategy_id, ts DESC);

-- ----------------------------------------------------------------------------
-- 5. TRADE INTENTS (Intenciones de trade antes de ejecución)
-- ----------------------------------------------------------------------------

CREATE TABLE public.trade_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES public.signals(id),

  -- Intent details
  side order_side NOT NULL,
  qty_usd DECIMAL(18, 2) NOT NULL,
  intended_price DECIMAL(18, 8),

  -- Status
  status intent_status NOT NULL DEFAULT 'pending',

  -- Risk decision
  risk_decision JSONB,
  /*
    {
      "approved": true,
      "reasons": [],
      "checked_at": "2026-01-31T...",
      "bumpers_state": {...}
    }
  */

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Idempotency
  idempotency_key VARCHAR(100) UNIQUE
);

CREATE INDEX idx_intents_strategy ON public.trade_intents(strategy_id, created_at DESC);
CREATE INDEX idx_intents_status ON public.trade_intents(status) WHERE status IN ('pending', 'approved');

-- ----------------------------------------------------------------------------
-- 6. ORDERS (Órdenes enviadas a Alpaca)
-- ----------------------------------------------------------------------------

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES public.trade_intents(id),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,

  -- Alpaca order info
  alpaca_order_id VARCHAR(100) UNIQUE,
  client_order_id VARCHAR(100) UNIQUE NOT NULL,

  -- Order details
  symbol VARCHAR(20) NOT NULL DEFAULT 'BTC/USD',
  side order_side NOT NULL,
  order_type order_type NOT NULL,
  qty DECIMAL(18, 8) NOT NULL,
  limit_price DECIMAL(18, 8),
  stop_price DECIMAL(18, 8),
  time_in_force time_in_force NOT NULL DEFAULT 'gtc',

  -- Status
  status order_status NOT NULL DEFAULT 'pending',
  filled_qty DECIMAL(18, 8) DEFAULT 0,
  filled_avg_price DECIMAL(18, 8),

  -- Metadata
  is_paper BOOLEAN NOT NULL DEFAULT true,
  raw_request JSONB,
  raw_response JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_strategy ON public.orders(strategy_id, created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(status) WHERE status NOT IN ('filled', 'cancelled', 'rejected');

-- ----------------------------------------------------------------------------
-- 7. FILLS (Ejecuciones de órdenes)
-- ----------------------------------------------------------------------------

CREATE TABLE public.fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Alpaca fill info
  alpaca_fill_id VARCHAR(100) UNIQUE,

  -- Fill details
  price DECIMAL(18, 8) NOT NULL,
  qty DECIMAL(18, 8) NOT NULL,
  notional DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 8) DEFAULT 0,

  -- Timestamps
  filled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Raw data
  raw_data JSONB
);

CREATE INDEX idx_fills_order ON public.fills(order_id);

-- ----------------------------------------------------------------------------
-- 8. POSITIONS (Estado actual de posiciones)
-- ----------------------------------------------------------------------------

CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Position details
  symbol VARCHAR(20) NOT NULL DEFAULT 'BTC/USD',
  side order_side,
  qty DECIMAL(18, 8) NOT NULL DEFAULT 0,
  avg_entry_price DECIMAL(18, 8),
  current_price DECIMAL(18, 8),

  -- PnL
  unrealized_pnl DECIMAL(18, 2) DEFAULT 0,
  realized_pnl DECIMAL(18, 2) DEFAULT 0,

  -- Entry info
  entry_intent_id UUID REFERENCES public.trade_intents(id),
  entry_order_id UUID REFERENCES public.orders(id),
  entry_at TIMESTAMPTZ,

  -- Exit targets
  stop_loss_price DECIMAL(18, 8),
  take_profit_price DECIMAL(18, 8),

  -- Status
  is_open BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  close_reason VARCHAR(50), -- 'tp', 'sl', 'time_stop', 'manual', 'kill_switch'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(strategy_id, symbol)
);

CREATE INDEX idx_positions_open ON public.positions(strategy_id) WHERE is_open = true;

-- ----------------------------------------------------------------------------
-- 9. RISK EVENTS (Eventos de riesgo y bumpers)
-- ----------------------------------------------------------------------------

CREATE TABLE public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity risk_severity NOT NULL,
  code VARCHAR(50) NOT NULL,
  /*
    Codes:
    - DAILY_LOSS_LIMIT_HIT
    - MAX_TRADES_REACHED
    - COOLDOWN_ACTIVE
    - KILL_SWITCH_TRIGGERED
    - SPREAD_TOO_WIDE
    - DRIFT_GUARD_BLOCKED
    - WS_DISCONNECTED
    - ALPACA_REJECTION
    - POSITION_SIZE_EXCEEDED
  */

  message TEXT,
  details_json JSONB,

  -- Actions taken
  action_taken VARCHAR(50), -- 'blocked_entry', 'closed_position', 'paused_strategy'
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_events_strategy ON public.risk_events(strategy_id, ts DESC);
CREATE INDEX idx_risk_events_severity ON public.risk_events(severity, ts DESC) WHERE severity IN ('critical', 'fatal');

-- ----------------------------------------------------------------------------
-- 10. RISK BUMPERS STATE (Estado actual de bumpers por usuario)
-- ----------------------------------------------------------------------------

CREATE TABLE public.risk_bumpers_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,

  -- Daily counters (reset at midnight UTC)
  trading_day DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_loss_usd DECIMAL(18, 2) NOT NULL DEFAULT 0,
  daily_trades_count INTEGER NOT NULL DEFAULT 0,

  -- Cooldown
  cooldown_until TIMESTAMPTZ,
  cooldown_reason VARCHAR(50),

  -- Kill switch
  kill_switch_active BOOLEAN NOT NULL DEFAULT false,
  kill_switch_reason VARCHAR(100),
  kill_switch_at TIMESTAMPTZ,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, strategy_id, trading_day)
);

-- ----------------------------------------------------------------------------
-- 11. WHALE WATCHLIST (Wallets de whales a monitorear)
-- ----------------------------------------------------------------------------

CREATE TABLE public.whale_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  address VARCHAR(100) NOT NULL,
  label VARCHAR(100),
  source VARCHAR(50) NOT NULL DEFAULT 'manual', -- 'manual', 'batch_discovery', 'auto_discovery'

  -- Scoring
  score DECIMAL(5, 2) DEFAULT 0, -- 0-100
  rank INTEGER,

  -- Status
  status whale_status NOT NULL DEFAULT 'active',

  -- Notes
  notes TEXT,
  tags VARCHAR(50)[],

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ,

  UNIQUE(user_id, address)
);

CREATE INDEX idx_whale_watchlist_user ON public.whale_watchlist(user_id, status);

-- ----------------------------------------------------------------------------
-- 12. WHALE SNAPSHOTS (Estado histórico de posiciones de whales)
-- ----------------------------------------------------------------------------

CREATE TABLE public.whale_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_id UUID NOT NULL REFERENCES public.whale_watchlist(id) ON DELETE CASCADE,

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- State snapshot
  state_json JSONB NOT NULL,
  /*
    {
      "positions": [
        {"coin": "BTC", "size": 10.5, "entry_price": 102000, "pnl": 5000}
      ],
      "account_value": 1500000,
      "margin_used": 0.45
    }
  */

  -- Delta from previous
  delta_json JSONB,
  /*
    {
      "position_changes": [
        {"coin": "BTC", "size_change": 2.5, "action": "increased"}
      ],
      "value_change_percent": 0.5
    }
  */

  -- Significance
  is_significant BOOLEAN DEFAULT false,
  significance_reason VARCHAR(100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whale_snapshots_whale ON public.whale_snapshots(whale_id, ts DESC);
CREATE INDEX idx_whale_snapshots_significant ON public.whale_snapshots(ts DESC) WHERE is_significant = true;

-- ----------------------------------------------------------------------------
-- 13. WHALE EVENTS (Eventos significativos detectados)
-- ----------------------------------------------------------------------------

CREATE TABLE public.whale_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_id UUID NOT NULL REFERENCES public.whale_watchlist(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.whale_snapshots(id),

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type VARCHAR(50) NOT NULL,
  /*
    Event types:
    - LARGE_POSITION_OPENED
    - LARGE_POSITION_CLOSED
    - SIGNIFICANT_INCREASE
    - SIGNIFICANT_DECREASE
    - DIRECTION_CHANGE
    - HIGH_LEVERAGE_DETECTED
  */

  symbol VARCHAR(20),
  direction VARCHAR(10), -- 'long', 'short'

  details_json JSONB,

  -- Impact on strategy
  used_as_confirmation BOOLEAN DEFAULT false,
  used_in_signal_id UUID REFERENCES public.signals(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whale_events_ts ON public.whale_events(ts DESC);

-- ----------------------------------------------------------------------------
-- 14. AGENT TRACES (Trazas de agentes OpenAI)
-- ----------------------------------------------------------------------------

CREATE TABLE public.agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Agent info
  agent_name VARCHAR(50) NOT NULL,
  /*
    Agents:
    - signal_explainer
    - risk_sentinel
    - strategy_tuner
    - ops_copilot
    - report_generator
  */

  -- Context
  intent_id UUID REFERENCES public.trade_intents(id),
  signal_id UUID REFERENCES public.signals(id),

  -- Input/Output
  input_summary TEXT,
  input_ref TEXT, -- S3/storage reference for full input
  output_json JSONB NOT NULL,
  /*
    {
      "explanation": "The trade was entered because...",
      "rationale": {...},
      "confidence": 0.85,
      "suggestions": [...]
    }
  */

  -- Evaluation
  eval_score DECIMAL(3, 2), -- 0-1
  eval_feedback TEXT,

  -- Cost tracking
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd DECIMAL(10, 6),
  latency_ms INTEGER,

  -- Model info
  model_used VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_traces_user ON public.agent_traces(user_id, ts DESC);
CREATE INDEX idx_agent_traces_agent ON public.agent_traces(agent_name, ts DESC);

-- ----------------------------------------------------------------------------
-- 15. AGENT PROPOSALS (Propuestas de cambios por agentes)
-- ----------------------------------------------------------------------------

CREATE TABLE public.agent_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  agent_trace_id UUID REFERENCES public.agent_traces(id),

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Proposal
  proposal_type VARCHAR(50) NOT NULL, -- 'config_change', 'pause_strategy', 'resume_strategy'
  title VARCHAR(200) NOT NULL,
  description TEXT,

  -- Changes proposed
  current_config JSONB,
  proposed_config JSONB,
  diff_summary TEXT,

  -- Rationale
  rationale TEXT,
  expected_impact TEXT,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'

  -- Review
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  review_notes TEXT,

  -- Applied
  applied_at TIMESTAMPTZ,
  applied_version_id UUID REFERENCES public.strategy_versions(id),

  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_pending ON public.agent_proposals(user_id, status) WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- 16. MARKET DATA CACHE (Cache de datos de mercado para features)
-- ----------------------------------------------------------------------------

CREATE TABLE public.market_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  symbol VARCHAR(20) NOT NULL,
  data_type VARCHAR(30) NOT NULL, -- 'candle_1m', 'candle_5m', 'orderbook', 'trades'

  ts TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL,

  -- Source
  source VARCHAR(20) NOT NULL DEFAULT 'hyperliquid',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Partitioned by time for efficient cleanup
CREATE INDEX idx_market_data_symbol_ts ON public.market_data_cache(symbol, data_type, ts DESC);

-- Auto-cleanup old data (keep 24h)
CREATE OR REPLACE FUNCTION cleanup_old_market_data()
RETURNS void AS $$
BEGIN
  DELETE FROM public.market_data_cache WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 17. DAILY METRICS (Métricas diarias agregadas)
-- ----------------------------------------------------------------------------

CREATE TABLE public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE,

  trading_day DATE NOT NULL,

  -- Trade metrics
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,

  -- PnL
  gross_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0,
  fees_paid DECIMAL(18, 2) NOT NULL DEFAULT 0,
  net_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0,

  -- Risk metrics
  max_drawdown DECIMAL(18, 2) DEFAULT 0,
  max_position_size DECIMAL(18, 2) DEFAULT 0,

  -- Signal metrics
  signals_generated INTEGER DEFAULT 0,
  signals_executed INTEGER DEFAULT 0,
  signals_rejected INTEGER DEFAULT 0,

  -- Performance
  win_rate DECIMAL(5, 2), -- percentage
  avg_win DECIMAL(18, 2),
  avg_loss DECIMAL(18, 2),
  profit_factor DECIMAL(8, 2),
  sharpe_ratio DECIMAL(8, 4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, strategy_id, trading_day)
);

CREATE INDEX idx_daily_metrics_user ON public.daily_metrics(user_id, trading_day DESC);

-- ----------------------------------------------------------------------------
-- 18. SYSTEM CONFIG (Configuración global del sistema)
-- ----------------------------------------------------------------------------

CREATE TABLE public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Alpaca config
  alpaca_paper_enabled BOOLEAN NOT NULL DEFAULT true,
  alpaca_live_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Feature flags
  enable_whale_tracking BOOLEAN NOT NULL DEFAULT true,
  enable_agent_explanations BOOLEAN NOT NULL DEFAULT true,
  enable_agent_proposals BOOLEAN NOT NULL DEFAULT false,

  -- Notification preferences
  notify_on_trade BOOLEAN NOT NULL DEFAULT true,
  notify_on_risk_event BOOLEAN NOT NULL DEFAULT true,
  notify_on_proposal BOOLEAN NOT NULL DEFAULT true,
  notification_channels JSONB DEFAULT '{"email": true, "push": false}'::jsonb,

  -- API keys (encrypted references, not actual keys)
  alpaca_key_ref VARCHAR(100),
  openai_key_ref VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- ----------------------------------------------------------------------------
-- 19. API KEYS (Almacenamiento seguro de API keys)
-- ----------------------------------------------------------------------------

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider VARCHAR(30) NOT NULL, -- 'alpaca_paper', 'alpaca_live', 'openai', 'hyperliquid'
  key_name VARCHAR(100), -- user-friendly name

  -- Encrypted values (encrypt at app level, not in DB)
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_valid BOOLEAN, -- null = not tested, true/false after validation
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,

  -- Usage tracking
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, provider)
);

-- ----------------------------------------------------------------------------
-- 20. AUDIT LOG (Log completo de auditoría)
-- ----------------------------------------------------------------------------

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),

  ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  action VARCHAR(50) NOT NULL,
  /*
    Actions:
    - strategy.created, strategy.updated, strategy.enabled, strategy.disabled
    - order.submitted, order.filled, order.cancelled
    - position.opened, position.closed
    - risk.bumper_hit, risk.kill_switch
    - config.updated
    - proposal.approved, proposal.rejected
  */

  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,

  -- Change details
  old_value JSONB,
  new_value JSONB,

  -- Context
  ip_address INET,
  user_agent TEXT,

  -- Source
  source VARCHAR(30) NOT NULL DEFAULT 'user', -- 'user', 'system', 'agent', 'api'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON public.audit_log(user_id, ts DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id, ts DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
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
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Strategies policies
CREATE POLICY "Users can view own strategies"
  ON public.strategies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strategies"
  ON public.strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategies"
  ON public.strategies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strategies"
  ON public.strategies FOR DELETE
  USING (auth.uid() = user_id);

-- Strategy versions policies
CREATE POLICY "Users can view own strategy versions"
  ON public.strategy_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own strategy versions"
  ON public.strategy_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- Similar policies for all other tables...
-- (Applying user_id or strategy.user_id based access)

-- Signals policies
CREATE POLICY "Users can view own signals"
  ON public.signals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- Trade intents policies
CREATE POLICY "Users can view own intents"
  ON public.trade_intents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- Orders policies
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- Fills policies
CREATE POLICY "Users can view own fills"
  ON public.fills FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.strategies s ON s.id = o.strategy_id
    WHERE o.id = order_id AND s.user_id = auth.uid()
  ));

-- Positions policies
CREATE POLICY "Users can view own positions"
  ON public.positions FOR SELECT
  USING (user_id = auth.uid());

-- Risk events policies
CREATE POLICY "Users can view own risk events"
  ON public.risk_events FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.strategies s
    WHERE s.id = strategy_id AND s.user_id = auth.uid()
  ));

-- Whale watchlist policies
CREATE POLICY "Users can manage own whale watchlist"
  ON public.whale_watchlist FOR ALL
  USING (user_id = auth.uid());

-- System config policies
CREATE POLICY "Users can manage own system config"
  ON public.system_config FOR ALL
  USING (user_id = auth.uid());

-- API keys policies
CREATE POLICY "Users can manage own API keys"
  ON public.api_keys FOR ALL
  USING (user_id = auth.uid());

-- Audit log - read only for users
CREATE POLICY "Users can view own audit log"
  ON public.audit_log FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- SERVICE ROLE POLICIES (for backend microservices)
-- ============================================================================

-- Allow service_role to access all data
CREATE POLICY "Service role full access strategies"
  ON public.strategies FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access signals"
  ON public.signals FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access intents"
  ON public.trade_intents FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access orders"
  ON public.orders FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access fills"
  ON public.fills FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access positions"
  ON public.positions FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access risk_events"
  ON public.risk_events FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access market_data"
  ON public.market_data_cache FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- TRIGGERS Y FUNCIONES
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to relevant tables
CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Initialize user config on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_tradingbot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.system_config (user_id)
  VALUES (NEW.id);

  INSERT INTO public.risk_bumpers_state (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_tradingbot
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tradingbot();

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_traces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_proposals;

-- ============================================================================
-- INDEXES ADICIONALES PARA PERFORMANCE
-- ============================================================================

-- Composite indexes for common queries
CREATE INDEX idx_orders_intent_status ON public.orders(intent_id, status);
CREATE INDEX idx_positions_user_open ON public.positions(user_id, is_open) WHERE is_open = true;
CREATE INDEX idx_risk_events_unacked ON public.risk_events(user_id, acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_proposals_user_pending ON public.agent_proposals(user_id, status) WHERE status = 'pending';

-- Full text search on agent traces
CREATE INDEX idx_agent_traces_output_gin ON public.agent_traces USING gin(output_json);
```

---

## 📊 FASE 0: RESUMEN DE TABLAS

| Tabla | Propósito | Campos Clave |
|-------|-----------|--------------|
| `strategies` | Config de estrategias | user_id, name, mode, current_state |
| `strategy_versions` | Historial de config | config_json (thresholds) |
| `signals` | Señales generadas | scores_json, confirmations_json, levels_json |
| `trade_intents` | Intenciones pre-ejecución | side, qty_usd, status, risk_decision |
| `orders` | Órdenes enviadas a Alpaca | alpaca_order_id, status, filled_qty |
| `fills` | Ejecuciones | price, qty, fee |
| `positions` | Estado de posiciones | qty, pnl, is_open |
| `risk_events` | Eventos de riesgo | severity, code, action_taken |
| `risk_bumpers_state` | Estado de bumpers | daily_loss, trades_count, kill_switch |
| `whale_watchlist` | Wallets de whales | address, score, status |
| `whale_snapshots` | Snapshots de posiciones | state_json, delta_json |
| `whale_events` | Eventos significativos | event_type, used_as_confirmation |
| `agent_traces` | Trazas de agentes | agent_name, output_json, tokens |
| `agent_proposals` | Propuestas de cambios | proposal_type, status |
| `market_data_cache` | Cache de market data | symbol, data_type, data_json |
| `daily_metrics` | Métricas agregadas | pnl, win_rate, sharpe |
| `system_config` | Config global usuario | feature flags, notifications |
| `api_keys` | API keys encriptadas | provider, encrypted values |
| `audit_log` | Auditoría completa | action, entity, old/new values |

---

## 🔧 FASE 1: BACKEND MICROSERVICIOS (Render)

### 1.1 Estructura de Packages para Microservicios

**Nueva estructura a crear:**

```
packages/
├── core/                      # Shared core utilities
│   ├── src/
│   │   ├── supabase/         # Supabase service client
│   │   ├── types/            # Shared TypeScript types
│   │   ├── schemas/          # Zod schemas compartidos
│   │   ├── utils/            # Utilities (retry, backoff, etc.)
│   │   └── logger/           # Structured logging
│   └── package.json
│
├── trading-engine/            # Trading logic shared
│   ├── src/
│   │   ├── features/         # Feature calculators
│   │   ├── signals/          # Signal generators
│   │   ├── strategy/         # State machine
│   │   ├── risk/             # Risk engine
│   │   └── execution/        # Order execution
│   └── package.json
│
├── integrations/              # External API clients
│   ├── src/
│   │   ├── hyperliquid/      # HL WebSocket + Info client
│   │   ├── alpaca/           # Alpaca trading client
│   │   └── openai/           # OpenAI Agents SDK wrapper
│   └── package.json
│
└── agents/                    # OpenAI Agents definitions
    ├── src/
    │   ├── explainer/        # Signal Explainer Agent
    │   ├── sentinel/         # Risk Sentinel Agent
    │   ├── tuner/            # Strategy Tuner Agent
    │   ├── copilot/          # Ops Copilot Agent
    │   └── reporter/         # Report Generator Agent
    └── package.json
```

### 1.2 Servicios a Implementar (Render)

**Directorio: `services/`** (nuevo directorio en raíz)

```
services/
├── hl-market-ingestor/       # WebSocket HL → Supabase
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── websocket.ts      # WS connection manager
│   │   ├── handlers/         # Message handlers
│   │   │   ├── trades.ts
│   │   │   ├── candles.ts
│   │   │   ├── orderbook.ts
│   │   │   └── user.ts
│   │   ├── normalizer.ts     # Event normalization
│   │   └── publisher.ts      # Publish to Supabase
│   ├── Dockerfile
│   └── package.json
│
├── feature-signal-engine/    # Feature calculation + Signal generation
│   ├── src/
│   │   ├── index.ts
│   │   ├── features/
│   │   │   ├── flush.ts      # Flush score calculator
│   │   │   ├── burst.ts      # Burst proxy calculator
│   │   │   ├── reclaim.ts    # Reclaim detector
│   │   │   ├── absorption.ts # Absorption score
│   │   │   └── momentum.ts   # Additional momentum features
│   │   ├── signals/
│   │   │   ├── generator.ts  # Signal generation logic
│   │   │   └── validator.ts  # Signal validation
│   │   └── subscriber.ts     # Supabase realtime subscriber
│   ├── Dockerfile
│   └── package.json
│
├── strategy-engine/          # Strategy state machine
│   ├── src/
│   │   ├── index.ts
│   │   ├── state-machine.ts  # XState or custom FSM
│   │   ├── states/
│   │   │   ├── idle.ts
│   │   │   ├── setup.ts
│   │   │   ├── triggered.ts
│   │   │   ├── ordering.ts
│   │   │   ├── in-position.ts
│   │   │   ├── exiting.ts
│   │   │   └── cooldown.ts
│   │   ├── transitions/      # Transition logic
│   │   └── evaluators/       # Entry/Exit rule evaluators
│   ├── Dockerfile
│   └── package.json
│
├── whale-tracker/            # Whale monitoring service
│   ├── src/
│   │   ├── index.ts
│   │   ├── watchlist.ts      # Watchlist management
│   │   ├── snapshot.ts       # Position snapshot fetcher
│   │   ├── delta.ts          # Delta calculator
│   │   ├── events.ts         # Event detector
│   │   └── discovery.ts      # Auto-discovery of whales
│   ├── Dockerfile
│   └── package.json
│
├── risk-engine/              # Risk management + Bumpers
│   ├── src/
│   │   ├── index.ts
│   │   ├── bumpers/
│   │   │   ├── daily-loss.ts
│   │   │   ├── max-trades.ts
│   │   │   ├── position-size.ts
│   │   │   ├── cooldown.ts
│   │   │   ├── spread-guard.ts
│   │   │   └── drift-guard.ts
│   │   ├── kill-switch.ts    # Kill switch logic
│   │   ├── evaluator.ts      # Intent approval/rejection
│   │   └── reconciler.ts     # State reconciliation
│   ├── Dockerfile
│   └── package.json
│
├── alpaca-execution-engine/  # Order execution
│   ├── src/
│   │   ├── index.ts
│   │   ├── executor.ts       # Order submission
│   │   ├── reconciler.ts     # Order status reconciliation
│   │   ├── fill-handler.ts   # Fill processing
│   │   ├── position-sync.ts  # Position state sync
│   │   └── stream.ts         # (Optional) Market data stream
│   ├── Dockerfile
│   └── package.json
│
├── agent-orchestrator/       # OpenAI Agents
│   ├── src/
│   │   ├── index.ts
│   │   ├── agents/
│   │   │   ├── explainer.ts  # Trade explanation
│   │   │   ├── sentinel.ts   # Risk monitoring
│   │   │   ├── tuner.ts      # Config proposals
│   │   │   ├── copilot.ts    # Ops Q&A
│   │   │   └── reporter.ts   # Report generation
│   │   ├── tools/            # Function tools for agents
│   │   │   ├── get-signals.ts
│   │   │   ├── get-trades.ts
│   │   │   ├── get-risk-events.ts
│   │   │   └── propose-config.ts
│   │   ├── orchestrator.ts   # Agent routing
│   │   └── schemas/          # Structured output schemas
│   ├── Dockerfile
│   └── package.json
│
└── scheduler/                # Cron jobs
    ├── src/
    │   ├── index.ts
    │   ├── jobs/
    │   │   ├── refresh-watchlist.ts    # Whale watchlist refresh
    │   │   ├── daily-aggregation.ts    # Daily metrics
    │   │   ├── cleanup-cache.ts        # Market data cleanup
    │   │   ├── generate-report.ts      # Daily/weekly reports
    │   │   └── validate-api-keys.ts    # API key validation
    │   └── scheduler.ts      # Cron scheduler (node-cron)
    ├── Dockerfile
    └── package.json
```

### 1.3 Detalle de Cada Microservicio

#### 1.3.1 hl-market-ingestor

**Responsabilidad:** Conectar a Hyperliquid WebSocket, recibir datos de mercado, normalizar y publicar a Supabase.

**Flujo:**
1. Establecer conexión WS a `wss://api.hyperliquid.xyz/ws`
2. Suscribirse a: `allMids`, `trades:BTC`, `l2Book:BTC`, `candle:BTC:1m`
3. Parsear mensajes según tipo
4. Normalizar a schema interno
5. Insertar en `market_data_cache` (batch para performance)
6. Emitir eventos vía Supabase Realtime

**Endpoints de Health:**
- `GET /health` - Status del servicio
- `GET /ws-status` - Estado de conexión WS

**Reconexión:**
- Backoff exponencial (1s, 2s, 4s, 8s, 16s, max 60s)
- Logging de disconnects
- Alertas si reconexión falla 5+ veces

---

#### 1.3.2 feature-signal-engine

**Responsabilidad:** Calcular features en tiempo real y generar señales.

**Features a calcular:**

| Feature | Descripción | Inputs |
|---------|-------------|--------|
| `flush_score` | Velocidad + expansión de rango + ruptura nivel | trades, candles |
| `burst_proxy_score` | Aceleración de prints + stress | trades, volume |
| `reclaim_flag` | Recuperación de nivel clave | price, key_levels |
| `absorption_score` | Imbalance en L2 + prints | orderbook, trades |
| `momentum_score` | Momentum adicional | candles, volume |

**Signal Generation Logic:**
```typescript
interface Signal {
  strategy_id: string;
  ts: Date;
  setup: 'LONG' | 'SHORT' | 'NONE';
  scores: {
    flush: number;
    burst: number;
    absorption: number;
    momentum: number;
  };
  confirmations: {
    reclaim: boolean;
    whale_event: boolean;
    volume_spike: boolean;
  };
  levels: {
    key_level: number;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
  };
}
```

---

#### 1.3.3 strategy-engine

**Responsabilidad:** Máquina de estados para cada estrategia.

**Estados:**
```
IDLE → SETUP → TRIGGERED → ORDERING → IN_POSITION → EXITING → COOLDOWN → IDLE
                    ↓                      ↓
                 (rejected)            (time_stop)
```

**Transiciones:**
- `IDLE → SETUP`: Signal con setup != NONE
- `SETUP → TRIGGERED`: Scores >= thresholds + confirmations
- `TRIGGERED → ORDERING`: Risk engine approves intent
- `ORDERING → IN_POSITION`: Order filled
- `IN_POSITION → EXITING`: TP/SL/time_stop/invalidation
- `EXITING → COOLDOWN`: Exit order filled
- `COOLDOWN → IDLE`: Cooldown period ends

---

#### 1.3.4 whale-tracker

**Responsabilidad:** Monitorear wallets de whales y detectar eventos significativos.

**Funciones:**
1. **Watchlist Management**
   - Agregar/remover direcciones
   - Score ranking basado en actividad

2. **Snapshot Fetching**
   - Polling cada 1-5 minutos (configurable)
   - Usar HL Info API para posiciones

3. **Delta Detection**
   - Comparar snapshot actual vs anterior
   - Detectar cambios significativos (>10% position change)

4. **Event Generation**
   - `LARGE_POSITION_OPENED`
   - `SIGNIFICANT_INCREASE`
   - `DIRECTION_CHANGE`

---

#### 1.3.5 risk-engine

**Responsabilidad:** Validar intents, aplicar bumpers, manejar kill switch.

**Bumpers:**

| Bumper | Descripción | Action |
|--------|-------------|--------|
| `daily_loss_limit` | Max pérdida diaria | Reject + cooldown |
| `max_trades_per_day` | Max trades diarios | Reject |
| `position_size_limit` | Max tamaño posición | Reduce size or reject |
| `cooldown_after_loss` | Cooldown tras pérdida | Reject during cooldown |
| `spread_guard` | Max spread permitido | Reject if spread too wide |
| `drift_guard` | HL vs Alpaca price drift | Reject if drift > threshold |

**Kill Switch:**
- Activación manual o automática
- Cierra posiciones abiertas (configurable)
- Bloquea todas las entradas
- Notifica al usuario

---

#### 1.3.6 alpaca-execution-engine

**Responsabilidad:** Ejecutar órdenes en Alpaca, reconciliar estado.

**Flujo de Ejecución:**
1. Recibir intent aprobado
2. Construir request de orden
3. Enviar a Alpaca (`POST /v2/orders`)
4. Guardar respuesta en `orders`
5. Polling de status hasta filled/cancelled
6. Procesar fills y actualizar `positions`

**Tipos de Órdenes:**
- `market`: Ejecución inmediata
- `limit`: Con timeout y re-quote
- `stop_limit`: Para TP/SL

**Idempotencia:**
- `client_order_id = intent_id`
- Verificar orden existente antes de crear

---

#### 1.3.7 agent-orchestrator

**Responsabilidad:** Orquestar agentes OpenAI para explicaciones, supervisión, propuestas.

**Agentes:**

| Agente | Trigger | Output |
|--------|---------|--------|
| Signal Explainer | Trade executed | Explicación + rationale JSON |
| Risk Sentinel | Risk event | Análisis + recomendación |
| Strategy Tuner | Daily/weekly | Propuestas de config |
| Ops Copilot | User query | Respuesta a preguntas |
| Report Generator | Scheduled | Reporte JSON + texto |

**Tools Expuestos:**
```typescript
const tools = [
  {
    name: 'get_latest_signals',
    parameters: { strategy_id: string },
  },
  {
    name: 'get_trade_snapshot',
    parameters: { intent_id: string },
  },
  {
    name: 'get_risk_events',
    parameters: { from: Date, to: Date },
  },
  {
    name: 'propose_config_patch',
    parameters: { strategy_id: string, changes: object },
  },
  {
    name: 'create_report',
    parameters: { range: 'daily' | 'weekly' | 'custom' },
  },
];
```

---

#### 1.3.8 scheduler

**Responsabilidad:** Ejecutar tareas programadas.

**Jobs:**

| Job | Frecuencia | Descripción |
|-----|------------|-------------|
| `refresh-watchlist` | 5 min | Actualizar snapshots de whales |
| `daily-aggregation` | 00:00 UTC | Calcular métricas diarias |
| `cleanup-cache` | 1 hour | Limpiar market_data_cache > 24h |
| `generate-report` | 00:00 UTC | Generar reporte diario |
| `validate-api-keys` | 6 hours | Validar API keys |
| `reset-daily-counters` | 00:00 UTC | Reset bumpers diarios |

---

## 🎨 FASE 2: FRONTEND (Next.js + Vercel)

### 2.1 Nuevas Rutas y Páginas

**Estructura de rutas a implementar:**

```
app/
├── home/                         # (EXISTENTE - Dashboard base)
│   ├── layout.tsx               # (MODIFICAR) - Agregar nav trading
│   ├── page.tsx                 # (MODIFICAR) - Overview con trading stats
│   │
│   ├── trading/                 # NUEVO - Hub de trading
│   │   ├── layout.tsx           # Layout con tabs
│   │   ├── page.tsx             # Dashboard principal
│   │   │
│   │   ├── signals/             # Señales en tiempo real
│   │   │   └── page.tsx
│   │   │
│   │   ├── positions/           # Posiciones actuales
│   │   │   └── page.tsx
│   │   │
│   │   ├── orders/              # Historial de órdenes
│   │   │   ├── page.tsx         # Lista de órdenes
│   │   │   └── [id]/page.tsx    # Detalle de orden
│   │   │
│   │   ├── history/             # Historial de trades
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx    # Detalle de trade
│   │   │
│   │   └── performance/         # Métricas y PnL
│   │       └── page.tsx
│   │
│   ├── strategies/              # NUEVO - Gestión de estrategias
│   │   ├── page.tsx             # Lista de estrategias
│   │   ├── new/page.tsx         # Crear estrategia
│   │   └── [id]/
│   │       ├── page.tsx         # Vista de estrategia
│   │       ├── edit/page.tsx    # Editar configuración
│   │       ├── versions/page.tsx # Historial de versiones
│   │       └── backtest/page.tsx # (Futuro) Backtesting
│   │
│   ├── whales/                  # NUEVO - Whale tracking
│   │   ├── page.tsx             # Watchlist
│   │   ├── add/page.tsx         # Agregar wallet
│   │   ├── discover/page.tsx    # Auto-discovery
│   │   └── [id]/
│   │       ├── page.tsx         # Detalle de whale
│   │       └── history/page.tsx # Historial de posiciones
│   │
│   ├── risk/                    # NUEVO - Risk management
│   │   ├── page.tsx             # Dashboard de riesgo
│   │   ├── events/page.tsx      # Log de eventos
│   │   ├── bumpers/page.tsx     # Configuración de bumpers
│   │   └── kill-switch/page.tsx # Control kill switch
│   │
│   ├── agents/                  # NUEVO - AI Agents console
│   │   ├── page.tsx             # Overview de agentes
│   │   ├── chat/page.tsx        # Chat con Ops Copilot
│   │   ├── proposals/           # Propuestas pendientes
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── traces/page.tsx      # Historial de trazas
│   │   └── reports/page.tsx     # Reportes generados
│   │
│   ├── audit/                   # NUEVO - Auditoría
│   │   ├── page.tsx             # Audit log
│   │   └── export/page.tsx      # Exportar datos
│   │
│   └── settings/                # (EXISTENTE)
│       ├── page.tsx             # (MODIFICAR) - Agregar trading settings
│       ├── api-keys/page.tsx    # NUEVO - Gestión de API keys
│       ├── notifications/page.tsx # NUEVO - Preferencias notificaciones
│       └── trading/page.tsx     # NUEVO - Config global trading
│
└── api/                          # API Routes
    └── v1/
        ├── strategies/
        │   ├── route.ts         # CRUD strategies
        │   └── [id]/
        │       ├── route.ts
        │       ├── enable/route.ts
        │       ├── disable/route.ts
        │       └── versions/route.ts
        ├── signals/
        │   └── route.ts
        ├── orders/
        │   └── route.ts
        ├── risk/
        │   ├── bumpers/route.ts
        │   └── kill-switch/route.ts
        ├── whales/
        │   └── route.ts
        ├── agents/
        │   ├── chat/route.ts
        │   └── proposals/route.ts
        └── export/
            └── route.ts
```

### 2.2 Componentes UI Nuevos

**Estructura de componentes:**

```
apps/web/components/
├── trading/                     # Componentes de trading
│   ├── dashboard/
│   │   ├── trading-overview.tsx        # Overview cards
│   │   ├── live-signals-feed.tsx       # Feed de señales en vivo
│   │   ├── position-card.tsx           # Card de posición actual
│   │   ├── pnl-chart.tsx               # Gráfico de PnL
│   │   ├── quick-actions.tsx           # Acciones rápidas
│   │   └── market-status.tsx           # Status HL + Alpaca
│   │
│   ├── signals/
│   │   ├── signal-card.tsx             # Card de señal
│   │   ├── signal-details.tsx          # Detalle expandido
│   │   ├── signal-scores.tsx           # Visualización de scores
│   │   ├── signal-table.tsx            # Tabla de señales
│   │   └── signal-filters.tsx          # Filtros
│   │
│   ├── positions/
│   │   ├── position-card.tsx           # Card de posición
│   │   ├── position-table.tsx          # Tabla de posiciones
│   │   ├── position-pnl.tsx            # PnL de posición
│   │   ├── close-position-dialog.tsx   # Dialog cerrar posición
│   │   └── position-history.tsx        # Historial
│   │
│   ├── orders/
│   │   ├── order-card.tsx              # Card de orden
│   │   ├── order-table.tsx             # Tabla de órdenes
│   │   ├── order-status-badge.tsx      # Badge de status
│   │   ├── order-details.tsx           # Detalle de orden
│   │   └── order-timeline.tsx          # Timeline de orden
│   │
│   └── charts/
│       ├── equity-curve.tsx            # Curva de equity
│       ├── drawdown-chart.tsx          # Gráfico de drawdown
│       ├── win-rate-chart.tsx          # Win rate por periodo
│       └── trade-distribution.tsx      # Distribución de trades
│
├── strategies/                  # Componentes de estrategias
│   ├── strategy-card.tsx               # Card de estrategia
│   ├── strategy-form.tsx               # Form crear/editar
│   ├── strategy-config-form.tsx        # Form de configuración
│   ├── strategy-state-badge.tsx        # Badge de estado
│   ├── strategy-toggle.tsx             # Toggle enable/disable
│   ├── strategy-mode-selector.tsx      # Paper/Live selector
│   ├── config-editor.tsx               # Editor JSON de config
│   ├── threshold-sliders.tsx           # Sliders para thresholds
│   └── version-history.tsx             # Historial de versiones
│
├── whales/                      # Componentes de whales
│   ├── whale-card.tsx                  # Card de whale
│   ├── whale-table.tsx                 # Tabla de watchlist
│   ├── whale-add-form.tsx              # Form agregar wallet
│   ├── whale-position-chart.tsx        # Gráfico de posiciones
│   ├── whale-event-card.tsx            # Card de evento
│   ├── whale-discovery.tsx             # UI auto-discovery
│   └── whale-delta-indicator.tsx       # Indicador de cambios
│
├── risk/                        # Componentes de riesgo
│   ├── risk-dashboard.tsx              # Dashboard de riesgo
│   ├── bumper-card.tsx                 # Card de bumper
│   ├── bumper-config-form.tsx          # Form de bumpers
│   ├── risk-event-card.tsx             # Card de evento
│   ├── risk-event-table.tsx            # Tabla de eventos
│   ├── kill-switch-panel.tsx           # Panel kill switch
│   ├── daily-limits-progress.tsx       # Progreso de límites
│   └── risk-alert.tsx                  # Alerta de riesgo
│
├── agents/                      # Componentes de agentes
│   ├── agent-chat.tsx                  # Chat con copilot
│   ├── agent-message.tsx               # Mensaje de chat
│   ├── agent-proposal-card.tsx         # Card de propuesta
│   ├── proposal-diff-viewer.tsx        # Diff de cambios
│   ├── proposal-approval-form.tsx      # Form aprobar/rechazar
│   ├── agent-trace-card.tsx            # Card de traza
│   ├── trade-explanation.tsx           # Explicación de trade
│   └── report-viewer.tsx               # Visualizador de reportes
│
├── audit/                       # Componentes de auditoría
│   ├── audit-log-table.tsx             # Tabla de audit log
│   ├── audit-filters.tsx               # Filtros
│   ├── audit-detail.tsx                # Detalle de entrada
│   └── export-dialog.tsx               # Dialog de exportación
│
├── settings/                    # Componentes de settings
│   ├── api-key-form.tsx                # Form de API keys
│   ├── api-key-card.tsx                # Card de API key
│   ├── api-key-validation.tsx          # Validación de keys
│   ├── notification-preferences.tsx    # Preferencias de notif
│   └── global-trading-config.tsx       # Config global
│
└── shared/                      # Componentes compartidos
    ├── realtime-indicator.tsx          # Indicador conexión RT
    ├── connection-status.tsx           # Status de conexiones
    ├── price-display.tsx               # Display de precio
    ├── pnl-display.tsx                 # Display de PnL (+/-)
    ├── percentage-badge.tsx            # Badge de porcentaje
    ├── timestamp-display.tsx           # Display de timestamps
    ├── json-viewer.tsx                 # Visualizador JSON
    ├── data-refresh-button.tsx         # Botón de refresh
    └── empty-state-trading.tsx         # Empty states
```

### 2.3 Hooks Personalizados

```
apps/web/lib/hooks/
├── trading/
│   ├── use-signals.ts              # Señales en tiempo real
│   ├── use-positions.ts            # Posiciones actuales
│   ├── use-orders.ts               # Órdenes
│   ├── use-fills.ts                # Fills
│   ├── use-pnl.ts                  # PnL calculado
│   └── use-market-data.ts          # Datos de mercado
│
├── strategies/
│   ├── use-strategies.ts           # Lista de estrategias
│   ├── use-strategy.ts             # Estrategia individual
│   ├── use-strategy-state.ts       # Estado de estrategia
│   └── use-strategy-mutations.ts   # Mutaciones (create, update, etc.)
│
├── whales/
│   ├── use-whale-watchlist.ts      # Watchlist
│   ├── use-whale-events.ts         # Eventos de whales
│   └── use-whale-snapshots.ts      # Snapshots
│
├── risk/
│   ├── use-risk-events.ts          # Eventos de riesgo
│   ├── use-bumpers-state.ts        # Estado de bumpers
│   └── use-kill-switch.ts          # Estado kill switch
│
├── agents/
│   ├── use-agent-chat.ts           # Chat con copilot
│   ├── use-proposals.ts            # Propuestas pendientes
│   └── use-agent-traces.ts         # Trazas
│
└── realtime/
    ├── use-supabase-realtime.ts    # Wrapper Supabase Realtime
    ├── use-signals-stream.ts       # Stream de señales
    ├── use-orders-stream.ts        # Stream de órdenes
    └── use-risk-events-stream.ts   # Stream de risk events
```

### 2.4 Server Actions

```
apps/web/lib/actions/
├── strategies/
│   ├── create-strategy.ts
│   ├── update-strategy.ts
│   ├── delete-strategy.ts
│   ├── enable-strategy.ts
│   ├── disable-strategy.ts
│   ├── update-config.ts
│   └── create-version.ts
│
├── whales/
│   ├── add-to-watchlist.ts
│   ├── remove-from-watchlist.ts
│   ├── update-whale.ts
│   └── trigger-discovery.ts
│
├── risk/
│   ├── update-bumpers.ts
│   ├── acknowledge-event.ts
│   ├── activate-kill-switch.ts
│   └── deactivate-kill-switch.ts
│
├── agents/
│   ├── send-chat-message.ts
│   ├── approve-proposal.ts
│   ├── reject-proposal.ts
│   └── generate-report.ts
│
├── orders/
│   ├── cancel-order.ts
│   └── close-position.ts
│
├── api-keys/
│   ├── save-api-key.ts
│   ├── delete-api-key.ts
│   ├── validate-api-key.ts
│   └── rotate-api-key.ts
│
└── export/
    └── export-data.ts
```

### 2.5 Schemas Zod (Frontend)

```
apps/web/lib/schemas/
├── strategy.schema.ts
│   ├── CreateStrategySchema
│   ├── UpdateStrategySchema
│   ├── StrategyConfigSchema
│   │   ├── EntryConfigSchema
│   │   ├── ExitConfigSchema
│   │   ├── ExecutionConfigSchema
│   │   └── RiskConfigSchema
│   └── StrategyVersionSchema
│
├── whale.schema.ts
│   ├── AddWhaleSchema
│   └── UpdateWhaleSchema
│
├── risk.schema.ts
│   ├── BumperConfigSchema
│   └── KillSwitchSchema
│
├── agent.schema.ts
│   ├── ChatMessageSchema
│   └── ProposalResponseSchema
│
└── api-key.schema.ts
    └── ApiKeySchema
```

---

## 🔌 FASE 3: INTEGRACIONES

### 3.1 Hyperliquid Integration

**Package:** `packages/integrations/src/hyperliquid/`

```typescript
// Archivos a crear:
├── client.ts           # Cliente principal
├── websocket.ts        # Gestión de WebSocket
├── info.ts             # Info API client
├── types.ts            # Tipos de datos HL
├── parsers.ts          # Parsers de mensajes
└── utils.ts            # Utilidades

// Ejemplo de client.ts:
export class HyperliquidClient {
  private ws: WebSocket;
  private subscriptions: Map<string, Subscription>;

  constructor(config: HLConfig) {}

  // WebSocket
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(channel: string, handler: Handler): void;
  unsubscribe(channel: string): void;

  // Info API
  async getMids(): Promise<Mids>;
  async getL2Book(coin: string): Promise<L2Book>;
  async getUserState(address: string): Promise<UserState>;
  async getClearinghouseState(address: string): Promise<CHState>;
}
```

### 3.2 Alpaca Integration

**Package:** `packages/integrations/src/alpaca/`

```typescript
// Archivos a crear:
├── client.ts           # Cliente principal
├── trading.ts          # Trading API
├── streaming.ts        # Market data streaming
├── types.ts            # Tipos de datos Alpaca
└── utils.ts            # Utilidades

// Ejemplo de trading.ts:
export class AlpacaTradingClient {
  constructor(config: AlpacaConfig) {}

  // Orders
  async createOrder(order: OrderRequest): Promise<Order>;
  async getOrder(orderId: string): Promise<Order>;
  async cancelOrder(orderId: string): Promise<void>;
  async listOrders(params?: ListOrdersParams): Promise<Order[]>;

  // Positions
  async getPosition(symbol: string): Promise<Position>;
  async closePosition(symbol: string): Promise<Order>;

  // Account
  async getAccount(): Promise<Account>;
}
```

### 3.3 OpenAI Agents Integration

**Package:** `packages/integrations/src/openai/`

```typescript
// Archivos a crear:
├── client.ts           # Cliente OpenAI
├── agents.ts           # Definiciones de agentes
├── tools.ts            # Function tools
├── schemas.ts          # Structured output schemas
└── types.ts            # Tipos

// Ejemplo de agents.ts:
export const signalExplainerAgent = {
  name: 'signal_explainer',
  instructions: `You are a trading signal explainer...`,
  tools: [getTradeSnapshotTool, getSignalsTool],
  outputSchema: TradeExplanationSchema,
};

export const riskSentinelAgent = {
  name: 'risk_sentinel',
  instructions: `You monitor trading risk...`,
  tools: [getRiskEventsTool, getBumperStateTool],
  outputSchema: RiskAnalysisSchema,
};
```

---

## 📦 FASE 4: PACKAGES COMPARTIDOS

### 4.1 @kit/trading-core

```
packages/trading-core/
├── src/
│   ├── types/
│   │   ├── strategy.ts
│   │   ├── signal.ts
│   │   ├── order.ts
│   │   ├── position.ts
│   │   ├── risk.ts
│   │   └── whale.ts
│   │
│   ├── schemas/
│   │   ├── strategy.schema.ts
│   │   ├── config.schema.ts
│   │   └── order.schema.ts
│   │
│   ├── constants/
│   │   ├── states.ts
│   │   ├── order-types.ts
│   │   └── risk-codes.ts
│   │
│   └── utils/
│       ├── pnl.ts
│       ├── risk.ts
│       └── formatting.ts
│
└── package.json
```

### 4.2 @kit/trading-ui

```
packages/trading-ui/
├── src/
│   ├── components/
│   │   ├── price-display.tsx
│   │   ├── pnl-badge.tsx
│   │   ├── status-indicator.tsx
│   │   └── sparkline.tsx
│   │
│   └── hooks/
│       ├── use-price-formatter.ts
│       └── use-pnl-color.ts
│
└── package.json
```

---

## 🚀 FASE 5: DEPLOYMENT

### 5.1 Render Services Configuration

**render.yaml:**
```yaml
services:
  - type: web
    name: hl-market-ingestor
    runtime: node
    buildCommand: pnpm install && pnpm build
    startCommand: node dist/index.js
    healthCheckPath: /health
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: HL_WS_URL
        value: wss://api.hyperliquid.xyz/ws

  - type: web
    name: feature-signal-engine
    runtime: node
    # ... similar config

  - type: web
    name: strategy-engine
    runtime: node
    # ... similar config

  - type: web
    name: whale-tracker
    runtime: node
    # ... similar config

  - type: web
    name: risk-engine
    runtime: node
    # ... similar config

  - type: web
    name: alpaca-execution-engine
    runtime: node
    # ... similar config

  - type: web
    name: agent-orchestrator
    runtime: node
    # ... similar config

  - type: cron
    name: scheduler
    runtime: node
    schedule: "* * * * *"  # Every minute (individual jobs control frequency)
    # ... similar config
```

### 5.2 Vercel Configuration

**vercel.json:**
```json
{
  "buildCommand": "pnpm turbo run build --filter=web",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key"
  }
}
```

### 5.3 Environment Variables

**Variables requeridas:**

| Variable | Servicio | Descripción |
|----------|----------|-------------|
| `SUPABASE_URL` | All | URL de Supabase |
| `SUPABASE_ANON_KEY` | Frontend | Key pública |
| `SUPABASE_SERVICE_KEY` | Backend | Key de servicio |
| `ALPACA_PAPER_KEY` | Execution | API key paper |
| `ALPACA_PAPER_SECRET` | Execution | API secret paper |
| `ALPACA_LIVE_KEY` | Execution | API key live |
| `ALPACA_LIVE_SECRET` | Execution | API secret live |
| `OPENAI_API_KEY` | Agent | API key OpenAI |
| `HL_WS_URL` | Ingestor | WebSocket URL HL |

---

## 📅 ROADMAP DETALLADO

### Sprint 1: Fundamentos (Semana 1-2)

**Objetivo:** Infraestructura base y schema de DB

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Crear migración Supabase con todas las tablas | P0 | 1 día |
| Aplicar RLS policies | P0 | 0.5 días |
| Configurar Realtime | P0 | 0.5 días |
| Crear package `@kit/trading-core` | P0 | 1 día |
| Crear package `@kit/integrations` base | P0 | 1 día |
| Setup monorepo para services/ | P0 | 0.5 días |
| Documentar esquema de datos | P1 | 0.5 días |

**Entregables:**
- Schema completo en Supabase
- Packages base creados
- Estructura de services/ lista

---

### Sprint 2: Market Data Pipeline (Semana 3-4)

**Objetivo:** Ingesta de datos de Hyperliquid

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar HyperliquidClient | P0 | 2 días |
| Crear hl-market-ingestor service | P0 | 2 días |
| Parsers para trades, candles, orderbook | P0 | 1 día |
| Publisher a Supabase | P0 | 1 día |
| Reconexión automática + backoff | P0 | 0.5 días |
| Health endpoints + logging | P1 | 0.5 días |
| Deploy a Render (dev) | P1 | 0.5 días |

**Entregables:**
- Datos de HL fluyendo a Supabase
- Service desplegado en Render

---

### Sprint 3: Feature Engine (Semana 5-6)

**Objetivo:** Cálculo de features y generación de señales

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar flush_score calculator | P0 | 1 día |
| Implementar burst_proxy calculator | P0 | 1 día |
| Implementar reclaim detector | P0 | 0.5 días |
| Implementar absorption_score | P0 | 1 día |
| Signal generator | P0 | 1 día |
| Crear feature-signal-engine service | P0 | 1 día |
| Subscriber a market_data_cache | P0 | 0.5 días |
| Tests unitarios para features | P1 | 1 día |
| Deploy a Render | P1 | 0.5 días |

**Entregables:**
- Señales generándose en tiempo real
- Features calculados correctamente

---

### Sprint 4: Strategy Engine (Semana 7-8)

**Objetivo:** Máquina de estados de estrategias

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar state machine | P0 | 2 días |
| Estados: IDLE, SETUP, TRIGGERED | P0 | 1 día |
| Estados: ORDERING, IN_POSITION | P0 | 1 día |
| Estados: EXITING, COOLDOWN | P0 | 1 día |
| Entry rule evaluators | P0 | 1 día |
| Exit rule evaluators | P0 | 1 día |
| Crear strategy-engine service | P0 | 1 día |
| Deploy a Render | P1 | 0.5 días |

**Entregables:**
- Estrategias transitando estados
- Trade intents generándose

---

### Sprint 5: Risk Engine (Semana 9-10)

**Objetivo:** Gestión de riesgo y bumpers

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar daily loss limit | P0 | 0.5 días |
| Implementar max trades per day | P0 | 0.5 días |
| Implementar position size limit | P0 | 0.5 días |
| Implementar cooldown after loss | P0 | 0.5 días |
| Implementar spread guard | P1 | 0.5 días |
| Implementar drift guard | P1 | 1 día |
| Kill switch logic | P0 | 1 día |
| Intent evaluator | P0 | 1 día |
| Crear risk-engine service | P0 | 1 día |
| Deploy a Render | P1 | 0.5 días |

**Entregables:**
- Risk engine aprobando/rechazando intents
- Kill switch funcional

---

### Sprint 6: Alpaca Execution (Semana 11-12)

**Objetivo:** Ejecución de órdenes en Alpaca

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar AlpacaTradingClient | P0 | 2 días |
| Order submission (market/limit) | P0 | 1 día |
| Order status reconciliation | P0 | 1 día |
| Fill processing | P0 | 1 día |
| Position sync | P0 | 1 día |
| Idempotency logic | P0 | 0.5 días |
| Crear alpaca-execution-engine service | P0 | 1 día |
| Tests con paper trading | P0 | 1 día |
| Deploy a Render | P1 | 0.5 días |

**Entregables:**
- Órdenes ejecutándose en Alpaca paper
- Posiciones sincronizadas

---

### Sprint 7: Frontend Base (Semana 13-14)

**Objetivo:** Dashboard y UI base

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Crear rutas de /trading | P0 | 1 día |
| Trading dashboard overview | P0 | 2 días |
| Signals page + realtime feed | P0 | 2 días |
| Positions page | P0 | 1 día |
| Orders page | P0 | 1 día |
| Performance page (charts) | P1 | 2 días |
| Hooks de trading | P0 | 1 día |

**Entregables:**
- Dashboard de trading funcional
- Visualización en tiempo real

---

### Sprint 8: Strategies UI (Semana 15-16)

**Objetivo:** Gestión de estrategias desde UI

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Strategies list page | P0 | 1 día |
| Create strategy form | P0 | 2 días |
| Strategy detail page | P0 | 1 día |
| Config editor con sliders | P0 | 2 días |
| Enable/disable toggle | P0 | 0.5 días |
| Paper/Live mode selector | P0 | 0.5 días |
| Version history page | P1 | 1 día |
| Server actions | P0 | 1 día |

**Entregables:**
- CRUD completo de estrategias
- Configuración desde UI

---

### Sprint 9: Whale Tracker (Semana 17-18)

**Objetivo:** Tracking de whales funcional

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar whale-tracker service | P0 | 2 días |
| Watchlist management | P0 | 1 día |
| Snapshot fetching desde HL | P0 | 1 día |
| Delta detection | P0 | 1 día |
| Event generation | P0 | 1 día |
| Frontend: Whale watchlist page | P0 | 1 día |
| Frontend: Whale detail page | P0 | 1 día |
| Frontend: Add whale form | P0 | 0.5 días |
| Deploy service a Render | P1 | 0.5 días |

**Entregables:**
- Whale tracking en tiempo real
- UI de gestión de whales

---

### Sprint 10: Risk UI + Kill Switch (Semana 19-20)

**Objetivo:** UI de gestión de riesgo

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Risk dashboard page | P0 | 2 días |
| Risk events log page | P0 | 1 día |
| Bumpers config form | P0 | 2 días |
| Kill switch panel | P0 | 1 día |
| Daily limits progress | P1 | 1 día |
| Risk alerts (toast/banner) | P0 | 1 día |
| Server actions para risk | P0 | 1 día |

**Entregables:**
- Dashboard de riesgo completo
- Control de kill switch desde UI

---

### Sprint 11: OpenAI Agents (Semana 21-22)

**Objetivo:** Agentes funcionando

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Implementar OpenAI client | P0 | 1 día |
| Signal Explainer agent | P0 | 2 días |
| Risk Sentinel agent | P1 | 1 día |
| Ops Copilot agent | P0 | 2 días |
| Strategy Tuner agent | P2 | 1 día |
| Tools (function calling) | P0 | 1 día |
| Structured outputs | P0 | 1 día |
| Crear agent-orchestrator service | P0 | 1 día |
| Deploy a Render | P1 | 0.5 días |

**Entregables:**
- Agentes generando explicaciones
- Copilot respondiendo preguntas

---

### Sprint 12: Agents UI (Semana 23-24)

**Objetivo:** UI para interactuar con agentes

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Agents overview page | P0 | 1 día |
| Chat with Copilot page | P0 | 2 días |
| Trade explanation component | P0 | 1 día |
| Proposals list page | P0 | 1 día |
| Proposal detail + approve/reject | P0 | 2 días |
| Agent traces log | P1 | 1 día |
| Reports viewer | P1 | 1 día |

**Entregables:**
- Chat funcional con Copilot
- Sistema de propuestas completo

---

### Sprint 13: Settings + API Keys (Semana 25-26)

**Objetivo:** Configuración y API keys

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| API keys management page | P0 | 2 días |
| Add/edit API key form | P0 | 1 día |
| Key validation logic | P0 | 1 día |
| Secure storage (encryption) | P0 | 2 días |
| Notification preferences page | P1 | 1 día |
| Global trading config page | P0 | 1 día |
| Feature flags UI | P1 | 1 día |

**Entregables:**
- Gestión segura de API keys
- Configuración personalizable

---

### Sprint 14: Audit + Export (Semana 27-28)

**Objetivo:** Auditoría y exportación de datos

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Audit log page | P0 | 2 días |
| Audit filters | P0 | 1 día |
| Audit detail modal | P1 | 1 día |
| Export data functionality | P0 | 2 días |
| Export formats (CSV, JSON) | P0 | 1 día |
| Scheduler jobs | P0 | 2 días |
| Daily aggregation job | P0 | 1 día |

**Entregables:**
- Audit trail completo
- Exportación de datos funcional

---

### Sprint 15: Polish + Testing (Semana 29-30)

**Objetivo:** Pulir y probar todo

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| E2E tests con Playwright | P0 | 3 días |
| Integration tests | P0 | 2 días |
| Load testing | P1 | 1 día |
| Performance optimization | P1 | 2 días |
| Documentation | P1 | 2 días |
| Bug fixes | P0 | ongoing |

**Entregables:**
- Suite de tests completa
- Documentación actualizada

---

### Sprint 16: Live Preparation (Semana 31-32)

**Objetivo:** Preparar para trading live

| Tarea | Prioridad | Estimación |
|-------|-----------|------------|
| Paper trading validation | P0 | 5 días |
| Live feature flag implementation | P0 | 1 día |
| Stricter limits for live | P0 | 1 día |
| Monitoring setup | P0 | 2 días |
| Alerting setup | P0 | 1 día |
| Final security review | P0 | 2 días |

**Entregables:**
- Sistema validado en paper
- Listo para live (con precaución)

---

## ✅ CHECKLIST FINAL

### Supabase
- [ ] 20 tablas creadas
- [ ] RLS en todas las tablas
- [ ] Service role policies
- [ ] Triggers de updated_at
- [ ] Trigger de user setup
- [ ] Realtime habilitado
- [ ] Índices de performance

### Backend (8 servicios)
- [ ] hl-market-ingestor
- [ ] feature-signal-engine
- [ ] strategy-engine
- [ ] whale-tracker
- [ ] risk-engine
- [ ] alpaca-execution-engine
- [ ] agent-orchestrator
- [ ] scheduler

### Frontend (15+ páginas)
- [ ] Trading dashboard
- [ ] Signals page
- [ ] Positions page
- [ ] Orders page
- [ ] Performance page
- [ ] Strategies list
- [ ] Strategy create/edit
- [ ] Whale watchlist
- [ ] Risk dashboard
- [ ] Kill switch
- [ ] Agent chat
- [ ] Proposals
- [ ] Settings
- [ ] API keys
- [ ] Audit log

### Integraciones
- [ ] Hyperliquid WebSocket
- [ ] Hyperliquid Info API
- [ ] Alpaca Trading API
- [ ] Alpaca Market Data (drift guard)
- [ ] OpenAI Responses API
- [ ] OpenAI Agents SDK

### Agentes (5)
- [ ] Signal Explainer
- [ ] Risk Sentinel
- [ ] Strategy Tuner
- [ ] Ops Copilot
- [ ] Report Generator

---

## 📝 NOTAS FINALES

1. **Prioridad de implementación:** DB → Backend → Frontend → Agents
2. **Testing:** Empezar siempre con paper trading
3. **Seguridad:** API keys encriptadas, nunca en código
4. **Escalabilidad:** Diseñado para escalar horizontalmente
5. **Observabilidad:** Logging estructurado desde el inicio

Este plan cubre el **100%** del PRD técnico, incluyendo:
- ✅ Todas las tablas de Supabase
- ✅ Todos los microservicios de Render
- ✅ Todas las páginas del dashboard
- ✅ Todas las integraciones (HL, Alpaca, OpenAI)
- ✅ Todos los agentes
- ✅ Auditoría y exportación
- ✅ Gestión de riesgo completa

---

## 🖥️ APÉNDICE A: TRADING WORKBENCH CONSOLIDADO

> **Documento completo:** [TRADING_WORKBENCH_UX_DESIGN.md](./TRADING_WORKBENCH_UX_DESIGN.md)

### Cambio de Arquitectura Frontend

El plan original contemplaba **15+ páginas separadas**. Basado en análisis UX/UI, se rediseña a un **Trading Workbench Consolidado** que integra toda la información operativa en una sola vista.

### Filosofía

> **"Un trader no debe cambiar de página para tomar decisiones. Todo lo que necesita debe estar visible en tiempo real."**

### Layout del Workbench

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER: [Symbol ▼] [Strategy ▼] [🟢 PAPER] [⏱ Clock] [🔴 Kill Switch] [⚙️] [👤]            │
├───────────────────────────────────────────────────────┬─────────────────────────────────────┤
│                                                        │ SIGNAL PANEL                        │
│                                                        │ • Setup: LONG/SHORT                 │
│              CANDLESTICK CHART                         │ • Scores (flush, burst, absorption) │
│              (60% width)                               │ • Confirmations                     │
│              • TradingView-style                       │ • Entry/SL/TP levels                │
│              • Signal markers                          ├─────────────────────────────────────┤
│              • TP/SL lines                             │ POSITION PANEL                      │
│              • Whale event icons                       │ • Current position + PnL            │
│              • Trade arrows                            │ • Close/Modify buttons              │
│                                                        ├─────────────────────────────────────┤
│                                                        │ RISK PANEL                          │
│                                                        │ • Daily loss progress               │
│                                                        │ • Trade count                       │
│                                                        │ • Strategy state                    │
├───────────────────────────────────────────────────────┴─────────────────────────────────────┤
│ ACTIVITY PANEL (TABS): [Activity] [Orders] [History] [Whales] [AI Copilot]                  │
│ • Real-time feed de todos los eventos                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Beneficios vs Páginas Separadas

| Aspecto | Páginas Separadas | Workbench Consolidado |
|---------|-------------------|----------------------|
| Navegación | 8+ clicks para ver todo | 0 clicks, todo visible |
| Contexto | Se pierde al cambiar página | Siempre visible |
| Tiempo real | Por página | Global, sincronizado |
| Decisiones | Requiere recordar datos | Todo a la vista |
| UX profesional | No | Sí (estilo TradingView) |

### Nueva Estructura de Rutas

```
app/home/
├── workbench/                    # PRINCIPAL - Trading Workbench
│   ├── page.tsx                  # Workbench consolidado
│   └── layout.tsx                # Full-screen layout
│
├── strategies/                   # CRUD de estrategias (separado)
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx
│       └── edit/page.tsx
│
├── settings/                     # Configuración (separado)
│   ├── page.tsx
│   ├── api-keys/page.tsx
│   └── notifications/page.tsx
│
└── audit/                        # Auditoría (separado, acceso ocasional)
    └── page.tsx
```

### Componentes del Workbench

```
components/workbench/
├── trading-workbench.tsx         # Container principal
├── header-bar.tsx                # Header con selectores y controles
├── chart-panel.tsx               # Candlestick chart (lightweight-charts)
├── signal-position-panel.tsx     # Panel lateral derecho
├── activity-panel.tsx            # Panel inferior con tabs
├── activity-feed.tsx             # Feed de eventos
├── orders-table.tsx              # Tabla de órdenes
├── trade-history-table.tsx       # Historial de trades
├── whales-panel.tsx              # Watchlist + eventos whale
├── ai-copilot-chat.tsx           # Chat con agente AI
├── close-position-dialog.tsx     # Modal cerrar posición
├── modify-position-dialog.tsx    # Modal modificar TP/SL
└── kill-switch-dialog.tsx        # Modal kill switch
```

### Hooks de Tiempo Real

```typescript
// Subscripciones Supabase Realtime
useWorkbenchRealtime(strategyId) {
  // signals → Signal Panel + Chart markers
  // orders → Activity > Orders tab
  // positions → Position Panel + Chart lines
  // risk_events → Risk Panel + Toasts
  // whale_events → Activity > Whales tab + Chart icons
}
```

### Datos Visibles en el Workbench

| Dato | Tabla Supabase | Panel | Realtime |
|------|----------------|-------|----------|
| Candlestick | `market_data_cache` | Chart | ✅ |
| Señales | `signals` | Signal | ✅ |
| Scores | `signals.scores_json` | Signal | ✅ |
| Niveles | `signals.levels_json` | Signal + Chart | ✅ |
| Posición | `positions` | Position | ✅ |
| PnL | `positions.unrealized_pnl` | Position | ✅ |
| Risk state | `risk_bumpers_state` | Risk | ✅ |
| Órdenes | `orders` | Activity > Orders | ✅ |
| Historial | `positions` (closed) | Activity > History | ✅ |
| Whales | `whale_watchlist` | Activity > Whales | ✅ |
| Whale events | `whale_events` | Activity > Whales | ✅ |
| AI Chat | `agent_traces` | Activity > Copilot | ✅ |

### Sprint 7 Actualizado: Trading Workbench

**Objetivo:** Implementar el Trading Workbench consolidado

| Tarea | Prioridad | Descripción |
|-------|-----------|-------------|
| Setup lightweight-charts | P0 | Librería de gráficos TradingView |
| Implementar ChartPanel | P0 | Candlestick + overlays |
| Implementar HeaderBar | P0 | Selectores + kill switch |
| Implementar SignalPositionPanel | P0 | Panel lateral completo |
| Implementar ActivityPanel | P0 | Tabs con feeds |
| Implementar Realtime hooks | P0 | Supabase subscriptions |
| Paneles redimensionables | P1 | @radix-ui/react-resizable |
| Responsive (tablet) | P1 | Layout adaptativo |

### Dependencias Adicionales

```json
{
  "lightweight-charts": "^4.1.0",
  "@radix-ui/react-resizable": "^1.0.0",
  "react-virtuoso": "^4.6.0"
}
```

---

## 📊 APÉNDICE B: VALIDACIÓN DE COBERTURA

### Checklist: ¿El Workbench Cubre Todo?

#### Información Visible
- [x] Gráfico de velas (candlestick)
- [x] Señales en tiempo real (setup, scores)
- [x] Confirmaciones (reclaim, whale, volume)
- [x] Niveles de entrada/salida (TP/SL)
- [x] Posición actual con PnL
- [x] Estado de risk bumpers
- [x] Órdenes pendientes y ejecutadas
- [x] Historial de trades cerrados
- [x] Whale watchlist y eventos
- [x] Chat con AI Copilot
- [x] Estado de estrategia
- [x] Kill switch

#### Filtros Disponibles
- [x] Por símbolo (BTC/USD, ETH/USD, etc.)
- [x] Por estrategia
- [x] Por timeframe (1m, 5m, 15m, 1h, 4h, 1d)

#### Acciones Ejecutables
- [x] Cambiar símbolo
- [x] Cambiar estrategia
- [x] Toggle Paper/Live
- [x] Activar/desactivar Kill Switch
- [x] Cerrar posición
- [x] Modificar TP/SL
- [x] Cancelar orden
- [x] Enviar mensaje a AI

#### Tiempo Real
- [x] Todas las tablas críticas con Supabase Realtime
- [x] Toast notifications para eventos críticos
- [x] Actualización automática de todos los paneles
