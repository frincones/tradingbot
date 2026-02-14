'use client';

/**
 * Hyperliquid WebSocket Hook for Browser
 * Real-time streaming for trades, candles, order book, and prices
 * Uses SINGLETON pattern - all components share ONE connection
 * Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';

export interface HLWSCandle {
  t: number; // open millis
  T: number; // close millis
  s: string; // coin
  i: string; // interval
  o: string; // open price
  c: string; // close price
  h: string; // high price
  l: string; // low price
  v: string; // volume
  n: number; // number of trades
}

export interface HLWSTrade {
  coin: string;
  side: 'B' | 'A';
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
  user?: string; // Wallet address (if available from lookup)
}

export interface HLWSMids {
  mids: Record<string, string>;
}

export interface HLWSOrderBook {
  coin: string;
  levels: Array<Array<{ px: string; sz: string; n: number }>>;
  time: number;
}

// Active asset context - raw WebSocket response (nested structure)
interface HLWSActiveAssetCtxRaw {
  coin: string;
  ctx: {
    dayNtlVlm: string;
    prevDayPx: string;
    markPx: string;
    midPx?: string;
    funding: string;
    openInterest: string;
    oraclePx: string;
    premium?: string;
  };
}

// Active asset data for realtime market stats (flattened for consumers)
export interface HLWSActiveAssetData {
  coin: string;
  markPx: string;
  midPx?: string;
  oraclePx?: string;
  openInterest?: string;
  funding?: string;
  premium?: string;
  dayNtlVlm?: string;
  prevDayPx?: string;
}

// User fill (trade execution)
export interface HLWSUserFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'S';
  time: number;
  hash: string;
  closedPnl?: string;
  fee?: string;
  tid?: number;
  oid?: number;
  liquidation?: boolean; // True if this is a liquidation
}

// Whale trade (large trade detected)
export interface HLWSWhaleTrade {
  coin: string;
  side: 'B' | 'A' | 'S';  // B=Buy, A/S=Sell (Hyperliquid uses 'A' for Ask/Sell)
  px: string;
  sz: string;
  notionalUsd: number;
  hash: string;
  time: number;
  tid: number;
  user?: string; // Wallet address (if available from lookup)
}

interface WSMessage {
  channel: string;
  data: unknown;
}

type SubscriptionType = 'allMids' | 'trades' | 'l2Book' | 'candle' | 'activeAssetCtx' | 'userFills' | 'userFundings' | 'userNonFundingLedgerUpdates';

interface Subscription {
  type: SubscriptionType;
  coin?: string;
  interval?: string;
  user?: string;
}

// ============================================================================
// SINGLETON WEBSOCKET MANAGER
// ============================================================================

type MessageCallback = (channel: string, data: unknown) => void;
type ConnectionCallback = () => void;

interface HookCallbacks {
  onMessage: MessageCallback;
  onConnect?: ConnectionCallback;
  onDisconnect?: ConnectionCallback;
}

class HLWebSocketManager {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions = new Map<string, number>(); // subJson -> refCount
  private listeners = new Map<string, HookCallbacks>(); // listenerId -> callbacks
  private connectionListeners = new Set<() => void>();
  private connecting = false;

  connect(): void {
    // Prevent multiple simultaneous connections
    if (this.ws?.readyState === WebSocket.OPEN || this.connecting) {
      return;
    }

    if (typeof WebSocket === 'undefined') {
      console.warn('[HL WS Manager] WebSocket not supported');
      return;
    }

    this.connecting = true;
    console.log('[HL WS Manager] Connecting (singleton)...');

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[HL WS Manager] Connected (singleton)');
        this.isConnected = true;
        this.connecting = false;
        this.reconnectAttempt = 0;

        // Start ping - 8s interval to prevent Hyperliquid idle disconnections
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 8000);

        // Re-subscribe to all active subscriptions
        this.subscriptions.forEach((count, subJson) => {
          if (count > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const sub = JSON.parse(subJson);
            this.ws.send(JSON.stringify({ method: 'subscribe', subscription: sub }));
          }
        });

        // Notify all listeners
        this.listeners.forEach(cb => cb.onConnect?.());
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          const { channel, data } = message;

          if (channel === 'pong' || channel === 'subscriptionResponse') {
            return;
          }

          // Dispatch to all listeners
          this.listeners.forEach(cb => {
            try {
              cb.onMessage(channel, data);
            } catch (e) {
              console.debug('[HL WS Manager] Listener error:', e);
            }
          });
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onclose = (event) => {
        console.log('[HL WS Manager] Disconnected:', event.code, event.reason || '');
        this.isConnected = false;
        this.connecting = false;

        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // Notify all listeners
        this.listeners.forEach(cb => cb.onDisconnect?.());

        // Auto-reconnect with exponential backoff
        if (this.reconnectAttempt >= 0 && this.listeners.size > 0) {
          const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempt), 60000);
          console.log(`[HL WS Manager] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt + 1})...`);

          this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempt++;
            if (this.reconnectAttempt > 100) this.reconnectAttempt = 10;
            this.connect();
          }, delay);
        }
      };

      this.ws.onerror = () => {
        // Error will trigger close event
      };

    } catch (error) {
      console.error('[HL WS Manager] Failed to create WebSocket:', error);
      this.connecting = false;
    }
  }

  disconnect(): void {
    this.reconnectAttempt = -1;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.connecting = false;
  }

  registerListener(id: string, callbacks: HookCallbacks): void {
    this.listeners.set(id, callbacks);

    // If we have listeners and not connected, connect
    if (this.listeners.size > 0 && !this.isConnected && !this.connecting) {
      this.connect();
    }
  }

  unregisterListener(id: string): void {
    this.listeners.delete(id);

    // If no more listeners, disconnect after a delay
    if (this.listeners.size === 0) {
      setTimeout(() => {
        if (this.listeners.size === 0) {
          this.disconnect();
        }
      }, 5000);
    }
  }

  subscribe(subscription: Subscription): void {
    const subJson = JSON.stringify(subscription);
    const count = this.subscriptions.get(subJson) || 0;
    this.subscriptions.set(subJson, count + 1);

    // Only send if this is the first subscriber
    if (count === 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribe', subscription }));
    }
  }

  unsubscribe(subscription: Subscription): void {
    const subJson = JSON.stringify(subscription);
    const count = this.subscriptions.get(subJson) || 0;

    if (count <= 1) {
      this.subscriptions.delete(subJson);
      // Only unsubscribe from server if no more subscribers
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription }));
      }
    } else {
      this.subscriptions.set(subJson, count - 1);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let wsManager: HLWebSocketManager | null = null;

function getWSManager(): HLWebSocketManager {
  if (!wsManager) {
    wsManager = new HLWebSocketManager();
  }
  return wsManager;
}

// ============================================================================
// REACT HOOK
// ============================================================================

export interface UseHyperliquidWSOptions {
  autoConnect?: boolean;
  whaleThresholdUsd?: number; // Minimum trade size to trigger onWhaleTrade (default $100k)
  onCandle?: (candle: HLWSCandle) => void;
  onTrade?: (trade: HLWSTrade) => void;
  onWhaleTrade?: (trade: HLWSWhaleTrade) => void;
  onMids?: (mids: Record<string, string>) => void;
  onOrderBook?: (book: HLWSOrderBook) => void;
  onActiveAssetData?: (data: HLWSActiveAssetData) => void;
  onUserFill?: (fill: HLWSUserFill) => void;
  onLiquidation?: (fill: HLWSUserFill) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useHyperliquidWS(options: UseHyperliquidWSOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const listenerIdRef = useRef(`hl-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // Handle messages from the singleton
  const handleMessage = useCallback((channel: string, data: unknown) => {
    const whaleThreshold = callbacksRef.current.whaleThresholdUsd || 100000;

    switch (channel) {
      case 'candle':
        callbacksRef.current.onCandle?.(data as HLWSCandle);
        break;
      case 'trades': {
        if (Array.isArray(data)) {
          data.forEach((trade) => {
            const t = trade as HLWSTrade;
            callbacksRef.current.onTrade?.(t);

            // Check for whale trades
            if (callbacksRef.current.onWhaleTrade) {
              const notionalUsd = parseFloat(t.px) * parseFloat(t.sz);
              if (notionalUsd >= whaleThreshold) {
                callbacksRef.current.onWhaleTrade({
                  ...t,
                  notionalUsd,
                });
              }
            }
          });
        }
        break;
      }
      case 'allMids':
        callbacksRef.current.onMids?.((data as { mids: Record<string, string> }).mids);
        break;
      case 'l2Book':
        callbacksRef.current.onOrderBook?.(data as HLWSOrderBook);
        break;
      case 'activeAssetCtx': {
        const rawData = data as HLWSActiveAssetCtxRaw;
        const assetData: HLWSActiveAssetData = {
          coin: rawData.coin,
          markPx: rawData.ctx?.markPx || '0',
          midPx: rawData.ctx?.midPx,
          oraclePx: rawData.ctx?.oraclePx,
          openInterest: rawData.ctx?.openInterest,
          funding: rawData.ctx?.funding,
          premium: rawData.ctx?.premium,
          dayNtlVlm: rawData.ctx?.dayNtlVlm,
          prevDayPx: rawData.ctx?.prevDayPx,
        };
        callbacksRef.current.onActiveAssetData?.(assetData);
        break;
      }
      case 'userFills': {
        if (Array.isArray(data)) {
          data.forEach((fill) => {
            const f = fill as HLWSUserFill;
            callbacksRef.current.onUserFill?.(f);

            if (f.liquidation && callbacksRef.current.onLiquidation) {
              callbacksRef.current.onLiquidation(f);
            }
          });
        }
        break;
      }
    }
  }, []);

  // Register with singleton on mount
  useEffect(() => {
    const manager = getWSManager();
    const listenerId = listenerIdRef.current;

    manager.registerListener(listenerId, {
      onMessage: handleMessage,
      onConnect: () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        callbacksRef.current.onConnect?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        callbacksRef.current.onDisconnect?.();
      },
    });

    // Set initial state
    setIsConnected(manager.getConnectionStatus());
    setConnectionStatus(manager.getConnectionStatus() ? 'connected' : 'disconnected');

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      manager.connect();
    }

    return () => {
      // Unsubscribe from all this hook's subscriptions
      subscriptionsRef.current.forEach(subJson => {
        try {
          const sub = JSON.parse(subJson);
          manager.unsubscribe(sub);
        } catch {
          // ignore
        }
      });
      subscriptionsRef.current.clear();

      // Unregister listener
      manager.unregisterListener(listenerId);
    };
  }, [handleMessage, options.autoConnect]);

  const subscribe = useCallback((subscription: Subscription) => {
    const subJson = JSON.stringify(subscription);
    if (!subscriptionsRef.current.has(subJson)) {
      subscriptionsRef.current.add(subJson);
      getWSManager().subscribe(subscription);
    }
  }, []);

  const unsubscribe = useCallback((subscription: Subscription) => {
    const subJson = JSON.stringify(subscription);
    if (subscriptionsRef.current.has(subJson)) {
      subscriptionsRef.current.delete(subJson);
      getWSManager().unsubscribe(subscription);
    }
  }, []);

  const connect = useCallback(() => {
    getWSManager().connect();
  }, []);

  const disconnect = useCallback(() => {
    getWSManager().disconnect();
  }, []);

  // Convenience subscription methods
  const subscribeCandles = useCallback((coin: string, interval: string) => {
    subscribe({ type: 'candle', coin, interval });
  }, [subscribe]);

  const unsubscribeCandles = useCallback((coin: string, interval: string) => {
    unsubscribe({ type: 'candle', coin, interval });
  }, [unsubscribe]);

  const subscribeTrades = useCallback((coin: string) => {
    subscribe({ type: 'trades', coin });
  }, [subscribe]);

  const unsubscribeTrades = useCallback((coin: string) => {
    unsubscribe({ type: 'trades', coin });
  }, [unsubscribe]);

  const subscribeOrderBook = useCallback((coin: string) => {
    subscribe({ type: 'l2Book', coin });
  }, [subscribe]);

  const subscribeAllMids = useCallback(() => {
    subscribe({ type: 'allMids' });
  }, [subscribe]);

  const subscribeActiveAssetData = useCallback((coin: string) => {
    subscribe({ type: 'activeAssetCtx', coin });
  }, [subscribe]);

  const unsubscribeActiveAssetData = useCallback((coin: string) => {
    unsubscribe({ type: 'activeAssetCtx', coin });
  }, [unsubscribe]);

  const subscribeUserFills = useCallback((user: string) => {
    subscribe({ type: 'userFills', user });
  }, [subscribe]);

  const unsubscribeUserFills = useCallback((user: string) => {
    unsubscribe({ type: 'userFills', user });
  }, [unsubscribe]);

  const subscribeUserFundings = useCallback((user: string) => {
    subscribe({ type: 'userFundings', user });
  }, [subscribe]);

  const subscribeUserLedgerUpdates = useCallback((user: string) => {
    subscribe({ type: 'userNonFundingLedgerUpdates', user });
  }, [subscribe]);

  return {
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    subscribeCandles,
    unsubscribeCandles,
    subscribeTrades,
    unsubscribeTrades,
    subscribeOrderBook,
    subscribeAllMids,
    subscribeActiveAssetData,
    unsubscribeActiveAssetData,
    subscribeUserFills,
    unsubscribeUserFills,
    subscribeUserFundings,
    subscribeUserLedgerUpdates,
  };
}
