/**
 * State Constants
 * State machine definitions for strategies
 */

import type { StrategyState } from '../types';

export const STRATEGY_STATES: StrategyState[] = [
  'IDLE',
  'SETUP',
  'TRIGGERED',
  'ORDERING',
  'IN_POSITION',
  'EXITING',
  'COOLDOWN',
];

export const STATE_TRANSITIONS: Record<StrategyState, StrategyState[]> = {
  IDLE: ['SETUP', 'IDLE'],
  SETUP: ['TRIGGERED', 'IDLE', 'COOLDOWN'],
  TRIGGERED: ['ORDERING', 'IDLE', 'COOLDOWN'],
  ORDERING: ['IN_POSITION', 'IDLE', 'COOLDOWN'],
  IN_POSITION: ['EXITING', 'IDLE'],
  EXITING: ['IDLE', 'COOLDOWN'],
  COOLDOWN: ['IDLE', 'SETUP'],
};

export const STATE_DESCRIPTIONS: Record<StrategyState, string> = {
  IDLE: 'Strategy is inactive and waiting',
  SETUP: 'Strategy is analyzing market for entry signals',
  TRIGGERED: 'Entry signal detected, preparing order',
  ORDERING: 'Order has been submitted to broker',
  IN_POSITION: 'Position is open and being monitored',
  EXITING: 'Exit signal triggered, closing position',
  COOLDOWN: 'Strategy is in cooldown period',
};

export const STATE_COLORS: Record<StrategyState, string> = {
  IDLE: 'gray',
  SETUP: 'blue',
  TRIGGERED: 'yellow',
  ORDERING: 'orange',
  IN_POSITION: 'green',
  EXITING: 'purple',
  COOLDOWN: 'red',
};

export function isValidTransition(from: StrategyState, to: StrategyState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStates(current: StrategyState): StrategyState[] {
  return STATE_TRANSITIONS[current] ?? [];
}

