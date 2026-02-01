# Vercel Deployment Guide - Tradingbot

## Pre-requisitos

- Cuenta de Vercel (recomendado: Plan Pro para funciones de hasta 60s)
- Proyecto Supabase configurado en produccion
- API Keys de OpenAI, Alpaca

---

## 1. Configuracion en Vercel

### 1.1 Importar Proyecto

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa el repositorio de GitHub
3. Configura:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm turbo build --filter=web`
   - **Install Command**: `cd ../.. && pnpm install`
   - **Output Directory**: `.next`

### 1.2 Node.js Version

En Settings > General > Node.js Version, selecciona: **20.x**

---

## 2. Variables de Entorno

Configura estas variables en Vercel Dashboard > Settings > Environment Variables.

### 2.1 REQUERIDAS - Supabase

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/Public key de Supabase | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (servidor) | `eyJhbGci...` |

### 2.2 REQUERIDAS - Trading APIs

| Variable | Descripcion | Donde obtenerla |
|----------|-------------|-----------------|
| `OPENAI_API_KEY` | API key de OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ALPACA_PAPER_KEY` | API Key de Alpaca Paper | [app.alpaca.markets](https://app.alpaca.markets/paper/dashboard/overview) |
| `ALPACA_PAPER_SECRET` | API Secret de Alpaca Paper | Mismo lugar que la key |

### 2.3 OPCIONALES - Live Trading

| Variable | Descripcion | Nota |
|----------|-------------|------|
| `ALPACA_LIVE_KEY` | API Key de Alpaca Live | Solo si usas trading real |
| `ALPACA_LIVE_SECRET` | API Secret de Alpaca Live | Solo si usas trading real |

### 2.4 REQUERIDAS - Aplicacion

| Variable | Valor | Descripcion |
|----------|-------|-------------|
| `NEXT_PUBLIC_SITE_URL` | `https://tu-dominio.vercel.app` | URL de produccion |
| `NEXT_PUBLIC_PRODUCT_NAME` | `Tradingbot` | Nombre de la app |
| `NEXT_PUBLIC_DEFAULT_THEME_MODE` | `dark` | Tema por defecto |

### 2.5 REQUERIDAS - Auth

| Variable | Valor | Descripcion |
|----------|-------|-------------|
| `NEXT_PUBLIC_AUTH_PASSWORD` | `true` | Habilitar login con password |
| `NEXT_PUBLIC_AUTH_MAGIC_LINK` | `false` | Deshabilitar magic link |

### 2.6 OPCIONALES - Features

| Variable | Valor | Descripcion |
|----------|-------|-------------|
| `NEXT_PUBLIC_ENABLE_THEME_TOGGLE` | `true` | Mostrar toggle de tema |
| `NEXT_PUBLIC_ENABLE_LIVE_TRADING` | `false` | **MANTENER FALSE** hasta validar |
| `NEXT_PUBLIC_ENABLE_AI_AGENTS` | `true` | Habilitar agentes de IA |
| `NEXT_PUBLIC_ENABLE_WHALE_TRACKING` | `true` | Habilitar deteccion de ballenas |

### 2.7 OPCIONAL - Captcha

| Variable | Descripcion |
|----------|-------------|
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | Site key de Turnstile/hCaptcha |
| `CAPTCHA_SECRET_TOKEN` | Secret token del captcha |

---

## 3. Configuracion de Supabase para Produccion

### 3.1 Actualizar Site URL

En Supabase Dashboard > Authentication > URL Configuration:

```
Site URL: https://tu-dominio.vercel.app
Redirect URLs:
  - https://tu-dominio.vercel.app/auth/callback
  - https://tu-dominio.vercel.app/auth/callback/error
```

### 3.2 Verificar RLS

Asegurate de que todas las tablas tengan Row Level Security habilitado.

---

## 4. Resumen de Variables (Copiar/Pegar)

```env
# === SUPABASE ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# === OPENAI ===
OPENAI_API_KEY=

# === ALPACA ===
ALPACA_PAPER_KEY=
ALPACA_PAPER_SECRET=
# ALPACA_LIVE_KEY=
# ALPACA_LIVE_SECRET=

# === SITE ===
NEXT_PUBLIC_SITE_URL=https://tu-dominio.vercel.app
NEXT_PUBLIC_PRODUCT_NAME=Tradingbot
NEXT_PUBLIC_SITE_TITLE=Tradingbot - AI Trading Platform
NEXT_PUBLIC_SITE_DESCRIPTION=AI-powered trading platform with real-time market analysis
NEXT_PUBLIC_DEFAULT_THEME_MODE=dark
NEXT_PUBLIC_THEME_COLOR=#0a0a0a
NEXT_PUBLIC_THEME_COLOR_DARK=#0a0a0a

# === AUTH ===
NEXT_PUBLIC_AUTH_PASSWORD=true
NEXT_PUBLIC_AUTH_MAGIC_LINK=false

# === FEATURES ===
NEXT_PUBLIC_ENABLE_THEME_TOGGLE=true
NEXT_PUBLIC_ENABLE_LIVE_TRADING=false
NEXT_PUBLIC_ENABLE_AI_AGENTS=true
NEXT_PUBLIC_ENABLE_WHALE_TRACKING=true
NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION=true
```

---

## 5. Verificacion Post-Deploy

### 5.1 Checklist

- [ ] La app carga sin errores
- [ ] Login/Signup funcionan correctamente
- [ ] Dashboard de trading carga
- [ ] WebSocket de Hyperliquid conecta (ver consola del navegador)
- [ ] Agentes de IA responden (sentinel, atlas)
- [ ] Paper orders se crean y cierran correctamente

### 5.2 Logs

Revisa los logs en Vercel Dashboard > Deployments > [deployment] > Functions

### 5.3 Timeouts

Las rutas criticas tienen configurado `maxDuration`:
- `/api/trading/agents` - 50 segundos
- `/api/trading/market-data` - 30 segundos
- `/api/trading/paper-orders/[id]/close` - 30 segundos

---

## 6. Arquitectura en Vercel

```
Browser (Cliente)
    |
    |-- WebSocket --> Hyperliquid (wss://api.hyperliquid.xyz/ws)
    |
    |-- HTTP --> Vercel Edge Network
                    |
                    |-- Next.js App (SSR/Static)
                    |-- API Routes (Serverless Functions)
                            |
                            |-- Supabase (Database + Auth)
                            |-- OpenAI (AI Agents)
                            |-- Alpaca (Trading API)
                            |-- Hyperliquid (Market Data REST)
```

**Nota importante**: El WebSocket de Hyperliquid se conecta directamente desde el navegador del usuario, NO desde el servidor de Vercel. Esto es compatible con Vercel.

---

## 7. Troubleshooting

### Error: Function timeout

Si ves errores de timeout en las funciones:
1. Verifica que tienes Vercel Pro (60s max) o ajusta `maxDuration`
2. Revisa si OpenAI esta respondiendo lento

### Error: CORS

Los headers CORS estan configurados en `vercel.json`. Si hay problemas:
1. Verifica que `NEXT_PUBLIC_SITE_URL` esta correctamente configurada
2. Revisa los headers en la respuesta

### Error: Supabase connection

1. Verifica que las variables de Supabase estan correctas
2. Verifica que el Site URL en Supabase coincide con tu dominio de Vercel

---

## 8. Comandos Utiles

```bash
# Build local para probar
pnpm build

# Ver logs de build
vercel logs

# Deploy preview
vercel

# Deploy a produccion
vercel --prod
```

---

**Fecha de generacion**: 2026-02-01
**Version del repo**: Basado en commit actual
