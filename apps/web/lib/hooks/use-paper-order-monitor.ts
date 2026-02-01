'use client';

/**
 * Paper Order Monitor Hook
 * Monitors open paper orders and auto-closes on SL/TP triggers
 * Uses real-time price data from Hyperliquid WebSocket
 */

import { useEffect, useRef, useCallback } from 'react';
import type { PaperOrder, PaperOrderExitReason, AlertTakeProfitTarget } from '@kit/trading-core';

interface MonitorOptions {
  enabled?: boolean;
  onOrderClosed?: (order: PaperOrder, reason: PaperOrderExitReason, exitPrice: number) => void;
  onPriceUpdate?: (symbol: string, price: number, order: PaperOrder) => void;
}

interface UsePaperOrderMonitorReturn {
  updatePrice: (symbol: string, price: number) => void;
  checkOrder: (order: PaperOrder, currentPrice: number) => PaperOrderExitReason | null;
}

export function usePaperOrderMonitor(
  openOrders: PaperOrder[],
  closeOrder: (orderId: string, input: { exit_price: number; exit_reason: PaperOrderExitReason }) => Promise<PaperOrder | null>,
  options: MonitorOptions = {}
): UsePaperOrderMonitorReturn {
  const { enabled = true, onOrderClosed, onPriceUpdate } = options;

  // Track which orders have been processed to avoid duplicate closes
  const processedOrdersRef = useRef<Set<string>>(new Set());
  const latestPricesRef = useRef<Map<string, number>>(new Map());

  // Check if an order should be closed based on current price
  const checkOrder = useCallback((order: PaperOrder, currentPrice: number): PaperOrderExitReason | null => {
    if (order.status !== 'open') return null;

    const entryPrice = typeof order.entry_price === 'string'
      ? parseFloat(order.entry_price)
      : order.entry_price;

    // Check stop loss
    if (order.stop_loss) {
      const stopLoss = typeof order.stop_loss === 'string'
        ? parseFloat(order.stop_loss)
        : order.stop_loss;

      if (order.side === 'LONG' && currentPrice <= stopLoss) {
        return 'stop_loss';
      }
      if (order.side === 'SHORT' && currentPrice >= stopLoss) {
        return 'stop_loss';
      }
    }

    // Check take profit targets (multiple levels)
    if (order.take_profit_targets && Array.isArray(order.take_profit_targets)) {
      const targets = order.take_profit_targets as AlertTakeProfitTarget[];

      // Check from highest TP to lowest
      for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        if (!target) continue;

        const tpPrice = target.price;

        if (order.side === 'LONG' && currentPrice >= tpPrice) {
          // Return tp1, tp2, tp3 based on index
          if (i === 0) return 'tp1';
          if (i === 1) return 'tp2';
          if (i === 2) return 'tp3';
          return 'take_profit';
        }
        if (order.side === 'SHORT' && currentPrice <= tpPrice) {
          if (i === 0) return 'tp1';
          if (i === 1) return 'tp2';
          if (i === 2) return 'tp3';
          return 'take_profit';
        }
      }
    }

    // Check single take profit
    if (order.take_profit) {
      const takeProfit = typeof order.take_profit === 'string'
        ? parseFloat(order.take_profit)
        : order.take_profit;

      if (order.side === 'LONG' && currentPrice >= takeProfit) {
        return 'take_profit';
      }
      if (order.side === 'SHORT' && currentPrice <= takeProfit) {
        return 'take_profit';
      }
    }

    return null;
  }, []);

  // Update price and check all orders for that symbol
  const updatePrice = useCallback((symbol: string, price: number) => {
    if (!enabled) return;

    latestPricesRef.current.set(symbol, price);

    // Find orders for this symbol
    const ordersForSymbol = openOrders.filter(
      (o) => o.symbol === symbol && o.status === 'open'
    );

    for (const order of ordersForSymbol) {
      // Skip if already being processed
      if (processedOrdersRef.current.has(order.id)) continue;

      // Notify price update
      onPriceUpdate?.(symbol, price, order);

      // Check for exit condition
      const exitReason = checkOrder(order, price);

      if (exitReason) {
        // Mark as being processed to prevent duplicate closes
        processedOrdersRef.current.add(order.id);

        console.log(`[PaperOrderMonitor] Triggering ${exitReason} for ${order.symbol} at ${price}`);

        // Close the order
        closeOrder(order.id, {
          exit_price: price,
          exit_reason: exitReason,
        })
          .then((closedOrder) => {
            if (closedOrder) {
              console.log(`[PaperOrderMonitor] Order closed:`, {
                symbol: closedOrder.symbol,
                side: closedOrder.side,
                pnl: closedOrder.realized_pnl,
                reason: exitReason,
              });
              onOrderClosed?.(closedOrder, exitReason, price);
            }
          })
          .catch((err) => {
            console.error('[PaperOrderMonitor] Failed to close order:', err);
            // Remove from processed so it can be retried
            processedOrdersRef.current.delete(order.id);
          });
      }
    }
  }, [enabled, openOrders, checkOrder, closeOrder, onOrderClosed, onPriceUpdate]);

  // Clean up processed orders when they're no longer in openOrders
  useEffect(() => {
    const currentOpenIds = new Set(openOrders.map((o) => o.id));

    processedOrdersRef.current.forEach((id) => {
      if (!currentOpenIds.has(id)) {
        processedOrdersRef.current.delete(id);
      }
    });
  }, [openOrders]);

  return {
    updatePrice,
    checkOrder,
  };
}

/**
 * Calculate unrealized P&L for an open order
 */
export function calculateUnrealizedPnL(
  order: PaperOrder,
  currentPrice: number
): { pnlUsd: number; pnlPct: number } {
  const entryPrice = typeof order.entry_price === 'string'
    ? parseFloat(order.entry_price)
    : order.entry_price;

  const sizeUsd = typeof order.size_usd === 'string'
    ? parseFloat(order.size_usd)
    : order.size_usd;

  let pnlPct: number;
  if (order.side === 'LONG') {
    pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  } else {
    pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  const pnlUsd = (pnlPct / 100) * sizeUsd;

  return { pnlUsd, pnlPct };
}

/**
 * Calculate distance to stop loss and take profit
 */
export function calculateDistances(
  order: PaperOrder,
  currentPrice: number
): { toStopLoss: number | null; toTakeProfit: number | null } {
  const parseNum = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    return typeof val === 'string' ? parseFloat(val) : val;
  };

  const stopLoss = parseNum(order.stop_loss);
  const takeProfit = parseNum(order.take_profit);

  let toStopLoss: number | null = null;
  let toTakeProfit: number | null = null;

  if (stopLoss !== null) {
    if (order.side === 'LONG') {
      toStopLoss = ((currentPrice - stopLoss) / stopLoss) * 100;
    } else {
      toStopLoss = ((stopLoss - currentPrice) / currentPrice) * 100;
    }
  }

  if (takeProfit !== null) {
    if (order.side === 'LONG') {
      toTakeProfit = ((takeProfit - currentPrice) / currentPrice) * 100;
    } else {
      toTakeProfit = ((currentPrice - takeProfit) / takeProfit) * 100;
    }
  }

  return { toStopLoss, toTakeProfit };
}
