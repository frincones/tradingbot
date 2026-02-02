# Plan de Implementación: Atlas Trade Manager Agent

## Resumen Ejecutivo

**Atlas** es un agente completo de gestión de trades que complementa al agente Sentinel. Tiene **dos responsabilidades principales**:

1. **Entry Gatekeeping**: Analiza las alertas de Sentinel y decide si **abrir órdenes** o no
2. **Trade Management**: Gestiona las posiciones abiertas (modificar SL/TP, cierres parciales, trailing)

### Flujo Completo del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO DE TRADING COMPLETO                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   SENTINEL (cada 30s)                                                            │
│   ──────────────────                                                             │
│   Market Data ──▶ Detecta Patrón ──▶ ALERT ──▶ agent_alerts (status='new')      │
│                                                                                  │
│                                                       │                          │
│                                                       ▼                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                    ATLAS - ENTRY GATEKEEPING (cada 5 min)                │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                          │   │
│   │   agent_alerts (status='new') ──▶ Atlas Analysis ──▶ Decision:          │   │
│   │                                                                          │   │
│   │   ├── APPROVE_ENTRY ──▶ Crear Paper Order ──▶ status='actioned' ✅      │   │
│   │   ├── BLOCK         ──▶ No crear orden    ──▶ status='dismissed' ❌     │   │
│   │   └── WAIT          ──▶ Mantener para próximo ciclo (status='new') ⏳   │   │
│   │                                                                          │   │
│   │   (Solo analiza alertas con status='new', ignora actioned/dismissed)    │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                       │                          │
│                                                       ▼                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                    ATLAS - TRADE MANAGEMENT (cada 10 min)                │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                          │   │
│   │   paper_orders (status='open') ──▶ Atlas Review ──▶ Category:           │   │
│   │                                                                          │   │
│   │   ├── HOLD     ──▶ Sin cambios, mantener posición                       │   │
│   │   ├── DEFEND   ──▶ Tighten SL, reduce risk                              │   │
│   │   ├── OPTIMIZE ──▶ Move SL to BE, take partial profit, trailing        │   │
│   │   └── EXIT     ──▶ Close partial or full position                       │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Ciclos de Atlas (Separados)

| Ciclo | Intervalo | Propósito | Input | Output |
|-------|-----------|-----------|-------|--------|
| **Entry Gatekeeping** | 5 minutos | Decidir si ejecutar alertas pendientes | `agent_alerts` (status='new') | Paper orders + Alert status update |
| **Trade Management** | 10 minutos | Gestionar posiciones abiertas | `paper_orders` (status='open') | SL/TP modifications, closes |

### Ciclo de Vida de Alertas

```
agent_alerts.status:
┌─────────┐     ┌───────────────────────────────────────────────────────┐
│   new   │ ──▶ │ Atlas Entry Gatekeeping analiza (cada 5 min)          │
└─────────┘     └───────────────────────────────────────────────────────┘
                         │
                         ├── APPROVE_ENTRY ──▶ status='actioned' + Paper Order creado
                         │
                         ├── BLOCK ──▶ status='dismissed' (no se vuelve a analizar)
                         │
                         └── WAIT ──▶ status='new' (se analiza en próximo ciclo)
                                      │
                                      └── expires_at excedido ──▶ status='expired'
```

### Diferencia Clave
| Aspecto | Sentinel | Atlas Entry | Atlas Trade Mgmt |
|---------|----------|-------------|------------------|
| **Rol** | Detector de patrones | Gatekeeper de entradas | Gestor de posiciones |
| **Frecuencia** | Cada 30 segundos | Cada 5 minutos | Cada 10 minutos |
| **Input** | Market data, whale trades | Alerts pendientes (status='new') | Open trades |
| **Output** | Alertas (status='new') | Paper orders + alert status | SL/TP mods, closes |
| **Decisiones** | ALERT / NO_ALERT | APPROVE_ENTRY / WAIT / BLOCK | HOLD / DEFEND / OPTIMIZE / EXIT |

---

## Arquitectura Propuesta

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (React)                                     │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  useAlertCollector          useAtlasEntryGatekeeping    useAtlasTradeManager  │
│  (Sentinel 30s)             (Entry Gatekeeping 5min)    (Trade Mgmt 10min)    │
│         │                           │                           │              │
│         ▼                           ▼                           ▼              │
│  ┌─────────────┐             ┌─────────────┐             ┌─────────────┐      │
│  │  Sentinel   │             │  Pending    │             │   Open      │      │
│  │   Alerts    │────────────▶│   Alerts    │             │   Trades    │      │
│  │ (status=new)│             │  Analysis   │             │   Review    │      │
│  └─────────────┘             └─────────────┘             └─────────────┘      │
│                                     │                           │              │
│                                     ▼                           ▼              │
│                              paper_orders               atlas_decisions       │
│                              (new orders)               (SL/TP mods)          │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          API ROUTES (Next.js)                                  │
├───────────────────────────────────────────────────────────────────────────────┤
│  POST /api/trading/agents                                                      │
│    ├── action: 'sentinel'       → SentinelAgent.analyze()                     │
│    ├── action: 'atlas-entry'    → AtlasAgent.analyzeEntries() ← NUEVO         │
│    └── action: 'atlas-trades'   → AtlasAgent.manageTrades()   ← NUEVO         │
│                                                                                │
│  POST /api/trading/atlas/execute-action ← NUEVO                               │
│    └── Ejecuta acciones de Atlas (modify SL, close partial, etc.)             │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE (Database)                                  │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  agent_alerts           paper_orders           atlas_reviews    atlas_cycles  │
│  ├── status ◀───┐       ├── status             ├── trade_id     ├── cycle_id  │
│  │   'new'      │       ├── entry_price        ├── category     ├── type      │
│  │   'actioned' │       ├── stop_loss          ├── mfe/mae      │   'entry'   │
│  │   'dismissed'│       ├── take_profit        └── actions      │   'trade'   │
│  │   'expired'  │       ├── mfe_usd                             └── summary   │
│  └── expires_at ┘       └── mae_usd                                           │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Notas de Arquitectura

1. **Dos hooks separados**: `useAtlasEntryGatekeeping` (5min) y `useAtlasTradeManager` (10min)
2. **Dos actions API separadas**: `atlas-entry` y `atlas-trades` para mantener independencia
3. **Estado de alertas**: Cada alerta analizada queda marcada para no re-procesarla
4. **Sin afectar Sentinel**: El flujo de Sentinel permanece igual, solo agregamos consumidores

---

## Funcionalidad Detallada de Atlas

### (A) ENTRY GATEKEEPING - Abrir Órdenes desde Alertas

**Propósito**: Atlas analiza las alertas pendientes de Sentinel y decide si es buen momento para ejecutar la orden.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        ENTRY GATEKEEPING FLOW                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  agent_alerts (status='new')        Atlas Analysis         Paper Order       │
│  ─────────────────────────          ──────────────         ───────────       │
│                                                                               │
│  ┌─────────────────────┐                                                      │
│  │ Alert from Sentinel │                                                      │
│  │ - symbol: BTC       │                                                      │
│  │ - setup: LONG       │───▶ ¿Drift OK?  ───▶ NO  ───▶ BLOCK (drift alto)    │
│  │ - entry: $78,200    │     ¿Spread OK? ───▶ NO  ───▶ WAIT  (spread alto)   │
│  │ - SL: $77,000       │     ¿DD OK?     ───▶ NO  ───▶ BLOCK (DD excedido)   │
│  │ - TP: $80,000       │     ¿Cooldown?  ───▶ NO  ───▶ BLOCK (en cooldown)   │
│  │ - confidence: 85%   │     ¿Chop alto? ───▶ SÍ  ───▶ WAIT  (reduce size)   │
│  └─────────────────────┘                                                      │
│            │                                                                  │
│            ▼                                                                  │
│  ┌─────────────────────┐     ┌─────────────────────┐                         │
│  │   ALL CHECKS PASS   │────▶│   APPROVE_ENTRY     │                         │
│  └─────────────────────┘     └─────────────────────┘                         │
│                                        │                                      │
│                                        ▼                                      │
│                              ┌─────────────────────┐                         │
│                              │ EXECUTE: Crear      │                         │
│                              │ Paper Order desde   │                         │
│                              │ Alert execution_json│                         │
│                              └─────────────────────┘                         │
│                                        │                                      │
│                                        ▼                                      │
│                              ┌─────────────────────┐                         │
│                              │ paper_orders        │                         │
│                              │ - status: 'open'    │                         │
│                              │ - entry_price       │                         │
│                              │ - stop_loss         │                         │
│                              │ - take_profit       │                         │
│                              └─────────────────────┘                         │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Reglas de Entry Gatekeeping:**

| Condición | Decisión | Acción |
|-----------|----------|--------|
| `drift_usd > drift_block_usd` | **BLOCK** | No ejecutar, descartar alerta |
| `alpaca_spread > spread_wait_usd` | **WAIT** | Mantener alerta, reintentar después |
| `daily_pnl <= daily_dd_limit` | **BLOCK** | DD excedido, pausar trading |
| `cooldown_active = true` | **BLOCK** | En cooldown, esperar |
| `kill_switch_active = true` | **BLOCK** | Kill switch, no operar |
| `chop_index > 60` | **WAIT** | Mercado choppy, reducir tamaño o esperar |
| **Todo OK** | **APPROVE_ENTRY** | Ejecutar orden con parámetros de la alerta |

**Output de Entry Gatekeeping:**
```typescript
interface EntryGatekeeping {
  candidate_id: string;        // ID de la alerta
  setup: 'LONG' | 'SHORT';
  decision: 'APPROVE_ENTRY' | 'WAIT' | 'BLOCK';
  why: string[];               // Razones de la decisión
  risk_flags: string[];        // Banderas de riesgo detectadas
  execution_hint: {
    preferred_order_type: 'limit' | 'market' | 'stop_limit';
    entry_logic: string;       // "Usar level de soporte $77,800"
    stop_logic: string;        // "Invalidation por debajo de $77,000"
    tp_logic: string;          // "R2 en resistencia $80,000"
    notional_usd_cap: number;  // Tamaño máximo sugerido
    constraints: string[];     // Guardrails aplicados
  };
  confidence: {
    score_0_100: number;
    missing_data: string[];
  };
}
```

---

### (B) TRADE MANAGEMENT - Gestionar Posiciones Abiertas

**Propósito**: Atlas revisa cada posición abierta cada 10 minutos y decide qué hacer.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TRADE MANAGEMENT FLOW                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Open Paper Order         Atlas 10-min Review           Actions              │
│  ────────────────         ───────────────────           ───────              │
│                                                                               │
│  ┌─────────────────────┐                                                      │
│  │ Trade: BTC LONG     │                                                      │
│  │ - entry: $78,200    │                                                      │
│  │ - current: $78,800  │                                                      │
│  │ - PnL: +$60 (+0.8%) │                                                      │
│  │ - SL: $77,000       │                                                      │
│  │ - TP: $80,000       │                                                      │
│  │ - age: 25 min       │                                                      │
│  │ - MFE: $80 (+1.0%)  │                                                      │
│  │ - MAE: $-20 (-0.3%) │                                                      │
│  └─────────────────────┘                                                      │
│            │                                                                  │
│            ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │                    ATLAS EVALUATION                              │         │
│  ├─────────────────────────────────────────────────────────────────┤         │
│  │                                                                  │         │
│  │  1. Progress Assessment:                                         │         │
│  │     - ¿Avanzó hacia TP? → GOOD                                  │         │
│  │     - ¿Se estancó? → STALLING                                   │         │
│  │     - ¿Deterioró? → BAD                                         │         │
│  │                                                                  │         │
│  │  2. Confirmations Check:                                         │         │
│  │     - ¿Reclaim sigue válido?                                    │         │
│  │     - ¿Absorción se mantiene?                                   │         │
│  │     - ¿Whale flow favorable?                                    │         │
│  │                                                                  │         │
│  │  3. Risk Rules:                                                  │         │
│  │     - MFE >= 1R → Lock-in (move SL to BE)                       │         │
│  │     - PnL >= 1.5R → Trailing stop                               │         │
│  │     - Thesis invalidated → EXIT                                 │         │
│  │     - 2x reviews sin progreso → DEFEND/EXIT                     │         │
│  │     - Age > time_stop → EXIT                                    │         │
│  │                                                                  │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│            │                                                                  │
│            ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │                    DECISION + ACTIONS                            │         │
│  ├──────────────┬──────────────┬──────────────┬───────────────────┤         │
│  │     HOLD     │    DEFEND    │   OPTIMIZE   │       EXIT        │         │
│  ├──────────────┼──────────────┼──────────────┼───────────────────┤         │
│  │ Sin cambios  │ Tighten SL   │ Move SL→BE   │ Close partial     │         │
│  │ Mantener     │ Close 25%    │ Take 50% TP  │ Close 100%        │         │
│  │ posición     │ si deteriora │ Trailing     │ Cut losses        │         │
│  └──────────────┴──────────────┴──────────────┴───────────────────┘         │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Tipos de Acciones de Trade Management:**

| Acción | Descripción | Ejemplo |
|--------|-------------|---------|
| `MODIFY_STOP` | Cambiar precio de stop loss | Mover SL de $77,000 a $78,200 (BE) |
| `MODIFY_TP` | Cambiar precio de take profit | Ajustar TP de $80,000 a $81,500 |
| `CLOSE_PARTIAL` | Cerrar parte de la posición | Cerrar 50% en $79,500 |
| `CLOSE_ALL` | Cerrar toda la posición | Exit completo |
| `CANCEL_ORDER` | Cancelar orden pendiente | Cancelar TP order |
| `REPLACE_ORDER` | Reemplazar orden | Cambiar limit por market |

**Reglas de Gestión (del prompt de Atlas):**

1. **FAILURE-TO-FOLLOW-THROUGH (FTF):**
   - 10 min sin progreso + mercado chop → DEFEND (tighten SL)
   - 20 min sin progreso → EXIT parcial/total

2. **LOCK-IN GAINS:**
   - MFE >= 1R → Move SL to BE + take 25-50% parcial
   - PnL >= 1.5R → Trailing stop por nivel clave

3. **THESIS INVALIDATION:**
   - Rompe invalidation level → EXIT
   - Reclaim falla + absorción perdida → EXIT o tighten agresivo

4. **CAPITULATION EXIT:**
   - Liquidations 10m altas + movimiento extremo → Take profit
   - Trade en pérdida + capitulación contra → EXIT

5. **TIME STOP:**
   - age > time_stop_sec → EXIT
   - age > 4h → EXIT (salvo evidencia fuerte)

---

### (C) PORTFOLIO GOVERNOR - Control Global de Riesgo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PORTFOLIO GOVERNOR                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Status: NORMAL          Status: CAUTION           Status: EMERGENCY         │
│  ──────────────          ───────────────           ─────────────────         │
│                                                                               │
│  ✓ DD < 50%              ⚠ DD entre 50-80%         ✗ DD > 80%                │
│  ✓ Drift bajo            ⚠ Drift moderado          ✗ Kill switch ON         │
│  ✓ Data fresh            ⚠ Rechazos Alpaca         ✗ WS desconectado        │
│  ✓ WS conectado          ⚠ Data stale              ✗ Data > 3000ms          │
│                                                                               │
│  Action: NONE            Action: PAUSE_NEW         Action: CLOSE_ALL         │
│                                  _ENTRIES                                     │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### (D) IMPROVEMENT PLAN - Aprendizaje Continuo

Atlas genera sugerencias de mejora basadas en evidencia:

```typescript
interface ImprovementPlan {
  for_alert_agent: ImprovementItem[];      // Mejoras para Sentinel
  for_atlas_trade_manager: ImprovementItem[]; // Mejoras para Atlas
  for_deterministic_risk_engine: ImprovementItem[]; // Mejoras para risk rules
  priority: 'P0' | 'P1' | 'P2';
}

// Ejemplo:
{
  for_alert_agent: [{
    issue: "Alertas con SL muy ajustado generan stops prematuros",
    proposal: "Aumentar MIN_STOP_LOSS_PCT de 1% a 1.5%",
    expected_impact: "Reducir stops prematuros en 30%",
    evidence: ["3/5 últimos trades cerraron por SL en < 5 min"]
  }]
}
```

---

## Fases de Implementación

### FASE 1: Tipos y Contratos (trading-core)
**Archivos nuevos/modificados:**
- `packages/trading-core/src/types/atlas.ts` (NUEVO)

### FASE 2: Database Schema
**Archivos nuevos:**
- `apps/web/supabase/migrations/20260201000004_atlas_reviews.sql` (NUEVO)

### FASE 3: Atlas Agent (OpenAI)
**Archivos nuevos:**
- `packages/integrations/src/openai/atlas-agent.ts` (NUEVO)

### FASE 4: API Routes
**Archivos modificados/nuevos:**
- `apps/web/app/api/trading/agents/route.ts` (MODIFICAR - agregar case 'atlas')
- `apps/web/app/api/trading/atlas/execute-action/route.ts` (NUEVO)

### FASE 5: Client Hooks
**Archivos nuevos:**
- `apps/web/lib/hooks/use-atlas-manager.ts` (NUEVO)

### FASE 6: UI Components
**Archivos nuevos:**
- `apps/web/app/home/trading/_components/atlas-panel.tsx` (NUEVO)

---

## FASE 1: Tipos y Contratos

### Archivo: `packages/trading-core/src/types/atlas.ts`

```typescript
/**
 * Atlas Trade Manager Types
 * Types for the Atlas agent that manages open trades
 */

// ============================================================================
// ENUMS AND BASIC TYPES
// ============================================================================

export type AtlasDecisionType = 'ATLAS_DECISIONS' | 'NEED_MORE_DATA';
export type GlobalGovernorStatus = 'NORMAL' | 'CAUTION' | 'EMERGENCY';
export type GlobalGovernorAction = 'NONE' | 'PAUSE_NEW_ENTRIES' | 'REQUIRE_HUMAN_APPROVAL' | 'CLOSE_ALL';
export type EntryDecision = 'APPROVE_ENTRY' | 'WAIT' | 'BLOCK';
export type TradeCategory = 'HOLD' | 'DEFEND' | 'OPTIMIZE' | 'EXIT';
export type TradeDecision = 'APPROVE' | 'WAIT' | 'BLOCK';
export type ProgressAssessment = 'GOOD' | 'STALLING' | 'BAD';
export type ActionType = 'MODIFY_STOP' | 'MODIFY_TP' | 'CLOSE_PARTIAL' | 'CLOSE_ALL' | 'CANCEL_ORDER' | 'REPLACE_ORDER';

// ============================================================================
// TIME WINDOWS CONFIG
// ============================================================================

export interface AtlasTimeWindows {
  review_interval_sec: number;        // 600 = 10 minutes
  windows_sec: number[];              // [600, 3600, 14400] = 10m, 1h, 4h
  hard_time_stop_default_sec: number; // 3600 = 1h default
  max_expected_trade_age_sec: number; // 14400 = 4h max
}

// ============================================================================
// LIQUIDATION METRICS
// ============================================================================

export interface LiquidationWindow {
  total_usd: number | null;
  longs_usd: number | null;
  shorts_usd: number | null;
}

export interface LiquidationMetrics {
  last_10m: LiquidationWindow;
  last_1h: LiquidationWindow;
  last_4h: LiquidationWindow;
  source: 'internal_proxy' | 'provider' | 'unknown';
}

// ============================================================================
// GUARDRAILS
// ============================================================================

export interface AtlasGuardrails {
  drift_block_usd: number;
  alpaca_spread_wait_usd: number;
  max_actions_per_cycle: number;
  max_actions_per_trade: number;
  min_seconds_between_modifications: number;
  never_widen_stop: boolean;
}

// ============================================================================
// MARKET REALTIME
// ============================================================================

export interface MarketRealtime {
  hl_mid: number;
  hl_bid: number;
  hl_ask: number;
  alpaca_mid: number | null;
  alpaca_bid: number | null;
  alpaca_ask: number | null;
  drift_usd: number;
  alpaca_spread_usd: number | null;
  funding_rate: number;
  open_interest: number;
  timestamp: number;
}

// ============================================================================
// INDICATORS INTERNAL
// ============================================================================

export interface IndicatorsInternal {
  flush_score: number;
  burst_score: number;
  reclaim_flag: boolean;
  absorption_score: number;
  whale_net_flow_usd: number;
  whale_dominant_direction: 'buying' | 'selling' | 'neutral';
  support_levels: number[];
  resistance_levels: number[];
  atr_1m: number | null;
  atr_5m: number | null;
  chop_index: number | null;
  data_freshness_ms: number;
  ws_connected: boolean;
}

// ============================================================================
// PORTFOLIO STATE
// ============================================================================

export interface PortfolioState {
  equity_usd: number;
  daily_pnl_usd: number;
  daily_dd_limit_usd: number;
  daily_trades_count: number;
  max_trades_per_day: number;
  cooldown_active: boolean;
  cooldown_until: string | null;
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  current_position_value: number;
  max_position_value: number;
}

// ============================================================================
// OPEN TRADE (for Atlas input)
// ============================================================================

export interface OpenTradeRiskPlan {
  original_stop_loss: number;
  original_take_profit: number;
  current_stop_loss: number;
  current_take_profit: number;
  time_stop_sec: number | null;
  invalidation_level: number;
  r_multiple_target: number;
}

export interface OpenTrade {
  trade_id: string;
  alert_id: string | null;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  entry_time: string;
  size_usd: number;
  current_price: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_pct: number;
  mfe_usd: number;           // Max Favorable Excursion
  mae_usd: number;           // Max Adverse Excursion
  age_sec: number;
  last_review_ts: number | null;
  review_count: number;
  risk_plan: OpenTradeRiskPlan;
  pattern_type: string | null;
  thesis_title: string | null;
}

// ============================================================================
// ORDERS STATE
// ============================================================================

export interface OrderState {
  order_id: string;
  trade_id: string;
  type: 'stop' | 'take_profit' | 'entry';
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  price: number;
  qty: number;
  filled_qty: number;
  reject_reason: string | null;
  latency_ms: number | null;
}

// ============================================================================
// ALERT CANDIDATE (for entry gatekeeping)
// ============================================================================

export interface AlertCandidate {
  candidate_id: string;
  symbol: string;
  setup: 'LONG' | 'SHORT';
  pattern_type: string;
  confidence: number;
  entry_zone: { min: number; max: number; ideal: number };
  stop_loss: number;
  take_profit: number;
  thesis_summary: string;
  risk_notes: string[];
}

// ============================================================================
// ATLAS BUNDLE (INPUT)
// ============================================================================

export interface AtlasBundle {
  now: number;
  market_realtime: MarketRealtime;
  indicators_internal: IndicatorsInternal;
  portfolio_state: PortfolioState;
  open_trades: OpenTrade[];
  orders_state: OrderState[];
  alert_candidates: AlertCandidate[];
  guardrails: AtlasGuardrails;
  time_windows: AtlasTimeWindows;
  liquidation_metrics: LiquidationMetrics;
}

// ============================================================================
// ATLAS OUTPUT STRUCTURES
// ============================================================================

export interface GlobalGovernor {
  status: GlobalGovernorStatus;
  action: GlobalGovernorAction;
  reasons: string[];
}

export interface ExecutionHint {
  preferred_order_type: 'limit' | 'market' | 'stop_limit';
  entry_logic: string;
  stop_logic: string;
  tp_logic: string;
  notional_usd_cap: number | null;
  constraints: string[];
}

export interface EntryGatekeeping {
  candidate_id: string;
  setup: 'LONG' | 'SHORT';
  decision: EntryDecision;
  why: string[];
  risk_flags: string[];
  execution_hint: ExecutionHint;
  confidence: {
    score_0_100: number;
    missing_data: string[];
  };
}

export interface TradeReview {
  review_interval_sec: number;
  is_due: boolean;
  last_review_ts: number | null;
  current_review_ts: number;
  window_used_sec: number;
  progress_assessment: ProgressAssessment;
  progress_notes: string[];
}

export interface ManagementThesis {
  summary: string;
  market_read: string[];
  invalidation: string[];
}

export interface TradeActionPayload {
  venue: 'ALPACA' | 'HYPERLIQUID';
  mode: 'paper' | 'live';
  side: 'buy' | 'sell' | null;
  order_type: 'market' | 'limit' | 'stop_limit' | null;
  new_stop_price: number | null;
  new_tp_price: number | null;
  qty: number | null;
  notional_usd: number | null;
  time_in_force: 'gtc' | 'ioc' | null;
  reason: string;
}

export interface TradeAction {
  type: ActionType;
  order_id: string | null;
  payload: TradeActionPayload;
  constraints_checked: string[];
}

export interface RiskSnapshot {
  unrealized_pnl_usd: number | null;
  mfe_usd: number | null;
  mae_usd: number | null;
  age_sec: number | null;
  time_stop_sec: number | null;
  volatility_state: string | null;
  atr_1m: number | null;
  chop_risk: string | null;
  drift_usd: number | null;
  alpaca_spread: number | null;
  liq_10m_total_usd: number | null;
  liq_10m_is_proxy: boolean | null;
}

export interface TradeManagement {
  trade_id: string;
  review: TradeReview;
  category: TradeCategory;
  decision: TradeDecision;
  management_thesis: ManagementThesis;
  actions: TradeAction[];
  profit_optimization_notes: string[];
  risk_snapshot: RiskSnapshot;
  confidence: {
    score_0_100: number;
    evidence: string[];
    missing_data: string[];
  };
}

export interface InputsDigest {
  hl_mid: number | null;
  alpaca_mid: number | null;
  drift_usd: number | null;
  alpaca_spread: number | null;
  flush_score: number | null;
  burst_score: number | null;
  reclaim_flag: boolean | null;
  absorption_score: number | null;
  open_trades_count: number | null;
  daily_pnl_usd: number | null;
  liq_10m_total_usd: number | null;
}

export interface DecisionsDigest {
  entries: {
    approved: number;
    wait: number;
    blocked: number;
  };
  trade_actions_total: number;
  global_action: string;
}

export interface AnalysisLog {
  cycle_id: string;
  inputs_digest: InputsDigest;
  decisions_digest: DecisionsDigest;
  notable_events: string[];
  data_quality: {
    ws_connected: boolean | null;
    data_freshness_ms: number | null;
    missing_fields: string[];
  };
}

export interface ImprovementItem {
  issue: string;
  proposal: string;
  expected_impact: string;
  evidence: string[];
}

export interface ImprovementPlan {
  for_alert_agent: ImprovementItem[];
  for_atlas_trade_manager: ImprovementItem[];
  for_deterministic_risk_engine: ImprovementItem[];
  priority: 'P0' | 'P1' | 'P2';
}

export interface AtlasTelemetry {
  cooldown_active: boolean | null;
  kill_switch_active: boolean | null;
  daily_dd_limit_usd: number | null;
  daily_pnl_usd: number | null;
  latency_ms_est: number | null;
}

// ============================================================================
// ATLAS RESPONSE (OUTPUT)
// ============================================================================

export interface AtlasResponse {
  type: AtlasDecisionType;
  ts: number;
  symbol: string;
  global_governor: GlobalGovernor;
  entry_gatekeeping: EntryGatekeeping[];
  trade_management: TradeManagement[];
  analysis_log: AnalysisLog;
  improvement_plan: ImprovementPlan;
  telemetry: AtlasTelemetry;
}

// ============================================================================
// ATLAS REQUEST
// ============================================================================

export interface AtlasRequest {
  bundle: AtlasBundle;
  strategy_id?: string;
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface AtlasReviewRecord {
  id: string;
  user_id: string;
  trade_id: string;
  review_ts: string;
  cycle_id: string;
  progress_assessment: ProgressAssessment;
  category: TradeCategory;
  mfe_usd: number;
  mae_usd: number;
  unrealized_pnl_usd: number;
  age_sec: number;
  actions_proposed: TradeAction[];
  notes_json: Record<string, unknown>;
  created_at: string;
}

export interface AtlasDecisionRecord {
  id: string;
  user_id: string;
  trade_id: string;
  review_id: string;
  action_type: ActionType;
  payload_json: TradeActionPayload;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  created_at: string;
}
```

### Actualizar exports en `packages/trading-core/src/types/index.ts`:

```typescript
// Agregar al final
export * from './atlas';
```

---

## FASE 2: Database Schema

### Archivo: `apps/web/supabase/migrations/20260201000004_atlas_reviews.sql`

```sql
-- ============================================================================
-- Atlas Trade Manager Tables
-- Tables for tracking trade reviews and management decisions
-- ============================================================================

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
  progress_assessment VARCHAR(20) NOT NULL CHECK (progress_assessment IN ('GOOD', 'STALLING', 'BAD')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('HOLD', 'DEFEND', 'OPTIMIZE', 'EXIT')),

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
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_user_trade ON public.atlas_reviews(user_id, trade_id);
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_trade_ts ON public.atlas_reviews(trade_id, review_ts DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_reviews_cycle ON public.atlas_reviews(cycle_id);

-- ============================================================================
-- Atlas Decisions Table
-- Tracks individual actions proposed by Atlas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.atlas_reviews(id) ON DELETE CASCADE,

  -- Action Details
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
    'MODIFY_STOP', 'MODIFY_TP', 'CLOSE_PARTIAL', 'CLOSE_ALL', 'CANCEL_ORDER', 'REPLACE_ORDER'
  )),
  payload_json JSONB NOT NULL,

  -- Execution Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'skipped')),
  executed_at TIMESTAMPTZ,
  execution_result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_user_status ON public.atlas_decisions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_trade ON public.atlas_decisions(trade_id);
CREATE INDEX IF NOT EXISTS idx_atlas_decisions_pending ON public.atlas_decisions(user_id) WHERE status = 'pending';

-- ============================================================================
-- Atlas Cycles Table
-- Tracks each Atlas analysis cycle (global state)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cycle Metadata
  cycle_id VARCHAR(50) NOT NULL UNIQUE,
  cycle_ts TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cycle Type: 'entry' (5min) or 'trade' (10min)
  cycle_type VARCHAR(10) NOT NULL DEFAULT 'entry' CHECK (cycle_type IN ('entry', 'trade')),

  -- Global Governor State
  global_status VARCHAR(20) NOT NULL CHECK (global_status IN ('NORMAL', 'CAUTION', 'EMERGENCY')),
  global_action VARCHAR(30) NOT NULL CHECK (global_action IN (
    'NONE', 'PAUSE_NEW_ENTRIES', 'REQUIRE_HUMAN_APPROVAL', 'CLOSE_ALL'
  )),
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_user_ts ON public.atlas_cycles(user_id, cycle_ts DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_status ON public.atlas_cycles(user_id, global_status);
CREATE INDEX IF NOT EXISTS idx_atlas_cycles_type ON public.atlas_cycles(user_id, cycle_type, cycle_ts DESC);

-- ============================================================================
-- Extend paper_orders for Atlas tracking
-- ============================================================================

-- Add MFE/MAE tracking columns if they don't exist
DO $$ BEGIN
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS mfe_usd DECIMAL(20, 2) DEFAULT 0;
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS mae_usd DECIMAL(20, 2) DEFAULT 0;
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS last_review_ts TIMESTAMPTZ;
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS original_stop_loss DECIMAL(20, 8);
  ALTER TABLE public.paper_orders ADD COLUMN IF NOT EXISTS original_take_profit DECIMAL(20, 8);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.atlas_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_cycles ENABLE ROW LEVEL SECURITY;

-- Atlas Reviews
CREATE POLICY "Users can view own atlas reviews"
  ON public.atlas_reviews FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own atlas reviews"
  ON public.atlas_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Atlas Decisions
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

-- Atlas Cycles
CREATE POLICY "Users can view own atlas cycles"
  ON public.atlas_cycles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own atlas cycles"
  ON public.atlas_cycles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_atlas_reviews_updated_at
  BEFORE UPDATE ON public.atlas_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Enable Realtime
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.atlas_decisions;
```

---

## FASE 3: Atlas Agent (OpenAI)

### Archivo: `packages/integrations/src/openai/atlas-agent.ts`

**Estructura del archivo:**

```typescript
/**
 * Atlas Trade Manager Agent
 * AI agent for managing open trades with 10-minute review cycles
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentConfig, AgentContext, AgentTrace } from './types';
import type { AtlasBundle, AtlasRequest, AtlasResponse } from '@kit/trading-core';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4000;
const ATLAS_TEMPERATURE = 0.2; // Even lower than Sentinel for consistency

// ============================================================================
// SYSTEM PROMPT (from user's specification)
// ============================================================================

const ATLAS_SYSTEM_PROMPT = `[... el prompt completo del usuario ...]`;

// ============================================================================
// ATLAS AGENT CLASS
// ============================================================================

export class AtlasAgent {
  private openai: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(config: AgentConfig) {
    // Similar structure to SentinelAgent
  }

  async manage(
    request: AtlasRequest,
    context: AgentContext
  ): Promise<{ response: AtlasResponse; trace: AgentTrace }> {
    // Build user prompt from bundle
    // Call OpenAI with JSON mode
    // Parse and validate response
    // Return typed response + trace
  }

  private buildUserPrompt(bundle: AtlasBundle): string {
    // Format bundle data for the LLM
  }

  private buildResponse(raw: Record<string, unknown>, bundle: AtlasBundle): AtlasResponse {
    // Parse raw JSON to typed AtlasResponse
  }
}

export function createAtlasAgent(config?: Partial<AgentConfig>): AtlasAgent {
  // Factory function
}
```

### Actualizar exports en `packages/integrations/src/openai/index.ts`:

```typescript
export { AtlasAgent, createAtlasAgent } from './atlas-agent';
```

---

## FASE 4: API Routes

### 4.1 Modificar: `apps/web/app/api/trading/agents/route.ts`

Agregar **dos cases separados** para Atlas: `atlas-entry` (cada 5 min) y `atlas-trades` (cada 10 min).

```typescript
// ============================================================================
// CASE: ATLAS-ENTRY (Entry Gatekeeping - cada 5 minutos)
// Solo analiza alertas pendientes y decide si ejecutarlas
// ============================================================================
case 'atlas-entry': {
  const atlasAgent = createAtlasAgent();

  // 1. Fetch pending alerts (status='new' ONLY)
  const { data: pendingAlerts } = await client
    .from('agent_alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'new')  // <-- SOLO alertas pendientes
    .order('created_at', { ascending: true })
    .limit(10);

  if (!pendingAlerts || pendingAlerts.length === 0) {
    return NextResponse.json({
      message: 'No pending alerts to analyze',
      entries: [],
      pendingAlertsRemaining: 0,
    });
  }

  // 2. Build alert candidates for Atlas
  const alertCandidates = pendingAlerts.map((alert) => ({
    candidate_id: alert.id,
    symbol: alert.symbol,
    setup: alert.setup,
    pattern_type: alert.pattern_json?.type || 'unknown',
    confidence: alert.confidence,
    entry_zone: alert.execution_json?.entry_zone || {},
    stop_loss: alert.execution_json?.stop_loss,
    take_profit: alert.execution_json?.take_profit,
    thesis_summary: alert.thesis_json?.title || '',
    risk_notes: alert.risk_notes || [],
  }));

  // 3. Get market data for analysis
  const { data: marketData } = await client.rpc('get_current_market_data');

  // 4. Call Atlas for entry gatekeeping analysis
  const atlasResult = await atlasAgent.analyzeEntries({
    alert_candidates: alertCandidates,
    market_realtime: marketData || {},
    portfolio_state: await getPortfolioState(client, user.id),
  }, context);

  // 5. Process each entry decision
  const ordersCreated: Record<string, string> = {};

  for (const entry of atlasResult.response.entry_gatekeeping) {
    const alertId = entry.candidate_id;

    if (entry.decision === 'APPROVE_ENTRY') {
      // Find the original alert
      const alert = pendingAlerts.find((a) => a.id === alertId);
      if (!alert || !alert.execution_json) continue;

      const exec = alert.execution_json;

      // Create paper order
      const { data: newOrder, error: orderError } = await client
        .from('paper_orders')
        .insert({
          user_id: user.id,
          symbol: alert.symbol,
          side: entry.setup.toLowerCase(),
          entry_price: exec.entry_price,
          quantity: exec.size_units || 1,
          stop_loss: exec.stop_loss,
          take_profit: exec.take_profit,
          status: 'open',
          order_type: entry.execution_hint?.preferred_order_type || 'market',
          source: 'atlas_entry_gatekeeping',
          alert_id: alertId,
          original_stop_loss: exec.stop_loss,
          original_take_profit: exec.take_profit,
          notes: JSON.stringify({
            atlas_decision: 'APPROVE_ENTRY',
            confidence: entry.confidence.score_0_100,
            why: entry.why,
          }),
        })
        .select('id')
        .single();

      if (!orderError && newOrder) {
        ordersCreated[alertId] = newOrder.id;

        // Mark alert as ACTIONED (won't be analyzed again)
        await client
          .from('agent_alerts')
          .update({
            status: 'actioned',
            actioned_at: new Date().toISOString(),
          })
          .eq('id', alertId);

        console.log(`[Atlas Entry] ✅ Created order ${newOrder.id} from alert ${alertId}`);
      }
    } else if (entry.decision === 'BLOCK') {
      // Mark alert as DISMISSED (won't be analyzed again)
      await client
        .from('agent_alerts')
        .update({
          status: 'dismissed',
          viewed_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      console.log(`[Atlas Entry] ❌ Blocked alert ${alertId}: ${entry.why.join(', ')}`);
    }
    // WAIT: Leave as 'new', will be analyzed in next 5-min cycle
  }

  // 6. Store entry cycle
  await client.from('atlas_cycles').insert({
    user_id: user.id,
    cycle_id: `entry-${Date.now()}`,
    cycle_type: 'entry', // <-- New field to distinguish cycle type
    global_status: atlasResult.response.global_governor?.status || 'NORMAL',
    global_action: atlasResult.response.global_governor?.action || 'NONE',
    entries_approved: Object.keys(ordersCreated).length,
    entries_wait: atlasResult.response.entry_gatekeeping.filter((e) => e.decision === 'WAIT').length,
    entries_blocked: atlasResult.response.entry_gatekeeping.filter((e) => e.decision === 'BLOCK').length,
    trades_reviewed: 0, // Entry cycles don't review trades
    total_actions_proposed: 0,
    full_response_json: atlasResult.response,
    latency_ms: atlasResult.trace.latencyMs,
  });

  // Count remaining pending alerts
  const { count } = await client
    .from('agent_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'new');

  return NextResponse.json({
    entries: atlasResult.response.entry_gatekeeping,
    ordersCreated,
    pendingAlertsRemaining: count || 0,
    trace: {
      agentName: 'atlas-entry',
      latencyMs: atlasResult.trace.latencyMs,
    },
  });
}

// ============================================================================
// CASE: ATLAS-TRADES (Trade Management - cada 10 minutos)
// Solo gestiona posiciones abiertas
// ============================================================================
case 'atlas-trades': {
  const atlasAgent = createAtlasAgent();

  // 1. Fetch open trades
  const { data: openTrades } = await client
    .from('paper_orders')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'open');

  if (!openTrades || openTrades.length === 0) {
    return NextResponse.json({
      message: 'No open trades to manage',
      trade_management: [],
    });
  }

  // 2. Get market data and portfolio state
  const { data: marketData } = await client.rpc('get_current_market_data');
  const portfolioState = await getPortfolioState(client, user.id);

  // 3. Call Atlas for trade management analysis
  const atlasResult = await atlasAgent.manageTrades({
    open_trades: openTrades.map(formatOpenTrade),
    market_realtime: marketData || {},
    portfolio_state: portfolioState,
  }, context);

  // 4. Store trade reviews and pending decisions
  for (const tm of atlasResult.response.trade_management) {
    if (!tm.review?.is_due) continue;

    // Insert review record
    const { data: reviewRecord } = await client.from('atlas_reviews').insert({
      user_id: user.id,
      trade_id: tm.trade_id,
      cycle_id: `trade-${Date.now()}`,
      progress_assessment: tm.review.progress_assessment,
      category: tm.category,
      mfe_usd: tm.risk_snapshot?.mfe_usd || 0,
      mae_usd: tm.risk_snapshot?.mae_usd || 0,
      unrealized_pnl_usd: tm.risk_snapshot?.unrealized_pnl_usd || 0,
      age_sec: tm.risk_snapshot?.age_sec || 0,
      actions_proposed: tm.actions,
      notes_json: {
        thesis: tm.management_thesis,
        profit_notes: tm.profit_optimization_notes,
        confidence: tm.confidence,
      },
    }).select('id').single();

    // Store pending decisions for execution
    for (const action of tm.actions) {
      await client.from('atlas_decisions').insert({
        user_id: user.id,
        trade_id: tm.trade_id,
        review_id: reviewRecord?.id,
        action_type: action.type,
        payload_json: action.payload,
        status: 'pending',
      });
    }

    // Update paper_order with latest review info
    await client.from('paper_orders')
      .update({
        last_review_ts: new Date().toISOString(),
        review_count: (openTrades.find((t) => t.id === tm.trade_id)?.review_count || 0) + 1,
        mfe_usd: tm.risk_snapshot?.mfe_usd,
        mae_usd: tm.risk_snapshot?.mae_usd,
      })
      .eq('id', tm.trade_id);
  }

  // 5. Store trade management cycle
  await client.from('atlas_cycles').insert({
    user_id: user.id,
    cycle_id: `trade-${Date.now()}`,
    cycle_type: 'trade', // <-- Distinguishes from 'entry' cycles
    global_status: atlasResult.response.global_governor?.status || 'NORMAL',
    global_action: atlasResult.response.global_governor?.action || 'NONE',
    entries_approved: 0, // Trade cycles don't handle entries
    entries_wait: 0,
    entries_blocked: 0,
    trades_reviewed: atlasResult.response.trade_management.length,
    total_actions_proposed: atlasResult.response.trade_management.reduce(
      (sum, tm) => sum + (tm.actions?.length || 0), 0
    ),
    full_response_json: atlasResult.response,
    latency_ms: atlasResult.trace.latencyMs,
  });

  return NextResponse.json({
    trade_management: atlasResult.response.trade_management,
    global_governor: atlasResult.response.global_governor,
    improvement_plan: atlasResult.response.improvement_plan,
    trace: {
      agentName: 'atlas-trades',
      latencyMs: atlasResult.trace.latencyMs,
      tokensUsed: atlasResult.trace.tokensInput + atlasResult.trace.tokensOutput,
    },
  });
}
```

### 4.2 Nuevo: `apps/web/app/api/trading/atlas/execute-action/route.ts`

```typescript
/**
 * Atlas Action Executor
 * Executes pending Atlas decisions (modify SL/TP, close positions)
 */

export async function POST(request: NextRequest) {
  // 1. Auth check
  // 2. Get decision_id from body
  // 3. Fetch decision from atlas_decisions
  // 4. Validate decision is pending and belongs to user
  // 5. Execute action based on action_type:
  //    - MODIFY_STOP: Update paper_order.stop_loss
  //    - MODIFY_TP: Update paper_order.take_profit
  //    - CLOSE_PARTIAL: Create close API call with partial qty
  //    - CLOSE_ALL: Call existing close endpoint
  // 6. Update decision status to 'executed' or 'failed'
  // 7. Return result
}
```

---

## FASE 5: Client Hooks

### 5.1 Archivo: `apps/web/lib/hooks/use-atlas-entry-gatekeeping.ts` (NUEVO)

```typescript
'use client';

/**
 * Atlas Entry Gatekeeping Hook
 * Analyzes pending alerts every 5 minutes and decides whether to execute them
 *
 * IMPORTANT: This hook ONLY handles entry decisions for pending alerts
 * It does NOT manage open trades - that's handled by useAtlasTradeManager
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { EntryGatekeeping, AlertCandidate } from '@kit/trading-core';

// ============================================================================
// CONSTANTS
// ============================================================================

const ENTRY_GATEKEEPING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UseAtlasEntryGatekeepingOptions {
  enabled?: boolean;
  intervalMs?: number;
  onEntryApproved?: (entry: EntryGatekeeping, orderId: string) => void;
  onEntryBlocked?: (entry: EntryGatekeeping) => void;
  onEntryWait?: (entry: EntryGatekeeping) => void;
}

interface EntryGatekeepingResult {
  approved: number;
  blocked: number;
  wait: number;
  ordersCreated: string[];
}

export function useAtlasEntryGatekeeping(
  options: UseAtlasEntryGatekeepingOptions = {}
) {
  const {
    enabled = true,
    intervalMs = ENTRY_GATEKEEPING_INTERVAL_MS,
    onEntryApproved,
    onEntryBlocked,
    onEntryWait,
  } = options;

  // State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<EntryGatekeepingResult | null>(null);
  const [lastCycleTime, setLastCycleTime] = useState<Date | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);

  // Run Entry Gatekeeping cycle
  const runCycle = useCallback(async () => {
    if (isAnalyzingRef.current || !enabled) return;

    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setError(null);

    try {
      // Call the atlas-entry endpoint
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'atlas-entry', // <-- Separate action for entry gatekeeping
        }),
      });

      if (!response.ok) throw new Error('Entry gatekeeping analysis failed');

      const result = await response.json();

      // Process results
      const approved = result.entries?.filter((e: EntryGatekeeping) => e.decision === 'APPROVE_ENTRY') || [];
      const blocked = result.entries?.filter((e: EntryGatekeeping) => e.decision === 'BLOCK') || [];
      const wait = result.entries?.filter((e: EntryGatekeeping) => e.decision === 'WAIT') || [];

      setLastResult({
        approved: approved.length,
        blocked: blocked.length,
        wait: wait.length,
        ordersCreated: result.ordersCreated || [],
      });
      setLastCycleTime(new Date());
      setCycleCount((c) => c + 1);
      setPendingAlertsCount(result.pendingAlertsRemaining || 0);

      // Callbacks
      approved.forEach((entry: EntryGatekeeping) => {
        onEntryApproved?.(entry, result.ordersCreated?.[entry.candidate_id]);
      });
      blocked.forEach((entry: EntryGatekeeping) => onEntryBlocked?.(entry));
      wait.forEach((entry: EntryGatekeeping) => onEntryWait?.(entry));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [enabled, onEntryApproved, onEntryBlocked, onEntryWait]);

  // Set up interval
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial run after 10 seconds
    const initialTimeout = setTimeout(runCycle, 10000);

    // Periodic runs every 5 minutes
    intervalRef.current = setInterval(runCycle, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, runCycle]);

  // Manual trigger
  const triggerCycle = useCallback(() => {
    runCycle();
  }, [runCycle]);

  return {
    isAnalyzing,
    lastResult,
    lastCycleTime,
    cycleCount,
    pendingAlertsCount,
    error,
    triggerCycle,
  };
}
```

---

### 5.2 Archivo: `apps/web/lib/hooks/use-atlas-trade-manager.ts` (NUEVO)

```typescript
'use client';

/**
 * Atlas Trade Manager Hook
 * Manages open trades with 10-minute review cycles
 *
 * IMPORTANT: This hook ONLY handles management of open trades
 * It does NOT handle entry decisions - that's handled by useAtlasEntryGatekeeping
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TradeManagement, OpenTrade } from '@kit/trading-core';

// ============================================================================
// CONSTANTS
// ============================================================================

const TRADE_MANAGEMENT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface UseAtlasTradeManagerOptions {
  enabled?: boolean;
  intervalMs?: number;
  onCycleComplete?: (trades: TradeManagement[]) => void;
  onActionRequired?: (trade: TradeManagement) => void;
  onEmergency?: (reason: string) => void;
}

export function useAtlasTradeManager(
  openTrades: OpenTrade[],
  options: UseAtlasTradeManagerOptions = {}
) {
  const {
    enabled = true,
    intervalMs = TRADE_MANAGEMENT_INTERVAL_MS,
    onCycleComplete,
    onActionRequired,
    onEmergency,
  } = options;

  // State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastCycle, setLastCycle] = useState<AtlasResponse | null>(null);
  const [lastCycleTime, setLastCycleTime] = useState<Date | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);

  // State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<TradeManagement[] | null>(null);
  const [lastCycleTime, setLastCycleTime] = useState<Date | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);

  // Run Trade Management cycle
  const runCycle = useCallback(async () => {
    if (isAnalyzingRef.current || !enabled || openTrades.length === 0) return;

    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setError(null);

    try {
      // Call the atlas-trades endpoint
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'atlas-trades', // <-- Separate action for trade management
        }),
      });

      if (!response.ok) throw new Error('Trade management analysis failed');

      const result = await response.json();

      setLastResult(result.trade_management);
      setLastCycleTime(new Date());
      setCycleCount((c) => c + 1);

      onCycleComplete?.(result.trade_management);

      // Check for emergency
      if (result.global_governor?.status === 'EMERGENCY') {
        onEmergency?.(result.global_governor.reasons?.join(', ') || 'Emergency triggered');
      }

      // Check for trades with pending actions
      const tradesWithActions = result.trade_management?.filter(
        (tm: TradeManagement) => tm.actions?.length > 0
      ) || [];
      tradesWithActions.forEach((tm: TradeManagement) => onActionRequired?.(tm));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [enabled, openTrades, onCycleComplete, onEmergency, onActionRequired]);

  // Set up interval - EVERY 10 MINUTES
  useEffect(() => {
    if (!enabled || openTrades.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial run after 15 seconds (after entry gatekeeping has run)
    const initialTimeout = setTimeout(runCycle, 15000);

    // Periodic runs every 10 minutes
    intervalRef.current = setInterval(runCycle, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, openTrades.length, intervalMs, runCycle]);

  // Manual trigger
  const triggerCycle = useCallback(() => {
    runCycle();
  }, [runCycle]);

  return {
    isAnalyzing,
    lastResult,
    lastCycleTime,
    cycleCount,
    error,
    triggerCycle,
  };
}
```

---

## FASE 6: UI Components

### Archivo: `apps/web/app/home/trading/_components/atlas-panel.tsx`

```tsx
'use client';

/**
 * Atlas Trade Manager Panel
 * Shows Atlas analysis status and pending actions
 */

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { AtlasResponse } from '@kit/trading-core';

interface AtlasPanelProps {
  lastCycle: AtlasResponse | null;
  lastCycleTime: Date | null;
  isAnalyzing: boolean;
  onTriggerCycle: () => void;
  onExecuteAction: (decisionId: string) => void;
}

export function AtlasPanel({
  lastCycle,
  lastCycleTime,
  isAnalyzing,
  onTriggerCycle,
  onExecuteAction,
}: AtlasPanelProps) {
  // Render global governor status
  // Render pending actions
  // Render trade reviews summary
  // Action buttons
}
```

---

## Resumen de Intervalos y Ciclos

### Configuración de Tiempos

| Componente | Intervalo | Propósito |
|------------|-----------|-----------|
| **Sentinel** | 30 segundos | Detectar patrones y generar alertas |
| **Atlas Entry Gatekeeping** | 5 minutos | Decidir si ejecutar alertas pendientes |
| **Atlas Trade Management** | 10 minutos | Gestionar posiciones abiertas |

### Ciclo de Vida de Alertas

```
agent_alerts.status:

  'new'       → Alerta pendiente, será analizada por Entry Gatekeeping
  'actioned'  → Alerta ejecutada, paper order creado (NO se vuelve a analizar)
  'dismissed' → Alerta descartada/bloqueada (NO se vuelve a analizar)
  'expired'   → Alerta expiró sin ser procesada (expires_at excedido)
  'viewed'    → Usuario vio la alerta pero no tomó acción
```

### Garantías del Sistema

1. **Entry Gatekeeping solo analiza status='new'**
   - Cada alerta se analiza una vez por ciclo de 5 min
   - Si decisión = APPROVE_ENTRY → status cambia a 'actioned'
   - Si decisión = BLOCK → status cambia a 'dismissed'
   - Si decisión = WAIT → status permanece 'new' (próximo ciclo)

2. **Trade Management solo revisa posiciones abiertas**
   - Solo paper_orders con status='open'
   - Cada 10 minutos revisa y propone acciones
   - Acciones se almacenan en atlas_decisions para ejecución

---

## Dependencias y Compatibilidad

### No se modifica (existente):
- ✅ `SentinelAgent` - Sin cambios
- ✅ `use-alert-collector.ts` - Sin cambios
- ✅ `use-paper-orders.ts` - Sin cambios
- ✅ `use-paper-order-monitor.ts` - Sin cambios
- ✅ Todas las API routes de alerts y paper-orders - Sin cambios
- ✅ Database tables existentes - Sin cambios (solo se agregan columnas opcionales)

### Se agrega (nuevo):
- 🆕 `AtlasAgent` class (con dos métodos: `analyzeEntries()` y `manageTrades()`)
- 🆕 Atlas types en trading-core
- 🆕 3 nuevas tablas: `atlas_reviews`, `atlas_decisions`, `atlas_cycles`
- 🆕 Campo `cycle_type` en `atlas_cycles` ('entry' o 'trade')
- 🆕 Columnas en `paper_orders`: `mfe_usd`, `mae_usd`, `last_review_ts`, `review_count`
- 🆕 API route case `'atlas-entry'` en agents endpoint (5 min)
- 🆕 API route case `'atlas-trades'` en agents endpoint (10 min)
- 🆕 API route `/api/trading/atlas/execute-action`
- 🆕 `useAtlasEntryGatekeeping` hook (5 min cycle)
- 🆕 `useAtlasTradeManager` hook (10 min cycle)
- 🆕 `AtlasPanel` component

---

## Orden de Implementación

```
FASE 1: Types (trading-core)
  └── atlas.ts

FASE 2: Database
  └── Migration SQL (con cycle_type en atlas_cycles)

FASE 3: Agent (integrations)
  └── atlas-agent.ts
      ├── analyzeEntries() - Para Entry Gatekeeping
      └── manageTrades()   - Para Trade Management

FASE 4: API Routes (web)
  ├── Modify agents/route.ts
  │   ├── case 'atlas-entry'  - Entry Gatekeeping (5 min)
  │   └── case 'atlas-trades' - Trade Management (10 min)
  └── New atlas/execute-action/route.ts

FASE 5: Hooks (web)
  ├── use-atlas-entry-gatekeeping.ts (5 min interval)
  └── use-atlas-trade-manager.ts (10 min interval)

FASE 6: UI (web)
  └── atlas-panel.tsx

FASE 7: Integration
  └── Add to trading page
```

---

## Testing Checklist

### Validación Pre-Deploy:
- [ ] `pnpm run typecheck` - Sin errores
- [ ] `pnpm run lint` - Sin errores
- [ ] `pnpm run build` - Sin errores
- [ ] Migration aplicada correctamente
- [ ] Sentinel sigue funcionando (regression test)
- [ ] Paper orders siguen funcionando (regression test)

### Testing Entry Gatekeeping (cada 5 min):
- [ ] Hook `useAtlasEntryGatekeeping` ejecuta cada 5 minutos
- [ ] Solo analiza alertas con status='new'
- [ ] APPROVE_ENTRY crea paper order correctamente
- [ ] APPROVE_ENTRY cambia alert status a 'actioned'
- [ ] BLOCK cambia alert status a 'dismissed'
- [ ] WAIT mantiene alert status como 'new'
- [ ] Alertas 'actioned' o 'dismissed' NO se re-analizan
- [ ] Cycle se guarda en atlas_cycles con cycle_type='entry'

### Testing Trade Management (cada 10 min):
- [ ] Hook `useAtlasTradeManager` ejecuta cada 10 minutos
- [ ] Solo revisa paper_orders con status='open'
- [ ] Reviews se guardan en atlas_reviews
- [ ] Decisions se guardan en atlas_decisions
- [ ] MFE/MAE tracking funciona
- [ ] MODIFY_STOP ejecuta correctamente
- [ ] MODIFY_TP ejecuta correctamente
- [ ] CLOSE_PARTIAL ejecuta correctamente
- [ ] CLOSE_ALL ejecuta correctamente
- [ ] Cycle se guarda en atlas_cycles con cycle_type='trade'

### Testing Global:
- [ ] Emergency status se detecta y notifica
- [ ] Los dos hooks funcionan independientemente
- [ ] No hay conflictos entre Entry y Trade cycles

---

## Estimación de Esfuerzo

| Fase | Complejidad | Archivos |
|------|-------------|----------|
| 1. Types | Media | 1 nuevo, 1 modificado |
| 2. Database | Baja | 1 nuevo |
| 3. Agent | Alta | 1 nuevo, 1 modificado |
| 4. API Routes | Media | 1 modificado (2 cases), 1 nuevo |
| 5. Hooks | Media | 2 nuevos (entry + trade) |
| 6. UI | Media | 1 nuevo |
| **Total** | **Alta** | **8 archivos** |

---

## Feature Flags y Configuración

```env
# Feature Flags (agregar a .env.local)
NEXT_PUBLIC_ENABLE_ATLAS_AGENT=true

# Intervalos (opcional, defaults en código)
ATLAS_ENTRY_INTERVAL_MS=300000    # 5 minutos (default)
ATLAS_TRADE_INTERVAL_MS=600000    # 10 minutos (default)

# Thresholds (opcional)
ATLAS_ENTRY_CONFIDENCE_MIN=0.70   # Mínimo para aprobar entrada
```

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Conflicto con Sentinel | Alto | Mantener agentes independientes, no compartir estado |
| Re-análisis de alertas | Alto | Status tracking estricto ('actioned', 'dismissed') |
| Costo de OpenAI | Medio | Intervalos separados (5min entry, 10min trade), temperature bajo |
| Latencia en reviews | Medio | Async processing, no bloquear UI |
| Acciones incorrectas | Alto | Modo paper-only, requiere confirmación humana |
| DB bloat | Bajo | Retention policy para atlas_reviews (30 días) |

---

## Resumen de Cambios Clave

### Intervalos Separados
- **Entry Gatekeeping**: Cada **5 minutos** analiza alertas pendientes
- **Trade Management**: Cada **10 minutos** gestiona posiciones abiertas

### Estados de Alerta
- `new` → Pendiente de análisis (Entry Gatekeeping la procesará)
- `actioned` → Orden creada (NO se vuelve a analizar)
- `dismissed` → Bloqueada/descartada (NO se vuelve a analizar)

### API Actions Separadas
- `atlas-entry` → Solo Entry Gatekeeping
- `atlas-trades` → Solo Trade Management

### Hooks Separados
- `useAtlasEntryGatekeeping` → Ciclo de 5 min
- `useAtlasTradeManager` → Ciclo de 10 min

---

## Próximos Pasos

1. ¿Aprobar este plan?
2. Comenzar con Fase 1 (Types)
3. Continuar secuencialmente hasta Fase 7
4. Testing exhaustivo antes de activar

---

*Plan elaborado por: Arquitecto Agent*
*Fecha: 2026-02-01*
*Versión: 2.0* (Actualizado con intervalos separados)
