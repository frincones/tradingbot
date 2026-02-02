# Aplicar Migraciones de Tradingbot

## Opción 1: Via Supabase Dashboard (Recomendado)

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard/project/vokwlwknebbpmeowyqgt)
2. Navegar a **SQL Editor**
3. Copiar y pegar el contenido de `combined_migration.sql`
4. Ejecutar el SQL

## Opción 2: Via Supabase CLI

### Paso 1: Autenticarse
```bash
npx supabase login
```

### Paso 2: Vincular proyecto
```bash
cd apps/web
npx supabase link --project-ref vokwlwknebbpmeowyqgt
```

### Paso 3: Aplicar migraciones
```bash
npx supabase db push
```

### Paso 4: Generar tipos TypeScript
```bash
npx supabase gen types typescript --linked > lib/database.types.ts
```

## Verificación

Después de aplicar las migraciones, verificar:

1. **Tablas creadas** (19 tablas de trading):
   - strategies, strategy_versions, signals, trade_intents
   - orders, fills, positions
   - risk_events, risk_bumpers_state
   - whale_watchlist, whale_snapshots, whale_events
   - agent_traces, agent_proposals
   - market_data_cache, daily_metrics
   - system_config, api_keys, audit_log

2. **RLS habilitado** en todas las tablas

3. **Triggers funcionando**:
   - updated_at automático
   - user_id automático
   - Auditoría

4. **Realtime habilitado** para tablas de trading

## Archivos de Migración

| Archivo | Contenido |
|---------|-----------|
| `20260131000001_tradingbot_schema.sql` | Tablas y ENUMs |
| `20260131000002_tradingbot_rls.sql` | Políticas RLS |
| `20260131000003_tradingbot_triggers.sql` | Triggers y funciones |
| `20260131000004_tradingbot_realtime.sql` | Configuración Realtime |
| `combined_migration.sql` | Todos combinados |

