/**
 * PnL Utilities
 * Functions for calculating profit and loss
 */

import type { OrderSide } from '../types';

/**
 * Calculate PnL in USD
 */
export function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  qty: number,
  side: OrderSide
): number {
  const diff = currentPrice - entryPrice;
  return side === 'buy' ? diff * qty : -diff * qty;
}

/**
 * Calculate PnL as percentage
 */
export function calculatePnLPercent(
  entryPrice: number,
  currentPrice: number,
  side: OrderSide
): number {
  if (entryPrice === 0) return 0;
  const diff = currentPrice - entryPrice;
  const pnlPercent = (diff / entryPrice) * 100;
  return side === 'buy' ? pnlPercent : -pnlPercent;
}

/**
 * Calculate notional value
 */
export function calculateNotional(price: number, qty: number): number {
  return price * qty;
}

/**
 * Calculate position size from USD amount
 */
export function calculateQtyFromUsd(usdAmount: number, price: number): number {
  if (price === 0) return 0;
  return usdAmount / price;
}

/**
 * Calculate USD amount from position size
 */
export function calculateUsdFromQty(qty: number, price: number): number {
  return qty * price;
}

/**
 * Calculate break-even price after fees
 */
export function calculateBreakEvenPrice(
  entryPrice: number,
  feePercent: number,
  side: OrderSide
): number {
  const feeMultiplier = 1 + feePercent / 100;
  return side === 'buy'
    ? entryPrice * feeMultiplier
    : entryPrice / feeMultiplier;
}

/**
 * Calculate take profit price
 */
export function calculateTakeProfitPrice(
  entryPrice: number,
  tpPercent: number,
  side: OrderSide
): number {
  const multiplier = 1 + tpPercent / 100;
  return side === 'buy'
    ? entryPrice * multiplier
    : entryPrice / multiplier;
}

/**
 * Calculate stop loss price
 */
export function calculateStopLossPrice(
  entryPrice: number,
  slPercent: number,
  side: OrderSide
): number {
  const multiplier = 1 - slPercent / 100;
  return side === 'buy'
    ? entryPrice * multiplier
    : entryPrice / (1 - slPercent / 100);
}

/**
 * Calculate risk/reward ratio
 */
export function calculateRiskRewardRatio(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  side: OrderSide
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  if (risk === 0) return 0;
  return reward / risk;
}

/**
 * Calculate win rate from wins and total trades
 */
export function calculateWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return (wins / total) * 100;
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(
  grossProfit: number,
  grossLoss: number
): number {
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return Math.abs(grossProfit / grossLoss);
}

/**
 * Calculate average trade
 */
export function calculateAverageTrade(totalPnL: number, totalTrades: number): number {
  if (totalTrades === 0) return 0;
  return totalPnL / totalTrades;
}

/**
 * Calculate maximum drawdown
 */
export function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0]!;
  let maxDrawdown = 0;

  for (const equity of equityCurve) {
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown * 100;
}

