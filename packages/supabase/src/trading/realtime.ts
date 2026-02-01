/**
 * Trading Realtime Subscriptions
 * Supabase realtime helpers for trading events
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '../database.types';

type Client = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];

export type RealtimeCallback<T> = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T | null;
}) => void;

// ============================================
// Signal Subscriptions
// ============================================

export function subscribeToSignals(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['signals']['Row']>
): RealtimeChannel {
  return client
    .channel(`signals:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'signals',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['signals']['Row'],
          old: payload.old as Tables['signals']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Trade Intent Subscriptions
// ============================================

export function subscribeToTradeIntents(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['trade_intents']['Row']>
): RealtimeChannel {
  return client
    .channel(`trade_intents:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'trade_intents',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['trade_intents']['Row'],
          old: payload.old as Tables['trade_intents']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Order Subscriptions
// ============================================

export function subscribeToOrders(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['orders']['Row']>
): RealtimeChannel {
  return client
    .channel(`orders:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['orders']['Row'],
          old: payload.old as Tables['orders']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Position Subscriptions
// ============================================

export function subscribeToPositions(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['positions']['Row']>
): RealtimeChannel {
  return client
    .channel(`positions:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'positions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['positions']['Row'],
          old: payload.old as Tables['positions']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Risk Event Subscriptions
// ============================================

export function subscribeToRiskEvents(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['risk_events']['Row']>
): RealtimeChannel {
  return client
    .channel(`risk_events:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'risk_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['risk_events']['Row'],
          old: payload.old as Tables['risk_events']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Whale Event Subscriptions
// ============================================

export function subscribeToWhaleEvents(
  client: Client,
  userId: string,
  callback: RealtimeCallback<Tables['whale_events']['Row']>
): RealtimeChannel {
  return client
    .channel(`whale_events:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whale_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['whale_events']['Row'],
          old: payload.old as Tables['whale_events']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Strategy Subscriptions
// ============================================

export function subscribeToStrategy(
  client: Client,
  strategyId: string,
  callback: RealtimeCallback<Tables['strategies']['Row']>
): RealtimeChannel {
  return client
    .channel(`strategy:${strategyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'strategies',
        filter: `id=eq.${strategyId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['strategies']['Row'],
          old: payload.old as Tables['strategies']['Row'] | null,
        });
      }
    )
    .subscribe();
}

// ============================================
// Combined Trading Channel
// ============================================

export interface TradingRealtimeCallbacks {
  onSignal?: RealtimeCallback<Tables['signals']['Row']>;
  onIntent?: RealtimeCallback<Tables['trade_intents']['Row']>;
  onOrder?: RealtimeCallback<Tables['orders']['Row']>;
  onPosition?: RealtimeCallback<Tables['positions']['Row']>;
  onRiskEvent?: RealtimeCallback<Tables['risk_events']['Row']>;
  onWhaleEvent?: RealtimeCallback<Tables['whale_events']['Row']>;
}

export function subscribeToTradingEvents(
  client: Client,
  userId: string,
  callbacks: TradingRealtimeCallbacks
): RealtimeChannel {
  const channel = client.channel(`trading:${userId}`);

  if (callbacks.onSignal) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'signals',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onSignal!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['signals']['Row'],
          old: payload.old as Tables['signals']['Row'] | null,
        });
      }
    );
  }

  if (callbacks.onIntent) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'trade_intents',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onIntent!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['trade_intents']['Row'],
          old: payload.old as Tables['trade_intents']['Row'] | null,
        });
      }
    );
  }

  if (callbacks.onOrder) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onOrder!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['orders']['Row'],
          old: payload.old as Tables['orders']['Row'] | null,
        });
      }
    );
  }

  if (callbacks.onPosition) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'positions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onPosition!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['positions']['Row'],
          old: payload.old as Tables['positions']['Row'] | null,
        });
      }
    );
  }

  if (callbacks.onRiskEvent) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'risk_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onRiskEvent!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['risk_events']['Row'],
          old: payload.old as Tables['risk_events']['Row'] | null,
        });
      }
    );
  }

  if (callbacks.onWhaleEvent) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whale_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callbacks.onWhaleEvent!({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Tables['whale_events']['Row'],
          old: payload.old as Tables['whale_events']['Row'] | null,
        });
      }
    );
  }

  return channel.subscribe();
}
