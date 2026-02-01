/**
 * Validation Utilities
 * Functions for validating trading data
 */

import type { OrderSide, OrderType, TimeInForce } from '../types';

/**
 * Validate order parameters
 */
export function validateOrderParams(params: {
  qty: number;
  price?: number;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (params.qty <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (params.orderType === 'limit' && (!params.price || params.price <= 0)) {
    errors.push('Limit orders require a valid price');
  }

  if (params.orderType === 'stop_limit' && (!params.price || params.price <= 0)) {
    errors.push('Stop-limit orders require a valid price');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate price is within reasonable range
 */
export function validatePrice(price: number, referencePrice: number, maxDeviationPercent = 10): boolean {
  if (price <= 0 || referencePrice <= 0) return false;
  const deviation = Math.abs((price - referencePrice) / referencePrice) * 100;
  return deviation <= maxDeviationPercent;
}

/**
 * Validate position size against limits
 */
export function validatePositionSize(
  sizeUsd: number,
  maxPositionUsd: number
): { valid: boolean; message?: string } {
  if (sizeUsd <= 0) {
    return { valid: false, message: 'Position size must be greater than 0' };
  }
  if (sizeUsd > maxPositionUsd) {
    return { valid: false, message: `Position size exceeds maximum (${maxPositionUsd} USD)` };
  }
  return { valid: true };
}

/**
 * Validate stop loss and take profit levels
 */
export function validateStopLevels(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  side: OrderSide
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (side === 'buy') {
    if (stopLoss >= entryPrice) {
      errors.push('Stop loss must be below entry price for long positions');
    }
    if (takeProfit <= entryPrice) {
      errors.push('Take profit must be above entry price for long positions');
    }
  } else {
    if (stopLoss <= entryPrice) {
      errors.push('Stop loss must be above entry price for short positions');
    }
    if (takeProfit >= entryPrice) {
      errors.push('Take profit must be below entry price for short positions');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Hyperliquid address format
 */
export function isValidHyperliquidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate symbol format
 */
export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z]{2,10}\/[A-Z]{2,10}$/.test(symbol);
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

