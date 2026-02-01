-- ============================================================================
-- BINANCE INTEGRATION & PAPER ORDERS REMOVAL
-- Migration: 20260201000005_binance_only.sql
--
-- CRITICAL: This migration makes DESTRUCTIVE changes:
-- 1. Drops paper_orders table completely
-- 2. Disables Alpaca by default
-- 3. Sets Binance as default broker
--
-- Rollback available in: paper_orders_schema_backup.sql
-- ============================================================================

-- 1. BACKUP EXISTING PAPER ORDERS (if table exists)
-- Note: Run this manually before applying migration if you need the data
-- COPY public.paper_orders TO '/tmp/paper_orders_backup.csv' CSV HEADER;

-- 2. DROP PAPER ORDERS TABLE (DESTRUCTIVE)
DROP TABLE IF EXISTS public.paper_orders CASCADE;

-- 3. ADD BINANCE COLUMNS TO ORDERS TABLE
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS broker VARCHAR(20) DEFAULT 'binance',
  ADD COLUMN IF NOT EXISTS binance_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS binance_client_order_id VARCHAR(100);

-- 4. CREATE INDICES FOR BINANCE ORDERS
CREATE INDEX IF NOT EXISTS idx_orders_broker
  ON public.orders(broker, user_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_binance_id
  ON public.orders(binance_order_id)
  WHERE broker = 'binance' AND binance_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_binance_client_id
  ON public.orders(binance_client_order_id)
  WHERE broker = 'binance' AND binance_client_order_id IS NOT NULL;

-- 5. UPDATE SYSTEM_CONFIG FOR BINANCE
ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS alpaca_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS binance_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_broker VARCHAR(20) DEFAULT 'binance';

-- Set all existing configs to use Binance
UPDATE public.system_config
SET
  alpaca_enabled = false,
  binance_enabled = true,
  default_broker = 'binance'
WHERE alpaca_enabled IS NULL OR binance_enabled IS NULL;

-- 6. ADD CONSTRAINTS
-- Ensure Binance orders have binance_order_id
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_binance_id_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_binance_id_check
  CHECK (
    (broker = 'binance' AND binance_order_id IS NOT NULL) OR
    (broker != 'binance')
  );

-- 7. UPDATE EXISTING ALPACA ORDERS (set broker explicitly)
UPDATE public.orders
SET broker = 'alpaca'
WHERE broker IS NULL AND alpaca_order_id IS NOT NULL;

-- 8. ADD COMMENTS
COMMENT ON COLUMN public.orders.broker IS 'Trading broker: binance (primary), alpaca (deprecated)';
COMMENT ON COLUMN public.orders.binance_order_id IS 'Binance order ID (int64 from Binance API)';
COMMENT ON COLUMN public.orders.binance_client_order_id IS 'Client-generated order ID for Binance';
COMMENT ON COLUMN public.system_config.default_broker IS 'Default broker for trading (binance only for now)';
COMMENT ON COLUMN public.system_config.alpaca_enabled IS 'Alpaca integration enabled (currently disabled)';
COMMENT ON COLUMN public.system_config.binance_enabled IS 'Binance integration enabled';

-- 9. UPDATE RLS POLICIES (if they reference paper_orders)
-- No action needed - paper_orders policies will be dropped with table

-- 10. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, UPDATE ON public.system_config TO authenticated;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- 1. Restore paper_orders table:
--    psql $DATABASE_URL < paper_orders_schema_backup.sql
--
-- 2. Re-enable Alpaca:
--    UPDATE public.system_config SET alpaca_enabled = true, default_broker = 'alpaca';
--
-- 3. Uncomment Alpaca exports in packages/integrations/src/index.ts
-- ============================================================================
