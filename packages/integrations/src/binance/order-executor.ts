/**
 * Binance Order Executor
 * Helper functions for AI agents to execute orders on Binance
 */

import { createBinanceClient, BinanceClient } from './client';
import type { BinanceOrder, CreateBinanceOrderParams } from './types';

export interface ExecuteOrderParams {
  symbol: string; // Can include / (will be normalized)
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
  sizeUsd: number;
  type?: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ExecuteOrderResult {
  entryOrder: BinanceOrder;
  stopLossOrder?: BinanceOrder;
  takeProfitOrder?: BinanceOrder;
  estimatedCost: number;
  actualQuantity: string;
}

/**
 * Execute a trade with stop-loss and take-profit
 * This is the main function AI agents should use
 */
export async function executeTradeOnBinance(params: ExecuteOrderParams): Promise<ExecuteOrderResult> {
  const client = createBinanceClient(true); // Always testnet for now

  // Normalize symbol (remove /)
  const symbol = BinanceClient.normalizeSymbol(params.symbol);

  // Normalize side
  const side = normalizeSide(params.side);

  // Calculate quantity based on USD size
  const quantity = await client.calculateQuantity(symbol, params.sizeUsd);

  // 1. Execute entry order
  const entryOrder = await client.createOrder({
    symbol,
    side,
    type: params.type || 'MARKET',
    quantity,
    price: params.limitPrice?.toString(),
    timeInForce: params.type === 'LIMIT' ? 'GTC' : undefined,
  });

  const result: ExecuteOrderResult = {
    entryOrder,
    estimatedCost: params.sizeUsd,
    actualQuantity: quantity,
  };

  // 2. Place stop-loss if provided
  if (params.stopLoss && entryOrder.status === 'FILLED') {
    const stopLossSide = side === 'BUY' ? 'SELL' : 'BUY';
    const filledQty = entryOrder.executedQty;

    try {
      const stopLossOrder = await client.createStopLossLimitOrder(
        symbol,
        stopLossSide,
        filledQty,
        params.stopLoss.toString(),
        (params.stopLoss * (side === 'BUY' ? 0.995 : 1.005)).toString() // Limit price slightly worse than stop
      );

      result.stopLossOrder = stopLossOrder;
    } catch (error) {
      console.error('[Binance Order Executor] Failed to place stop-loss:', error);
    }
  }

  // 3. Place take-profit if provided
  if (params.takeProfit && entryOrder.status === 'FILLED') {
    const takeProfitSide = side === 'BUY' ? 'SELL' : 'BUY';
    const filledQty = entryOrder.executedQty;

    try {
      const takeProfitOrder = await client.createLimitOrder(
        symbol,
        takeProfitSide,
        filledQty,
        params.takeProfit.toString()
      );

      result.takeProfitOrder = takeProfitOrder;
    } catch (error) {
      console.error('[Binance Order Executor] Failed to place take-profit:', error);
    }
  }

  return result;
}

/**
 * Cancel an order on Binance
 */
export async function cancelBinanceOrder(symbol: string, orderId: number): Promise<BinanceOrder> {
  const client = createBinanceClient(true);
  const normalizedSymbol = BinanceClient.normalizeSymbol(symbol);
  return client.cancelOrder(normalizedSymbol, orderId);
}

/**
 * Get order status from Binance
 */
export async function getBinanceOrderStatus(symbol: string, orderId: number): Promise<BinanceOrder> {
  const client = createBinanceClient(true);
  const normalizedSymbol = BinanceClient.normalizeSymbol(symbol);
  return client.getOrder(normalizedSymbol, orderId);
}

/**
 * Get all open orders for a symbol
 */
export async function getBinanceOpenOrders(symbol?: string): Promise<BinanceOrder[]> {
  const client = createBinanceClient(true);
  const normalizedSymbol = symbol ? BinanceClient.normalizeSymbol(symbol) : undefined;
  return client.getOpenOrders(normalizedSymbol);
}

/**
 * Get current price from Binance
 */
export async function getBinancePrice(symbol: string): Promise<number> {
  const client = createBinanceClient(true);
  const normalizedSymbol = BinanceClient.normalizeSymbol(symbol);
  const price = await client.getPrice(normalizedSymbol);
  return parseFloat(price.price);
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeSide(side: 'LONG' | 'SHORT' | 'BUY' | 'SELL'): 'BUY' | 'SELL' {
  if (side === 'LONG' || side === 'BUY') return 'BUY';
  if (side === 'SHORT' || side === 'SELL') return 'SELL';
  throw new Error(`Invalid side: ${side}`);
}
