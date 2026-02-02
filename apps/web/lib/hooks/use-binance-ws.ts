'use client';

/**
 * Binance WebSocket Hook for Browser
 * Real-time streaming for price, ticker, and trades
 * Uses SINGLETON pattern - all components share ONE connection
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_BINANCE_WS_URL || 'wss://stream.testnet.binance.vision/ws';

export interface BinanceWSTickerData {
  e: '24hrTicker'; // Event type
  E: number; // Event time
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted average price
  c: string; // Last price
  Q: string; // Last quantity
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
}

export interface BinanceWSTradeData {
  e: 'trade';
  E: number; // Event time
  s: string; // Symbol
  t: number; // Trade ID
  p: string; // Price
  q: string; // Quantity
  T: number; // Trade time
  m: boolean; // Is buyer maker
}

export interface BinanceWSBookTickerData {
  u: number; // Order book updateId
  s: string; // Symbol
  b: string; // Best bid price
  B: string; // Best bid quantity
  a: string; // Best ask price
  A: string; // Best ask quantity
}

type MessageHandler = (data: unknown) => void;

// ============================================================================
// SINGLETON WEBSOCKET MANAGER
// ============================================================================

class BinanceWSManager {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private subscriptions = new Map<string, number>(); // stream -> refCount
  private listeners = new Map<string, MessageHandler[]>(); // listenerId -> handlers
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || !WS_URL) return;

    console.log('[Binance WS] Connecting to', WS_URL);
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[Binance WS] Connected');
      this.isConnected = true;
      this.reconnectAttempt = 0;

      // Resubscribe to all streams
      this.subscriptions.forEach((count, stream) => {
        if (count > 0) this.sendSubscribe(stream);
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Notify all listeners
        this.listeners.forEach((handlers) => {
          handlers.forEach((handler) => {
            try {
              handler(data);
            } catch (e) {
              console.error('[Binance WS] Handler error:', e);
            }
          });
        });
      } catch (e) {
        console.error('[Binance WS] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Binance WS] Disconnected');
      this.isConnected = false;

      // Auto-reconnect if there are active listeners
      if (this.listeners.size > 0) {
        const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempt), 60000);
        console.log(`[Binance WS] Reconnecting in ${Math.round(delay / 1000)}s...`);

        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempt++;
          this.connect();
        }, delay);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Binance WS] Error:', error);
    };
  }

  subscribe(stream: string, handler: MessageHandler): () => void {
    const listenerId = Math.random().toString(36);

    if (!this.listeners.has(listenerId)) {
      this.listeners.set(listenerId, []);
    }
    this.listeners.get(listenerId)!.push(handler);

    const count = this.subscriptions.get(stream) || 0;
    this.subscriptions.set(stream, count + 1);

    if (count === 0 && this.isConnected) {
      this.sendSubscribe(stream);
    }

    if (!this.isConnected) {
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(listenerId);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx > -1) handlers.splice(idx, 1);
        if (handlers.length === 0) this.listeners.delete(listenerId);
      }

      const newCount = (this.subscriptions.get(stream) || 1) - 1;
      if (newCount <= 0) {
        this.subscriptions.delete(stream);
        if (this.isConnected) this.sendUnsubscribe(stream);
      } else {
        this.subscriptions.set(stream, newCount);
      }
    };
  }

  private sendSubscribe(stream: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: [stream],
          id: Date.now(),
        })
      );
    }
  }

  private sendUnsubscribe(stream: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          method: 'UNSUBSCRIBE',
          params: [stream],
          id: Date.now(),
        })
      );
    }
  }
}

const wsManager = new BinanceWSManager();

// ============================================================================
// REACT HOOK
// ============================================================================

export function useBinanceWS(symbol: string) {
  const [ticker, setTicker] = useState<BinanceWSTickerData | null>(null);
  const [lastTrade, setLastTrade] = useState<BinanceWSTradeData | null>(null);
  const [bookTicker, setBookTicker] = useState<BinanceWSBookTickerData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Normalize symbol (remove / and lowercase)
  const normalizedSymbol = symbol.toLowerCase().replace('/', '');

  useEffect(() => {
    if (!normalizedSymbol) return;

    const tickerStream = `${normalizedSymbol}@ticker`;
    const tradeStream = `${normalizedSymbol}@trade`;
    const bookTickerStream = `${normalizedSymbol}@bookTicker`;

    const unsubTicker = wsManager.subscribe(tickerStream, (data: unknown) => {
      const d = data as BinanceWSTickerData;
      if (d.e === '24hrTicker' && d.s.toLowerCase() === normalizedSymbol) {
        setTicker(d);
        setIsConnected(true);
      }
    });

    const unsubTrade = wsManager.subscribe(tradeStream, (data: unknown) => {
      const d = data as BinanceWSTradeData;
      if (d.e === 'trade' && d.s.toLowerCase() === normalizedSymbol) {
        setLastTrade(d);
      }
    });

    const unsubBookTicker = wsManager.subscribe(bookTickerStream, (data: unknown) => {
      const d = data as BinanceWSBookTickerData;
      if (d.s.toLowerCase() === normalizedSymbol) {
        setBookTicker(d);
      }
    });

    return () => {
      unsubTicker();
      unsubTrade();
      unsubBookTicker();
    };
  }, [normalizedSymbol]);

  const currentPrice = ticker?.c || bookTicker?.a || lastTrade?.p || null;

  return {
    ticker,
    lastTrade,
    bookTicker,
    isConnected,
    currentPrice,
    priceChangePercent: ticker?.P || null,
    volume24h: ticker?.v || null,
    high24h: ticker?.h || null,
    low24h: ticker?.l || null,
  };
}
