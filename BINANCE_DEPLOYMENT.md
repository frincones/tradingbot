# 🚀 Binance Integration - Deployment Guide

**Branch:** `feature/binance-only-implementation`
**Status:** ✅ Code Complete - Ready for Deployment
**Date:** 2026-02-01

---

## 📋 Overview

This deployment introduces **Binance Testnet** as the primary trading broker, replacing the paper trading system with **real order execution** on Binance's test environment.

### Key Changes
- ✅ Binance REST API client fully implemented
- ✅ WebSocket integration for real-time prices
- ✅ Paper orders system removed
- ⚠️ Alpaca temporarily disabled (code preserved)
- ✅ All AI agents now execute real orders on Binance Testnet

---

## 🔥 CRITICAL: Breaking Changes

### 1. Paper Orders Eliminated
- The `paper_orders` table will be **DROPPED**
- No rollback without database backup
- All simulated trading data will be lost

### 2. Alpaca Disabled
- Alpaca integration is commented out
- Code preserved for future re-enablement
- Cannot be used until manually re-enabled

### 3. Real Orders Only
- **All orders are now REAL on Binance Testnet**
- AI agents execute actual trades (with testnet funds)
- No more simulation/fake orders

---

## 📦 Files Modified

### Created (940 lines)
```
packages/integrations/src/binance/
  ├── types.ts              (Binance API types)
  ├── client.ts             (REST API client)
  ├── order-executor.ts     (AI agent utilities)
  └── index.ts              (exports)

apps/web/lib/hooks/
  └── use-binance-ws.ts     (WebSocket React hook)

apps/web/supabase/migrations/
  └── 20260201000006_binance_only.sql  (Database changes)
```

### Deleted (1479 lines)
```
apps/web/app/api/trading/paper-orders/  (entire directory)
apps/web/lib/hooks/use-paper-orders.ts
apps/web/lib/hooks/use-paper-order-monitor.ts
apps/web/app/home/trading/_components/paper-orders-list.tsx
```

### Modified
```
packages/integrations/src/index.ts          (disabled Alpaca export)
packages/integrations/src/alpaca/index.ts   (added deprecation warning)
apps/web/.env.local                         (Binance credentials - NOT COMMITTED)
```

---

## 🗄️ Database Migration

### Migration File
`apps/web/supabase/migrations/20260201000006_binance_only.sql`

### Changes
```sql
-- DESTRUCTIVE
DROP TABLE IF EXISTS public.paper_orders CASCADE;

-- NEW COLUMNS
ALTER TABLE public.orders
  ADD COLUMN broker VARCHAR(20) DEFAULT 'binance',
  ADD COLUMN binance_order_id BIGINT,
  ADD COLUMN binance_client_order_id VARCHAR(100);

-- CONFIGURATION
ALTER TABLE public.system_config
  ADD COLUMN binance_enabled BOOLEAN DEFAULT true,
  ADD COLUMN alpaca_enabled BOOLEAN DEFAULT false,
  ADD COLUMN default_broker VARCHAR(20) DEFAULT 'binance';

-- INDICES
CREATE INDEX idx_orders_broker ON public.orders(broker, user_id, status);
CREATE INDEX idx_orders_binance_id ON public.orders(binance_order_id);
```

### Apply Migration

**Option 1: Supabase CLI** (Recommended)
```bash
cd apps/web
pnpm supabase db push --include-all
```

**Option 2: Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/vokwlwknebbpmeowyqgt/sql
2. Copy contents of `20260201000006_binance_only.sql`
3. Paste and execute

**Option 3: Direct SQL** (if CLI fails)
```bash
# Requires SUPABASE_DB_PASSWORD
psql "postgresql://postgres.vokwlwknebbpmeowyqgt:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
  < apps/web/supabase/migrations/20260201000006_binance_only.sql
```

---

## 🔐 Environment Variables

### Local (.env.local) - Already Configured ✅
```bash
# Binance Testnet
BINANCE_TESTNET_API_KEY=dpDZrM2m9ayrzissIdRjPVfNxkyMa6bVcpA4OO4Y8A9VYlr8voq0B5jsDFtKEHMM
BINANCE_TESTNET_SECRET_KEY=RSWiB6V6n57Oz3uzCw8kXo4bO1ZzxzYBErdEOTDmSPh3WFzaxkD1HIrjupjeNpWd
BINANCE_TESTNET_REST_URL=https://testnet.binance.vision
NEXT_PUBLIC_BINANCE_WS_URL=wss://stream.testnet.binance.vision/ws

# Feature Flags
NEXT_PUBLIC_ENABLE_BINANCE=true
NEXT_PUBLIC_ENABLE_ALPACA=false
NEXT_PUBLIC_ENABLE_PAPER_TRADING=false
```

### Vercel Production - **ACTION REQUIRED** ⚠️

Add these variables in [Vercel Dashboard](https://vercel.com/freddyrs-projects/tradingbot/settings/environment-variables):

| Variable | Value | Environment |
|----------|-------|-------------|
| `BINANCE_TESTNET_API_KEY` | `dpDZrM2m9ayrzissIdRjPVfNxkyMa6bVcpA4OO4Y8A9VYlr8voq0B5jsDFtKEHMM` | Production, Preview |
| `BINANCE_TESTNET_SECRET_KEY` | `RSWiB6V6n57Oz3uzCw8kXo4bO1ZzxzYBErdEOTDmSPh3WFzaxkD1HIrjupjeNpWd` | Production, Preview (Sensitive) |
| `BINANCE_TESTNET_REST_URL` | `https://testnet.binance.vision` | Production, Preview |
| `NEXT_PUBLIC_BINANCE_WS_URL` | `wss://stream.testnet.binance.vision/ws` | Production, Preview |
| `NEXT_PUBLIC_ENABLE_BINANCE` | `true` | Production, Preview |
| `NEXT_PUBLIC_ENABLE_ALPACA` | `false` | Production, Preview |
| `NEXT_PUBLIC_ENABLE_PAPER_TRADING` | `false` | Production, Preview |

---

## 📝 Deployment Steps

### Step 1: Review Pull Request
```bash
# Create PR
https://github.com/frincones/tradingbot/pull/new/feature/binance-only-implementation

# Or merge directly
git checkout main
git merge feature/binance-only-implementation
```

### Step 2: Apply Database Migration
```bash
cd apps/web
pnpm supabase db push --include-all
```

### Step 3: Configure Vercel Environment Variables
Add all variables listed above in Vercel Dashboard.

### Step 4: Deploy to Production
```bash
git push origin main
```
Vercel will auto-deploy.

### Step 5: Verify Deployment
1. Check WebSocket connects to Binance
2. Verify real-time price updates for BTC/USDT
3. Test creating a small order (0.001 BTC)
4. Verify order appears in [Binance Testnet](https://testnet.binance.vision/)
5. Check order saved in database with `broker='binance'`

---

## 🧪 Testing Checklist

### Pre-Deployment Testing (Local)
```bash
# Start local dev server
pnpm dev

# Verify:
□ Price updates in real-time from Binance WebSocket
□ Can create market order (BUY 0.001 BTC/USDT)
□ Order appears in Binance Testnet web UI
□ Order saved to database with binance_order_id
□ No paper trading options visible
□ Alpaca not accessible
```

### Post-Deployment Testing (Production)
```bash
# On production URL
□ WebSocket connects (check browser console)
□ BTC/USDT price displays and updates
□ Create test order (very small amount)
□ Verify on Binance Testnet
□ Check database has order record
□ Verify AI agents can execute orders
```

---

## 🔄 Rollback Instructions

### If Deployment Fails

**1. Revert Code**
```bash
git checkout main
git revert HEAD
git push origin main
```

**2. Restore Database** (if you have backup)
```bash
# Restore paper_orders table
psql $DATABASE_URL < paper_orders_backup.sql

# Re-enable Alpaca
psql $DATABASE_URL -c "UPDATE system_config SET alpaca_enabled=true, default_broker='alpaca';"
```

**3. Re-enable Alpaca Code**
```typescript
// packages/integrations/src/index.ts
export * from './alpaca';  // Uncomment this line
```

**4. Revert Environment Variables**
Set in Vercel:
```
NEXT_PUBLIC_ENABLE_ALPACA=true
NEXT_PUBLIC_ENABLE_BINANCE=false
NEXT_PUBLIC_ENABLE_PAPER_TRADING=true
```

---

## 📊 Monitoring

### What to Watch

**Logs to Monitor:**
- Binance API errors (rate limits, authentication)
- WebSocket disconnections
- Order execution failures
- Database constraint violations

**Metrics:**
- Order success rate (should be >95%)
- WebSocket uptime (should be >99%)
- API latency (<500ms)

**Alerts:**
- Multiple order failures
- WebSocket reconnect loops
- Balance depletion in Binance Testnet

---

## 🆘 Troubleshooting

### Issue: "Module not found: './alpaca'"
**Solution:** This is expected. Alpaca is disabled. If you see this error in other parts of code, they need to be updated to use Binance.

### Issue: "Binance API error: Invalid signature"
**Solution:** Check that `BINANCE_TESTNET_SECRET_KEY` is correct in environment variables.

### Issue: "Paper orders not working"
**Solution:** This is intentional. Paper orders have been removed. Use Binance Testnet for testing.

### Issue: WebSocket not connecting
**Solution:**
1. Check `NEXT_PUBLIC_BINANCE_WS_URL` is set
2. Verify firewall allows wss:// connections
3. Check browser console for CORS errors

### Issue: Migration fails with "already exists"
**Solution:** Some objects might already exist from previous migrations. This is OK if it's not the critical tables (orders, system_config).

---

## 📚 Additional Resources

- **Binance Testnet:** https://testnet.binance.vision/
- **Binance API Docs:** https://developers.binance.com/docs/binance-spot-api-docs/testnet
- **Branch:** https://github.com/frincones/tradingbot/tree/feature/binance-only-implementation
- **Commit:** `91899e9`
- **Tag (pre-migration):** `pre-binance-migration`

---

## ✅ Final Checklist

Before going live:

```markdown
□ Database migration applied successfully
□ All environment variables configured in Vercel
□ Code merged to main branch
□ Vercel deployment completed
□ WebSocket connects and shows real-time prices
□ Test order executed successfully
□ Test order visible in Binance Testnet
□ Order saved to database correctly
□ AI agents tested with small orders
□ Monitoring and alerts configured
□ Team notified of changes
□ Documentation updated
```

---

**Questions or Issues?**
Check the troubleshooting section above or review the code in the feature branch.

**Ready to Deploy?**
Follow the deployment steps in order and verify each step before proceeding to the next.
