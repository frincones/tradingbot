/**
 * Order Type Constants
 * Constants for order types and statuses
 */

import type { OrderStatus, OrderType, OrderSide, TimeInForce, IntentStatus } from '../types';

export const ORDER_SIDES: OrderSide[] = ['buy', 'sell'];

export const ORDER_TYPES: OrderType[] = ['market', 'limit', 'stop_limit'];

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'submitted',
  'accepted',
  'filled',
  'partially_filled',
  'cancelled',
  'rejected',
  'expired',
];

export const TIME_IN_FORCE_OPTIONS: TimeInForce[] = ['gtc', 'ioc', 'day', 'fok'];

export const INTENT_STATUSES: IntentStatus[] = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'cancelled',
  'expired',
];

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'gray',
  submitted: 'blue',
  accepted: 'blue',
  filled: 'green',
  partially_filled: 'yellow',
  cancelled: 'orange',
  rejected: 'red',
  expired: 'gray',
};

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending: 'Order is pending submission',
  submitted: 'Order has been submitted to broker',
  accepted: 'Order has been accepted by broker',
  filled: 'Order has been completely filled',
  partially_filled: 'Order has been partially filled',
  cancelled: 'Order has been cancelled',
  rejected: 'Order was rejected by broker',
  expired: 'Order has expired',
};

export const INTENT_STATUS_COLORS: Record<IntentStatus, string> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  executed: 'blue',
  cancelled: 'gray',
  expired: 'gray',
};

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return ['filled', 'cancelled', 'rejected', 'expired'].includes(status);
}

export function isActiveOrderStatus(status: OrderStatus): boolean {
  return ['pending', 'submitted', 'accepted', 'partially_filled'].includes(status);
}

