'use client';

/**
 * Paper Orders Hook
 * Manages paper trading orders CRUD operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import type { PaperOrder, PaperOrderStatus, PaperOrderExitReason } from '@kit/trading-core';

interface PaperOrderFilters {
  status?: PaperOrderStatus | 'all';
  symbol?: string;
  limit?: number;
}

interface CreatePaperOrderInput {
  alert_id: string;
  size_usd?: number;
}

interface ClosePaperOrderInput {
  exit_price: number;
  exit_reason: PaperOrderExitReason;
}

// Simplified stats type that matches what API returns
interface PaperTradingStats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_win?: number;
  avg_loss?: number;
  profit_factor?: number;
  max_drawdown?: number;
  pattern_stats?: Record<string, { trades: number; wins: number; total_pnl: number; avg_pnl: number }>;
  current_streak: number;
  best_streak?: number;
  worst_streak?: number;
}

interface UsePaperOrdersReturn {
  orders: PaperOrder[];
  openOrders: PaperOrder[];
  stats: PaperTradingStats | null;
  isLoading: boolean;
  isCreating: boolean;
  isClosing: boolean;
  error: string | null;
  fetchOrders: (filters?: PaperOrderFilters) => Promise<void>;
  fetchStats: () => Promise<void>;
  createOrder: (input: CreatePaperOrderInput) => Promise<PaperOrder | null>;
  closeOrder: (orderId: string, input: ClosePaperOrderInput) => Promise<PaperOrder | null>;
  deleteOrder: (orderId: string) => Promise<boolean>;
  refreshAll: () => Promise<void>;
}

export function usePaperOrders(): UsePaperOrdersReturn {
  const client = useSupabase();
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [stats, setStats] = useState<PaperTradingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openOrders = orders.filter((o) => o.status === 'open');

  const fetchOrders = useCallback(async (filters: PaperOrderFilters = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') {
        params.set('status', filters.status);
      }
      if (filters.symbol) {
        params.set('symbol', filters.symbol);
      }
      if (filters.limit) {
        params.set('limit', filters.limit.toString());
      }

      const response = await fetch(`/api/trading/paper-orders?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch orders');
      }

      setOrders(data.orders || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch orders';
      setError(message);
      console.error('[usePaperOrders] fetchOrders error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/paper-orders/stats');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.stats || null);
    } catch (err) {
      console.error('[usePaperOrders] fetchStats error:', err);
    }
  }, []);

  const createOrder = useCallback(async (input: CreatePaperOrderInput): Promise<PaperOrder | null> => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/trading/paper-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create order');
      }

      // Add new order to state (check for duplicates - realtime may have already added it)
      setOrders((prev) => {
        if (prev.some((o) => o.id === data.order.id)) return prev;
        return [data.order, ...prev];
      });

      return data.order;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      setError(message);
      console.error('[usePaperOrders] createOrder error:', err);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const closeOrder = useCallback(async (orderId: string, input: ClosePaperOrderInput): Promise<PaperOrder | null> => {
    setIsClosing(true);
    setError(null);

    try {
      const response = await fetch(`/api/trading/paper-orders/${orderId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to close order');
      }

      // Update order in state
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? data.order : o))
      );

      // Refresh stats after closing
      await fetchStats();

      return data.order;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close order';
      setError(message);
      console.error('[usePaperOrders] closeOrder error:', err);
      return null;
    } finally {
      setIsClosing(false);
    }
  }, [fetchStats]);

  const deleteOrder = useCallback(async (orderId: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch(`/api/trading/paper-orders/${orderId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete order');
      }

      // Remove order from state
      setOrders((prev) => prev.filter((o) => o.id !== orderId));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete order';
      setError(message);
      console.error('[usePaperOrders] deleteOrder error:', err);
      return false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchOrders(), fetchStats()]);
  }, [fetchOrders, fetchStats]);

  // Subscribe to realtime updates for paper_orders
  useEffect(() => {
    const channel = client
      .channel('paper_orders_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'paper_orders',
        },
        (payload) => {
          console.log('[usePaperOrders] Realtime update:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as PaperOrder;
            setOrders((prev) => {
              // Avoid duplicates
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedOrder = payload.new as PaperOrder;
            setOrders((prev) =>
              prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setOrders((prev) => prev.filter((o) => o.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client]);

  // Initial fetch
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    orders,
    openOrders,
    stats,
    isLoading,
    isCreating,
    isClosing,
    error,
    fetchOrders,
    fetchStats,
    createOrder,
    closeOrder,
    deleteOrder,
    refreshAll,
  };
}
