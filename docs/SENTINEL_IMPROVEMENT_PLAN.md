# Plan de Mejoras: Sentinel Agent v2.0

> **Documento de Arquitectura** | Autor: /arquitecto
> **Fecha**: 2026-02-01
> **Estado**: PENDIENTE DE APROBACION

---

## 1. Resumen Ejecutivo

Este documento detalla las mejoras propuestas para el agente Sentinel, enfocadas en:

1. **Separación de tipos de alerta**: RISK_ALERT vs TRADE_ALERT
2. **Dual confidence scoring**: setup_confidence + risk_confidence
3. **Contexto multi-timeframe**: Ventanas de 10m, 1h, 4h
4. **Confirmaciones requeridas**: reclaim/absorption events
5. **Threshold dinámico para whales**: Basado en volatilidad/ATR
6. **Cooldown alineado a ventanas de 10m**: Con capacidad de ALERT_UPDATE

---

## 2. Problema Actual

### 2.1 Situación Observada

```
Whale Activity Detected:
- Total FLUSH (sells): ~$2.5M
- Total BURST (buys): ~$400K
- Net Flow: -$2.1M (fuerte presión vendedora)

Sentinel Response:
- decision: "NO_ALERT"
- confidence: 0.55-0.80 (fluctuante)
- Razón: No alcanza MIN_CONFIDENCE de 0.80
```

### 2.2 Diagnóstico

El problema **NO** es que el threshold de 80% sea muy alto. El problema es que:

1. **Una sola métrica de confianza** no distingue entre:
   - Señal de riesgo (RISK_ALERT): "Hay presión vendedora, cuidado"
   - Señal de trading (TRADE_ALERT): "Hay setup para entrar long/short"

2. **Sin contexto temporal**: $2.5M de ventas en 5 minutos ≠ $2.5M en 4 horas

3. **Threshold whale estático**: $50K puede ser ruido en BTC alta volatilidad

4. **Cooldown no alineado**: 5 minutos genéricos vs ventanas de análisis técnico

---

## 3. Arquitectura Propuesta

### 3.1 Nuevo Sistema de Alertas Dual

```
┌─────────────────────────────────────────────────────────────────┐
│                    SENTINEL AGENT v2.0                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input Bundle                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Market Data      │  │ Whale Activity   │  │ Risk State    │ │
│  │ (multi-timeframe)│  │ (dynamic thresh) │  │ (portfolio)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                     │                     │         │
│           └──────────┬──────────┴─────────────────────┘         │
│                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              ANALYSIS ENGINE (OpenAI GPT-4o-mini)           ││
│  │  ┌─────────────────────────┐  ┌───────────────────────────┐ ││
│  │  │   RISK ANALYSIS         │  │   TRADE SETUP ANALYSIS    │ ││
│  │  │   - Whale pressure      │  │   - Pattern detection     │ ││
│  │  │   - Market stress       │  │   - Confirmations         │ ││
│  │  │   - Volatility regime   │  │   - Entry/SL/TP zones     │ ││
│  │  └───────────┬─────────────┘  └─────────────┬─────────────┘ ││
│  │              │                              │               ││
│  │              ▼                              ▼               ││
│  │  ┌─────────────────────┐      ┌─────────────────────────┐   ││
│  │  │ risk_confidence     │      │ setup_confidence        │   ││
│  │  │ (0.0 - 1.0)         │      │ (0.0 - 1.0)             │   ││
│  │  └─────────────────────┘      └─────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                      │                                          │
│                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   DECISION MATRIX                           ││
│  │                                                             ││
│  │  IF risk_confidence >= 0.70:                                ││
│  │    → EMIT RISK_ALERT (with risk_type: pressure/stress/etc)  ││
│  │                                                             ││
│  │  IF setup_confidence >= 0.80 AND confirmations >= 2:        ││
│  │    → EMIT TRADE_ALERT (with full execution_candidate)       ││
│  │                                                             ││
│  │  IF both conditions met:                                    ││
│  │    → EMIT both alerts (RISK_ALERT warns about TRADE_ALERT)  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Nuevo Response Contract

```typescript
// Nuevo tipo de alerta
export type AlertType = 'RISK_ALERT' | 'TRADE_ALERT';

// Tipos de riesgo detectables
export type RiskAlertType =
  | 'WHALE_SELLING_PRESSURE'    // Whales vendiendo fuerte
  | 'WHALE_BUYING_PRESSURE'     // Whales comprando fuerte
  | 'VOLATILITY_SPIKE'          // ATR disparado
  | 'LIQUIDATION_CASCADE_RISK'  // Riesgo de cascada
  | 'MARKET_STRESS'             // Múltiples indicadores de stress
  | 'MOMENTUM_EXHAUSTION';      // Agotamiento de momentum

// Nuevo SentinelResponse v2
export interface SentinelResponseV2 {
  // Decision puede generar múltiples alertas
  decision: 'ALERT' | 'NO_ALERT' | 'NEED_MORE_DATA';

  // NUEVO: Array de alertas (puede haber 0, 1 o 2)
  alerts: SentinelAlert[];

  // NUEVO: Dual confidence
  risk_confidence: number;   // 0.0 - 1.0 (para RISK_ALERT)
  setup_confidence: number;  // 0.0 - 1.0 (para TRADE_ALERT)

  // NUEVO: Contexto multi-timeframe
  timeframe_context: TimeframeContext;

  // NUEVO: Flag para actualización de alerta existente
  updates_alert_id?: string;

  // Mantiene compatibilidad
  pattern?: AlertPattern;
  thesis?: AlertThesis;
  execution_candidate?: AlertExecutionCandidate;
  recommendation: AlertRecommendation;
  risk_notes: string[];
  telemetry: SentinelTelemetry;
}

export interface SentinelAlert {
  type: AlertType;

  // Solo para RISK_ALERT
  risk_type?: RiskAlertType;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  risk_description?: string;

  // Solo para TRADE_ALERT
  pattern?: AlertPattern;
  thesis?: AlertThesis;
  execution_candidate?: AlertExecutionCandidate;

  // Comunes
  confidence: number;
  timeframe: '10m' | '1h' | '4h';
  expires_at: number; // timestamp
}

export interface TimeframeContext {
  tf_10m: TimeframeSnapshot;
  tf_1h: TimeframeSnapshot;
  tf_4h: TimeframeSnapshot;
}

export interface TimeframeSnapshot {
  whale_net_flow_usd: number;
  flush_count: number;
  burst_count: number;
  absorption_count: number;
  price_change_pct: number;
  volume_usd: number;
  volatility_atr: number;
}
```

---

## 4. Archivos a Modificar

### 4.1 Nuevos Tipos (CREAR/MODIFICAR)

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `packages/trading-core/src/types/alert.ts` | MODIFICAR | Agregar `AlertType`, `RiskAlertType`, `SentinelResponseV2`, `TimeframeContext` |
| `packages/trading-core/src/types/bundle.ts` | CREAR | Nuevo archivo para `RealtimeBundleV2` con contexto multi-timeframe |

### 4.2 Sentinel Agent (MODIFICAR)

| Archivo | Cambios |
|---------|---------|
| `packages/integrations/src/openai/sentinel-agent.ts` | - Actualizar `SENTINEL_SYSTEM_PROMPT` para dual analysis<br>- Agregar parseo de `SentinelResponseV2`<br>- Agregar lógica de decisión dual |

### 4.3 Alert Collector Hook (MODIFICAR)

| Archivo | Cambios |
|---------|---------|
| `apps/web/lib/hooks/use-alert-collector.ts` | - Agregar acumuladores por timeframe<br>- Calcular ATR para threshold dinámico<br>- Implementar `buildBundleV2()` |

### 4.4 API Route (MODIFICAR)

| Archivo | Cambios |
|---------|---------|
| `apps/web/app/api/trading/agents/route.ts` | - Actualizar `SENTINEL_CONFIG` para dual thresholds<br>- Agregar lógica de cooldown por timeframe<br>- Soportar `ALERT_UPDATE` |

### 4.5 Database Migration (CREAR)

| Archivo | Cambios |
|---------|---------|
| `apps/web/supabase/migrations/XXXXXXX_sentinel_v2.sql` | - Agregar columna `alert_type` a `agent_alerts`<br>- Agregar columna `risk_type`<br>- Agregar columna `timeframe`<br>- Agregar columna `updates_alert_id` |

---

## 5. Especificaciones Técnicas

### 5.1 Nuevo Prompt del Sentinel (Extracto)

```
## ANALISIS DUAL

Ahora debes realizar DOS análisis independientes:

### 1. RISK ANALYSIS (risk_confidence)
Evalúa si hay condiciones de riesgo de mercado:
- Presión whale: ¿Net flow > $100K en una dirección?
- Volatilidad: ¿ATR actual > 1.5x promedio?
- Stress: ¿Múltiples indicadores alineados negativamente?

Genera RISK_ALERT si risk_confidence >= 0.70

### 2. TRADE SETUP ANALYSIS (setup_confidence)
Evalúa si hay un setup de trading viable:
- Patrón detectado (FLUSH_RECLAIM, BURST_CONTINUATION, etc)
- Confirmaciones mínimas: 2 de (reclaim, absorption, whale, volume, momentum)
- Entry zone clara con R:R >= 1.5

Genera TRADE_ALERT si setup_confidence >= 0.80 AND confirmations >= 2

## CONTEXTO MULTI-TIMEFRAME

Analiza los datos en 3 ventanas temporales:
- 10m: Para scalps y reacciones inmediatas
- 1h: Para swings intraday
- 4h: Para contexto de tendencia

Un TRADE_ALERT debe tener coherencia entre timeframes.
Un RISK_ALERT puede generarse en cualquier timeframe individual.
```

### 5.2 Cálculo de Threshold Dinámico para Whales

```typescript
/**
 * Calcula el threshold de whale dinámico basado en ATR
 *
 * Lógica:
 * - ATR bajo (< 0.5%): threshold = $30K (mercado tranquilo, trades pequeños son significativos)
 * - ATR medio (0.5-1.5%): threshold = $50K (normal)
 * - ATR alto (> 1.5%): threshold = $100K (mucha volatilidad, necesitamos trades grandes)
 */
function calculateDynamicWhaleThreshold(
  currentPrice: number,
  atr_percent: number,
  baseThreshold: number = 50000
): number {
  if (atr_percent < 0.5) {
    return baseThreshold * 0.6; // $30K
  } else if (atr_percent > 1.5) {
    return baseThreshold * 2; // $100K
  }
  return baseThreshold; // $50K
}
```

### 5.3 Sistema de Cooldown por Ventanas de 10m

```typescript
const COOLDOWN_CONFIG = {
  // Cooldown alineado a ventanas de 10 minutos
  WINDOW_SIZE_MS: 10 * 60 * 1000, // 10 minutos

  // Para RISK_ALERT: 1 por ventana (pueden acumularse)
  MAX_RISK_ALERTS_PER_WINDOW: 2,

  // Para TRADE_ALERT: 1 por símbolo por ventana
  MAX_TRADE_ALERTS_PER_WINDOW: 1,

  // Permite ALERT_UPDATE dentro de la misma ventana
  ALLOW_UPDATE_IN_WINDOW: true,
};

/**
 * Obtiene el inicio de la ventana actual de 10m
 */
function getWindowStart(timestamp: number): number {
  return Math.floor(timestamp / COOLDOWN_CONFIG.WINDOW_SIZE_MS)
         * COOLDOWN_CONFIG.WINDOW_SIZE_MS;
}

/**
 * Verifica si podemos emitir una alerta o debemos actualizar una existente
 */
async function checkAlertWindow(
  client: SupabaseClient,
  userId: string,
  symbol: string,
  alertType: AlertType
): Promise<{ canEmit: boolean; updateAlertId?: string }> {
  const windowStart = getWindowStart(Date.now());

  const { data: existingAlerts } = await client
    .from('agent_alerts')
    .select('id, alert_type, created_at')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('alert_type', alertType)
    .gte('created_at', new Date(windowStart).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (!existingAlerts || existingAlerts.length === 0) {
    return { canEmit: true };
  }

  // Ya hay alerta en esta ventana - devolver ID para UPDATE
  if (COOLDOWN_CONFIG.ALLOW_UPDATE_IN_WINDOW) {
    return { canEmit: false, updateAlertId: existingAlerts[0].id };
  }

  return { canEmit: false };
}
```

### 5.4 Requisitos de Confirmaciones

```typescript
interface ConfirmationRequirements {
  // Mínimo de confirmaciones para TRADE_ALERT
  MIN_CONFIRMATIONS: 2;

  // Confirmaciones disponibles
  CONFIRMATIONS: {
    reclaim_confirmed: boolean;    // Precio recuperó nivel
    absorption_confirmed: boolean; // Órdenes grandes absorbidas
    whale_confirmed: boolean;      // Whale flow alineado
    volume_confirmed: boolean;     // Volumen above average
    momentum_confirmed: boolean;   // Momentum en dirección
  };

  // Pesos por confirmación
  WEIGHTS: {
    reclaim_confirmed: 1.5;    // Más importante
    absorption_confirmed: 1.5; // Más importante
    whale_confirmed: 1.0;
    volume_confirmed: 0.5;
    momentum_confirmed: 0.5;
  };
}

/**
 * Calcula score de confirmaciones ponderado
 */
function calculateConfirmationScore(
  confirmations: AlertPatternConfirmations
): { count: number; weightedScore: number } {
  let count = 0;
  let weightedScore = 0;

  for (const [key, value] of Object.entries(confirmations)) {
    if (value) {
      count++;
      weightedScore += CONFIRMATION_WEIGHTS[key as keyof typeof CONFIRMATION_WEIGHTS] || 1;
    }
  }

  return { count, weightedScore };
}
```

---

## 6. Matriz de Decisión

### 6.1 Cuándo Generar RISK_ALERT

| Condición | risk_confidence | Resultado |
|-----------|-----------------|-----------|
| Whale selling > $100K en 10m | 0.70+ | RISK_ALERT: WHALE_SELLING_PRESSURE |
| Whale buying > $100K en 10m | 0.70+ | RISK_ALERT: WHALE_BUYING_PRESSURE |
| ATR > 2x promedio | 0.75+ | RISK_ALERT: VOLATILITY_SPIKE |
| Net whale flow > $500K con posición abierta | 0.80+ | RISK_ALERT: LIQUIDATION_CASCADE_RISK |

### 6.2 Cuándo Generar TRADE_ALERT

| Condición | setup_confidence | Confirmaciones | Resultado |
|-----------|------------------|----------------|-----------|
| FLUSH_RECLAIM detectado | 0.80+ | reclaim + whale | TRADE_ALERT: LONG |
| BURST_CONTINUATION | 0.80+ | volume + momentum | TRADE_ALERT: LONG |
| ABSORPTION_REVERSAL | 0.85+ | absorption + reclaim | TRADE_ALERT |
| LIQUIDATION_CASCADE | 0.90+ | whale + volume + momentum | TRADE_ALERT |

### 6.3 Casos Especiales

| Escenario | Acción |
|-----------|--------|
| RISK_ALERT + TRADE_ALERT simultáneos | Emitir ambos. UI muestra warning en TRADE_ALERT |
| TRADE_ALERT pero posición ya abierta en dirección opuesta | Bloquear TRADE_ALERT, emitir RISK_ALERT |
| RISK_ALERT pero kill_switch activo | Solo loguear, no emitir a UI |

---

## 7. Migración de Base de Datos

```sql
-- Migration: sentinel_v2_alerts
-- Description: Add support for dual alert types and timeframe context

-- Agregar tipo de alerta
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS alert_type TEXT DEFAULT 'TRADE_ALERT'
CHECK (alert_type IN ('RISK_ALERT', 'TRADE_ALERT'));

-- Agregar tipo de riesgo (solo para RISK_ALERT)
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_type TEXT
CHECK (risk_type IS NULL OR risk_type IN (
  'WHALE_SELLING_PRESSURE',
  'WHALE_BUYING_PRESSURE',
  'VOLATILITY_SPIKE',
  'LIQUIDATION_CASCADE_RISK',
  'MARKET_STRESS',
  'MOMENTUM_EXHAUSTION'
));

-- Agregar nivel de riesgo
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_level TEXT
CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high', 'critical'));

-- Agregar timeframe de la alerta
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS timeframe TEXT DEFAULT '10m'
CHECK (timeframe IN ('10m', '1h', '4h'));

-- Agregar referencia a alerta que actualiza (para ALERT_UPDATE)
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS updates_alert_id UUID REFERENCES public.agent_alerts(id);

-- Agregar dual confidence
ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS risk_confidence DECIMAL(3,2);

ALTER TABLE public.agent_alerts
ADD COLUMN IF NOT EXISTS setup_confidence DECIMAL(3,2);

-- Índice para queries de ventanas de cooldown
CREATE INDEX IF NOT EXISTS idx_agent_alerts_window
ON public.agent_alerts(user_id, symbol, alert_type, created_at DESC);

-- Constraint: risk_type solo válido para RISK_ALERT
ALTER TABLE public.agent_alerts
ADD CONSTRAINT chk_risk_type_alert_type
CHECK (
  (alert_type = 'RISK_ALERT' AND risk_type IS NOT NULL) OR
  (alert_type = 'TRADE_ALERT' AND risk_type IS NULL)
);
```

---

## 8. Orden de Implementación

### Fase 1: Types y Migración (1-2 horas)
1. Agregar nuevos tipos en `packages/trading-core/src/types/alert.ts`
2. Crear migración de base de datos
3. Regenerar tipos de Supabase

### Fase 2: Alert Collector (2-3 horas)
1. Agregar acumuladores por timeframe
2. Implementar cálculo de ATR dinámico
3. Implementar `buildBundleV2()`

### Fase 3: Sentinel Agent (3-4 horas)
1. Actualizar system prompt para análisis dual
2. Actualizar parseo de respuesta
3. Implementar lógica de decisión dual
4. Agregar validación de confirmaciones

### Fase 4: API Route (2-3 horas)
1. Actualizar config para dual thresholds
2. Implementar cooldown por ventanas
3. Implementar ALERT_UPDATE
4. Actualizar storage de alertas duales

### Fase 5: Testing (2-3 horas)
1. Tests unitarios para lógica de decisión
2. Tests de integración con API
3. Validación manual con datos reales

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Breaking change en response | Alta | Alto | Versionar response, mantener compatibilidad |
| Aumento de costos LLM | Media | Medio | Prompt optimizado, mismo modelo (gpt-4o-mini) |
| Alert fatigue por RISK_ALERT | Media | Bajo | Rate limiting por ventana de 10m |
| Complexity creep | Media | Medio | Tests exhaustivos, documentación |

---

## 10. Compatibilidad Hacia Atrás

### 10.1 Campos Deprecados (mantener por 2 semanas)
- `confidence` → Se mantiene como alias de `setup_confidence`
- `decision` → Se mantiene, ahora puede generar múltiples alertas

### 10.2 UI Sin Cambios Requeridos
- Las TRADE_ALERT funcionan igual que antes
- Las RISK_ALERT son nuevas y se pueden ignorar inicialmente

### 10.3 Atlas Agent Compatible
- Atlas Entry/Trade Manager sigue recibiendo alertas TRADE_ALERT
- RISK_ALERT son informativas, no requieren acción de Atlas

---

## 11. Métricas de Éxito

| Métrica | Valor Actual | Objetivo |
|---------|--------------|----------|
| Alertas generadas por día | ~5 | 10-15 (incluyendo RISK) |
| Win rate de TRADE_ALERT | 80% | Mantener ≥80% |
| RISK_ALERT accuracy | N/A | ≥70% correctas |
| Tiempo de respuesta | ~3s | Mantener <5s |
| Costo diario LLM | ~$2 | Mantener <$5 |

---

## 12. Checklist de Validación Pre-Deploy

- [ ] Tipos nuevos compilan sin errores
- [ ] Migración SQL ejecuta sin errores
- [ ] Tests de agent pasan
- [ ] Tests de API route pasan
- [ ] Compatibilidad hacia atrás verificada
- [ ] UI muestra ambos tipos de alertas
- [ ] Cooldown por ventanas funciona
- [ ] ALERT_UPDATE funciona
- [ ] Threshold dinámico calculado correctamente
- [ ] Documentación actualizada

---

## 13. Aprobación

| Rol | Nombre | Fecha | Estado |
|-----|--------|-------|--------|
| Arquitecto | /arquitecto | 2026-02-01 | PROPUESTO |
| Desarrollador | - | - | PENDIENTE |
| QA | - | - | PENDIENTE |
| Usuario | - | - | PENDIENTE |

---

**SIGUIENTE PASO**: Aprobar este plan para proceder con la implementación.
