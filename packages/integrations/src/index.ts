/**
 * @kit/integrations
 * External service integrations for trading
 */

// Hyperliquid (Market Data - Active for price feeds)
export * from './hyperliquid';

// ============================================================================
// ALPACA INTEGRATION - TEMPORARILY DISABLED
// Using Binance Testnet as the sole trading broker
// To re-enable Alpaca:
// 1. Uncomment the export below
// 2. Update system_config.default_broker = 'alpaca' in database
// 3. Set NEXT_PUBLIC_ENABLE_ALPACA=true in .env
// Last disabled: 2026-02-01
// ============================================================================
// export * from './alpaca';

// Binance (Order Execution - Primary Broker)
export * from './binance';

// OpenAI (AI Agents)
export * from './openai';

