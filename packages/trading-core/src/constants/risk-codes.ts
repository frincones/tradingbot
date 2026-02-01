/**
 * Risk Code Constants
 * Constants for risk management
 */

import type { RiskSeverity } from '../types';

export const RISK_CODES = {
  // Daily limits
  DAILY_LOSS_EXCEEDED: 'DAILY_LOSS_EXCEEDED',
  MAX_TRADES_EXCEEDED: 'MAX_TRADES_EXCEEDED',

  // Position limits
  MAX_POSITIONS_REACHED: 'MAX_POSITIONS_REACHED',
  POSITION_SIZE_EXCEEDED: 'POSITION_SIZE_EXCEEDED',

  // Cooldown
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',

  // Kill switch
  KILL_SWITCH_ACTIVE: 'KILL_SWITCH_ACTIVE',

  // Order validation
  INVALID_ORDER: 'INVALID_ORDER',
  INSUFFICIENT_MARGIN: 'INSUFFICIENT_MARGIN',
  INVALID_PRICE: 'INVALID_PRICE',

  // Broker errors
  BROKER_ERROR: 'BROKER_ERROR',
  BROKER_TIMEOUT: 'BROKER_TIMEOUT',
  BROKER_REJECTED: 'BROKER_REJECTED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_LOST: 'CONNECTION_LOST',

  // Market conditions
  MARKET_CLOSED: 'MARKET_CLOSED',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  LOW_LIQUIDITY: 'LOW_LIQUIDITY',
} as const;

export type RiskCode = keyof typeof RISK_CODES;

export const RISK_CODE_SEVERITY: Record<RiskCode, RiskSeverity> = {
  DAILY_LOSS_EXCEEDED: 'critical',
  MAX_TRADES_EXCEEDED: 'warning',
  MAX_POSITIONS_REACHED: 'warning',
  POSITION_SIZE_EXCEEDED: 'warning',
  COOLDOWN_ACTIVE: 'info',
  KILL_SWITCH_ACTIVE: 'fatal',
  INVALID_ORDER: 'warning',
  INSUFFICIENT_MARGIN: 'critical',
  INVALID_PRICE: 'warning',
  BROKER_ERROR: 'critical',
  BROKER_TIMEOUT: 'warning',
  BROKER_REJECTED: 'critical',
  NETWORK_ERROR: 'critical',
  CONNECTION_LOST: 'fatal',
  MARKET_CLOSED: 'info',
  HIGH_VOLATILITY: 'warning',
  LOW_LIQUIDITY: 'warning',
};

export const RISK_CODE_MESSAGES: Record<RiskCode, string> = {
  DAILY_LOSS_EXCEEDED: 'Daily loss limit has been exceeded',
  MAX_TRADES_EXCEEDED: 'Maximum trades per day limit reached',
  MAX_POSITIONS_REACHED: 'Maximum open positions limit reached',
  POSITION_SIZE_EXCEEDED: 'Position size exceeds maximum allowed',
  COOLDOWN_ACTIVE: 'Strategy is in cooldown period',
  KILL_SWITCH_ACTIVE: 'Trading has been halted by kill switch',
  INVALID_ORDER: 'Order validation failed',
  INSUFFICIENT_MARGIN: 'Insufficient margin for this order',
  INVALID_PRICE: 'Order price is invalid',
  BROKER_ERROR: 'Broker returned an error',
  BROKER_TIMEOUT: 'Broker request timed out',
  BROKER_REJECTED: 'Order was rejected by broker',
  NETWORK_ERROR: 'Network error occurred',
  CONNECTION_LOST: 'Connection to broker lost',
  MARKET_CLOSED: 'Market is currently closed',
  HIGH_VOLATILITY: 'High volatility detected',
  LOW_LIQUIDITY: 'Low liquidity detected',
};

export const RISK_SEVERITY_ORDER: RiskSeverity[] = ['info', 'warning', 'critical', 'fatal'];

export function getSeverityLevel(severity: RiskSeverity): number {
  return RISK_SEVERITY_ORDER.indexOf(severity);
}

export function isHigherSeverity(a: RiskSeverity, b: RiskSeverity): boolean {
  return getSeverityLevel(a) > getSeverityLevel(b);
}

