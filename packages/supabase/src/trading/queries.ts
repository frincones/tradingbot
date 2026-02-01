/**
 * Trading Query Helpers
 * Supabase query functions for trading operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

type Client = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
type Enums = Database['public']['Enums'];

// ============================================
// Strategies
// ============================================

export async function getStrategies(client: Client, userId: string) {
  return client
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function getStrategy(client: Client, strategyId: string) {
  return client
    .from('strategies')
    .select('*')
    .eq('id', strategyId)
    .single();
}

export async function getActiveStrategies(client: Client, userId: string) {
  return client
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .neq('current_state', 'IDLE' as Enums['strategy_state'])
    .order('created_at', { ascending: false });
}

export async function updateStrategyState(
  client: Client,
  strategyId: string,
  newState: Enums['strategy_state'],
  metadata?: Record<string, unknown>
) {
  return client
    .from('strategies')
    .update({
      current_state: newState,
      ...(metadata && { metadata }),
    })
    .eq('id', strategyId);
}

// ============================================
// Signals
// ============================================

export async function getSignals(
  client: Client,
  options: {
    userId?: string;
    strategyId?: string;
    setup?: Enums['setup_type'];
    limit?: number;
  } = {}
) {
  let query = client.from('signals').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.strategyId) query = query.eq('strategy_id', options.strategyId);
  if (options.setup) query = query.eq('setup', options.setup);

  query = query.order('ts', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createSignal(
  client: Client,
  signal: Tables['signals']['Insert']
) {
  return client.from('signals').insert(signal).select().single();
}

// ============================================
// Trade Intents
// ============================================

export async function getTradeIntents(
  client: Client,
  options: {
    userId?: string;
    strategyId?: string;
    status?: Enums['intent_status'];
    limit?: number;
  } = {}
) {
  let query = client.from('trade_intents').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.strategyId) query = query.eq('strategy_id', options.strategyId);
  if (options.status) query = query.eq('status', options.status);

  query = query.order('created_at', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createTradeIntent(
  client: Client,
  intent: Tables['trade_intents']['Insert']
) {
  return client.from('trade_intents').insert(intent).select().single();
}

export async function updateTradeIntentStatus(
  client: Client,
  intentId: string,
  status: Enums['intent_status'],
  metadata?: Record<string, unknown>
) {
  return client
    .from('trade_intents')
    .update({
      status,
      ...(metadata && { metadata }),
    })
    .eq('id', intentId);
}

// ============================================
// Orders
// ============================================

export async function getOrders(
  client: Client,
  options: {
    userId?: string;
    intentId?: string;
    status?: Enums['order_status'];
    limit?: number;
  } = {}
) {
  let query = client.from('orders').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.intentId) query = query.eq('intent_id', options.intentId);
  if (options.status) query = query.eq('status', options.status);

  query = query.order('created_at', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createOrder(
  client: Client,
  order: Tables['orders']['Insert']
) {
  return client.from('orders').insert(order).select().single();
}

export async function updateOrder(
  client: Client,
  orderId: string,
  updates: Tables['orders']['Update']
) {
  return client.from('orders').update(updates).eq('id', orderId);
}

// ============================================
// Positions
// ============================================

export async function getPositions(
  client: Client,
  options: {
    userId?: string;
    strategyId?: string;
    status?: string;
  } = {}
) {
  let query = client.from('positions').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.strategyId) query = query.eq('strategy_id', options.strategyId);
  if (options.status) query = query.eq('status', options.status);

  return query.order('created_at', { ascending: false });
}

export async function getOpenPositions(client: Client, userId: string) {
  return client
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
}

export async function createPosition(
  client: Client,
  position: Tables['positions']['Insert']
) {
  return client.from('positions').insert(position).select().single();
}

export async function updatePosition(
  client: Client,
  positionId: string,
  updates: Tables['positions']['Update']
) {
  return client.from('positions').update(updates).eq('id', positionId);
}

// ============================================
// Risk Events
// ============================================

export async function getRiskEvents(
  client: Client,
  options: {
    userId?: string;
    strategyId?: string;
    eventType?: string;
    severity?: Enums['risk_severity'];
    limit?: number;
  } = {}
) {
  let query = client.from('risk_events').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.strategyId) query = query.eq('strategy_id', options.strategyId);
  if (options.eventType) query = query.eq('event_type', options.eventType);
  if (options.severity) query = query.eq('severity', options.severity);

  query = query.order('ts', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createRiskEvent(
  client: Client,
  event: Tables['risk_events']['Insert']
) {
  return client.from('risk_events').insert(event).select().single();
}

// ============================================
// Whale Events
// ============================================

export async function getWhaleEvents(
  client: Client,
  options: {
    userId?: string;
    watchlistId?: string;
    limit?: number;
  } = {}
) {
  let query = client.from('whale_events').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.watchlistId) query = query.eq('watchlist_id', options.watchlistId);

  query = query.order('detected_at', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createWhaleEvent(
  client: Client,
  event: Tables['whale_events']['Insert']
) {
  return client.from('whale_events').insert(event).select().single();
}

// ============================================
// Whale Watchlist
// ============================================

export async function getWhaleWatchlist(
  client: Client,
  userId: string,
  options: {
    status?: Enums['whale_status'];
  } = {}
) {
  let query = client
    .from('whale_watchlist')
    .select('*')
    .eq('user_id', userId);

  if (options.status) query = query.eq('status', options.status);

  return query.order('created_at', { ascending: false });
}

export async function addToWhaleWatchlist(
  client: Client,
  entry: Tables['whale_watchlist']['Insert']
) {
  return client.from('whale_watchlist').insert(entry).select().single();
}

// ============================================
// Daily Metrics
// ============================================

export async function getDailyMetrics(
  client: Client,
  userId: string,
  options: {
    startDate?: string;
    endDate?: string;
  } = {}
) {
  let query = client
    .from('daily_metrics')
    .select('*')
    .eq('user_id', userId);

  if (options.startDate) {
    query = query.gte('date', options.startDate);
  }
  if (options.endDate) {
    query = query.lte('date', options.endDate);
  }

  return query.order('date', { ascending: false });
}

// ============================================
// Agent Traces
// ============================================

export async function getAgentTraces(
  client: Client,
  options: {
    userId?: string;
    agentName?: string;
    limit?: number;
  } = {}
) {
  let query = client.from('agent_traces').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.agentName) query = query.eq('agent_name', options.agentName);

  query = query.order('created_at', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createAgentTrace(
  client: Client,
  trace: Tables['agent_traces']['Insert']
) {
  return client.from('agent_traces').insert(trace).select().single();
}

// ============================================
// Audit Log
// ============================================

export async function getAuditLog(
  client: Client,
  options: {
    userId?: string;
    entityType?: string;
    action?: string;
    limit?: number;
  } = {}
) {
  let query = client.from('audit_log').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.entityType) query = query.eq('entity_type', options.entityType);
  if (options.action) query = query.eq('action', options.action);

  query = query.order('ts', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

// ============================================
// Fills
// ============================================

export async function getFills(
  client: Client,
  options: {
    userId?: string;
    orderId?: string;
    limit?: number;
  } = {}
) {
  let query = client.from('fills').select('*');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.orderId) query = query.eq('order_id', options.orderId);

  query = query.order('filled_at', { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  return query;
}

export async function createFill(
  client: Client,
  fill: Tables['fills']['Insert']
) {
  return client.from('fills').insert(fill).select().single();
}
