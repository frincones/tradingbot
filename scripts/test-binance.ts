#!/usr/bin/env tsx
/**
 * Binance Testnet Integration Test Script
 *
 * This script validates the complete Binance integration by:
 * - Testing API connectivity
 * - Executing real orders on Testnet
 * - Validating order executor utilities
 *
 * Usage:
 *   pnpm tsx scripts/test-binance.ts
 *
 * Requirements:
 *   - BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_SECRET_KEY in .env.local
 *   - Binance Testnet account with USDT balance
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env.local from apps/web
config({ path: join(__dirname, '../apps/web/.env.local') });

import { createBinanceClient } from '../packages/integrations/src/binance/client';
import { executeTradeOnBinance, getBinancePrice } from '../packages/integrations/src/binance/order-executor';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  data?: unknown;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<unknown>): Promise<void> {
  const start = Date.now();
  try {
    console.log(`\n🧪 ${name}...`);
    const data = await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, data });
    console.log(`✅ PASSED (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`❌ FAILED (${duration}ms)`);
    console.log(`   Error: ${errorMsg}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      BINANCE TESTNET INTEGRATION TEST SUITE               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // Verify environment variables
  if (!process.env.BINANCE_TESTNET_API_KEY || !process.env.BINANCE_TESTNET_SECRET_KEY) {
    console.error('❌ Missing environment variables!');
    console.error('   Required: BINANCE_TESTNET_API_KEY, BINANCE_TESTNET_SECRET_KEY');
    console.error('   Check your .env.local file');
    process.exit(1);
  }

  console.log('📋 Environment Check:');
  console.log(`   API Key: ${process.env.BINANCE_TESTNET_API_KEY?.substring(0, 8)}...`);
  console.log(`   Secret: ${process.env.BINANCE_TESTNET_SECRET_KEY?.substring(0, 8)}...`);
  console.log(`   Base URL: ${process.env.BINANCE_TESTNET_REST_URL || 'https://testnet.binance.vision'}`);

  const client = createBinanceClient(true);

  // TEST 1: API Connectivity
  await test('API Connectivity (ping)', async () => {
    await client.ping();
    return 'API is reachable';
  });

  // TEST 2: Server Time
  await test('Get Server Time', async () => {
    const result = await client.getServerTime();
    const time = new Date(result.serverTime);
    console.log(`   Server: ${time.toISOString()}`);
    console.log(`   Local:  ${new Date().toISOString()}`);
    return time;
  });

  // TEST 3: Account Information
  await test('Get Account Information', async () => {
    const account = await client.getAccount();
    console.log(`   Can Trade: ${account.canTrade}`);
    console.log(`   Account Type: ${account.accountType}`);
    console.log(`   Total Balances: ${account.balances.length}`);

    const usdt = account.balances.find(b => b.asset === 'USDT');
    const btc = account.balances.find(b => b.asset === 'BTC');

    if (usdt) {
      console.log(`   USDT: ${parseFloat(usdt.free).toFixed(2)} free`);
    }
    if (btc) {
      console.log(`   BTC: ${parseFloat(btc.free).toFixed(8)} free`);
    }

    return account;
  });

  // TEST 4: Get Market Price
  await test('Get BTC/USDT Current Price', async () => {
    const price = await getBinancePrice('BTC/USDT');
    console.log(`   Price: $${price.toLocaleString()}`);
    return price;
  });

  // TEST 5: Get 24hr Statistics
  await test('Get 24hr Ticker Statistics', async () => {
    const ticker = await client.get24hrTicker('BTCUSDT');
    console.log(`   High: $${parseFloat(ticker.highPrice).toLocaleString()}`);
    console.log(`   Low: $${parseFloat(ticker.lowPrice).toLocaleString()}`);
    console.log(`   Change: ${ticker.priceChangePercent}%`);
    console.log(`   Volume: ${parseFloat(ticker.volume).toFixed(2)} BTC`);
    return ticker;
  });

  // TEST 6: Get Book Ticker (Best Bid/Ask)
  await test('Get Best Bid/Ask Prices', async () => {
    const bookTicker = await client.getBookTicker('BTCUSDT');
    console.log(`   Bid: $${bookTicker.bidPrice} (${bookTicker.bidQty} BTC)`);
    console.log(`   Ask: $${bookTicker.askPrice} (${bookTicker.askQty} BTC)`);
    console.log(`   Spread: $${(parseFloat(bookTicker.askPrice) - parseFloat(bookTicker.bidPrice)).toFixed(2)}`);
    return bookTicker;
  });

  // TEST 7: Calculate Quantity
  await test('Calculate Order Quantity ($10 order)', async () => {
    const qty = await client.calculateQuantity('BTCUSDT', 10);
    console.log(`   Quantity: ${qty} BTC`);
    return qty;
  });

  // TEST 8: Create Market Order (REAL ORDER!)
  await test('Execute Market BUY Order ($15)', async () => {
    console.log(`   ⚠️  Creating REAL order on Binance Testnet`);

    // Use $15 and ensure precision is correct
    const rawQty = await client.calculateQuantity('BTCUSDT', 15);
    const quantity = parseFloat(rawQty).toFixed(5); // Round to 5 decimals for BTC
    const order = await client.createMarketOrder('BTCUSDT', 'BUY', quantity);

    console.log(`   Order ID: ${order.orderId}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Executed: ${order.executedQty} BTC`);
    console.log(`   Cost: $${parseFloat(order.cummulativeQuoteQty).toFixed(2)}`);

    if (order.fills && order.fills.length > 0) {
      console.log(`   Fills: ${order.fills.length}`);
      order.fills.forEach((fill, i) => {
        console.log(`     ${i + 1}. ${fill.qty} @ $${fill.price} (fee: ${fill.commission} ${fill.commissionAsset})`);
      });
    }

    return order;
  });

  // TEST 9: Check Order Status
  const lastOrder = results[results.length - 1];
  if (lastOrder.passed && lastOrder.data) {
    const orderId = (lastOrder.data as any).orderId;

    await test('Verify Order Status', async () => {
      const status = await client.getOrder('BTCUSDT', orderId);
      console.log(`   Order ${orderId}: ${status.status}`);
      console.log(`   Filled: ${status.executedQty} BTC`);
      return status;
    });
  }

  // TEST 10: Get Open Orders
  await test('Get Open Orders', async () => {
    const openOrders = await client.getOpenOrders('BTCUSDT');
    console.log(`   Open Orders: ${openOrders.length}`);

    if (openOrders.length > 0) {
      openOrders.slice(0, 3).forEach(o => {
        console.log(`   - ${o.orderId}: ${o.side} ${o.origQty} @ ${o.price || 'MARKET'}`);
      });
    }

    return openOrders;
  });

  // TEST 11: Create Limit Order
  await test('Create LIMIT Order (will cancel)', async () => {
    const currentPrice = await getBinancePrice('BTC/USDT');
    const limitPrice = (currentPrice * 0.95).toFixed(2); // 5% below market
    const rawQty = await client.calculateQuantity('BTCUSDT', 15);
    const quantity = parseFloat(rawQty).toFixed(5); // Round to 5 decimals

    console.log(`   Creating limit buy at $${limitPrice} (5% below market)`);

    const limitOrder = await client.createLimitOrder('BTCUSDT', 'BUY', quantity, limitPrice);
    console.log(`   Order ID: ${limitOrder.orderId}`);
    console.log(`   Status: ${limitOrder.status}`);

    // Cancel immediately
    console.log(`   Cancelling order...`);
    await client.cancelOrder('BTCUSDT', limitOrder.orderId);
    console.log(`   Order cancelled`);

    return limitOrder;
  });

  // TEST 12: Get Final Balances
  await test('Get Final Account Balances', async () => {
    const account = await client.getAccount();
    const usdt = account.balances.find(b => b.asset === 'USDT');
    const btc = account.balances.find(b => b.asset === 'BTC');

    console.log('   Final Balances:');
    if (usdt) {
      console.log(`   USDT: ${parseFloat(usdt.free).toFixed(2)} (free) + ${parseFloat(usdt.locked).toFixed(2)} (locked)`);
    }
    if (btc) {
      console.log(`   BTC: ${parseFloat(btc.free).toFixed(8)} (free) + ${parseFloat(btc.locked).toFixed(8)} (locked)`);
    }

    return { usdt, btc };
  });

  // Print Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('                    TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Time: ${totalTime}ms`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ Binance integration is working correctly');
    console.log('✅ Ready for production deployment');
  }
}

main().catch(error => {
  console.error('\n💥 TEST SUITE CRASHED!');
  console.error(error);
  process.exit(1);
});
