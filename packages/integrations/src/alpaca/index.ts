/**
 * ⚠️ ALPACA INTEGRATION - TEMPORARILY DISABLED
 *
 * This module is currently not exported in the main package index.
 * The application is using Binance Testnet as the sole trading broker.
 *
 * To re-enable Alpaca:
 * 1. Uncomment the export in packages/integrations/src/index.ts
 * 2. Update database: UPDATE system_config SET alpaca_enabled = true, default_broker = 'alpaca'
 * 3. Set NEXT_PUBLIC_ENABLE_ALPACA=true in environment variables
 * 4. Restart the application
 *
 * Last disabled: 2026-02-01
 * Reason: Migrating to Binance Testnet for real order execution
 */

export * from './types';
export { AlpacaClient, createAlpacaClient } from './client';

