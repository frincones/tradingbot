/**
 * Hyperliquid WebSocket Client
 * Real-time market data from Hyperliquid
 */

import WebSocket from 'ws';
import {
  isValidSubscriptionType,
  type HLWebSocketConfig,
  type HLSubscription,
  type HLMessageHandler,
  type HLSubscriptionType,
} from './types';

const DEFAULT_CONFIG: Required<HLWebSocketConfig> = {
  url: 'wss://api.hyperliquid.xyz/ws',
  reconnect: true,
  reconnectMaxAttempts: 10,
  reconnectDelay: 1000,
  pingInterval: 30000,
};

export class HyperliquidWebSocket {
  private ws: WebSocket | null = null;
  private config: Required<HLWebSocketConfig>;
  private reconnectAttempts = 0;
  private subscriptions: Map<string, HLMessageHandler[]> = new Map();
  private pingIntervalId: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;

  constructor(config: HLWebSocketConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to Hyperliquid WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.resubscribe();
          resolve();
        });

        this.ws.on('message', (data) => this.handleMessage(data));

        this.ws.on('close', () => {
          this.isConnected = false;
          this.stopPingInterval();
          this.handleDisconnect();
        });

        this.ws.on('error', (error) => {
          this.isConnecting = false;
          if (!this.isConnected) {
            reject(error);
          }
          console.error('[HL WebSocket] Error:', error.message);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.config.reconnect = false;
    this.stopPingInterval();
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  /**
   * Subscribe to a channel
   */
  subscribe(subscription: HLSubscription, handler: HLMessageHandler): () => void {
    const channel = this.getChannelKey(subscription);

    const handlers = this.subscriptions.get(channel) || [];
    handlers.push(handler);
    this.subscriptions.set(channel, handlers);

    if (this.isConnected) {
      this.sendSubscription(subscription);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(channel) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.subscriptions.delete(channel);
        this.sendUnsubscription(subscription);
      }
    };
  }

  /**
   * Subscribe to trades for a coin
   */
  subscribeTrades(coin: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'trades', coin }, handler);
  }

  /**
   * Subscribe to order book for a coin
   */
  subscribeOrderBook(coin: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'l2Book', coin }, handler);
  }

  /**
   * Subscribe to all mid prices
   */
  subscribeAllMids(handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'allMids' }, handler);
  }

  /**
   * Subscribe to candles for a coin
   */
  subscribeCandles(coin: string, interval: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'candle', coin, interval }, handler);
  }

  /**
   * Subscribe to user events
   */
  subscribeUserEvents(user: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'userEvents', user }, handler);
  }

  /**
   * Subscribe to active asset data (realtime market stats)
   * Includes mark price, open interest, funding, volume updates
   */
  subscribeActiveAssetData(coin: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'activeAssetData', coin }, handler);
  }

  /**
   * Subscribe to user fills (realtime trade fills including liquidations)
   */
  subscribeUserFills(user: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'userFills', user }, handler);
  }

  /**
   * Subscribe to user fundings
   */
  subscribeUserFundings(user: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'userFundings', user }, handler);
  }

  /**
   * Subscribe to user non-funding ledger updates (liquidations, deposits, withdrawals)
   */
  subscribeUserLedgerUpdates(user: string, handler: HLMessageHandler): () => void {
    return this.subscribe({ type: 'userNonFundingLedgerUpdates', user }, handler);
  }

  /**
   * Subscribe to trades with whale filtering
   * @param coin The coin to track
   * @param whaleThresholdUsd Minimum notional to consider (default $50k)
   * @param handler Callback for whale trades
   */
  subscribeWhaleTrades(
    coin: string,
    whaleThresholdUsd: number,
    handler: (trade: { coin: string; side: string; px: string; sz: string; notional: number; time: number }) => void
  ): () => void {
    return this.subscribe({ type: 'trades', coin }, (data: unknown) => {
      const trades = Array.isArray(data) ? data : [data];
      for (const trade of trades) {
        const t = trade as { coin: string; side: string; px: string; sz: string; time: number };
        const notional = parseFloat(t.px) * parseFloat(t.sz);
        if (notional >= whaleThresholdUsd) {
          handler({ ...t, notional });
        }
      }
    });
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  private getChannelKey(subscription: HLSubscription): string {
    const parts: string[] = [subscription.type];
    if (subscription.coin) parts.push(subscription.coin);
    if (subscription.interval) parts.push(subscription.interval);
    if (subscription.user) parts.push(subscription.user);
    return parts.join(':');
  }

  private sendSubscription(subscription: HLSubscription): void {
    this.send({
      method: 'subscribe',
      subscription,
    });
  }

  private sendUnsubscription(subscription: HLSubscription): void {
    this.send({
      method: 'unsubscribe',
      subscription,
    });
  }

  private send(data: object): void {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle ping/pong
      if (message.channel === 'pong') {
        return;
      }

      // Route to appropriate handlers
      const channel = message.channel;
      if (channel) {
        const handlers = this.subscriptions.get(channel);
        if (handlers) {
          handlers.forEach((handler) => handler(message.data));
        }

        // Also try with coin-specific channel
        const coinChannel = `${channel}:${message.data?.coin}`;
        const coinHandlers = this.subscriptions.get(coinChannel);
        if (coinHandlers) {
          coinHandlers.forEach((handler) => handler(message.data));
        }
      }
    } catch (error) {
      console.error('[HL WebSocket] Parse error:', error);
    }
  }

  private handleDisconnect(): void {
    if (!this.config.reconnect) {
      return;
    }

    if (this.reconnectAttempts < this.config.reconnectMaxAttempts) {
      const delay = Math.min(
        this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
        60000
      );
      console.log(`[HL WebSocket] Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
      this.reconnectAttempts++;
    } else {
      console.error('[HL WebSocket] Max reconnect attempts reached');
    }
  }

  private resubscribe(): void {
    for (const [channel] of this.subscriptions) {
      const parts = channel.split(':');
      const type = parts[0];
      if (type && isValidSubscriptionType(type)) {
        const subscription: HLSubscription = { type };
        if (parts[1]) subscription.coin = parts[1];
        if (parts[2]) subscription.interval = parts[2];
        this.sendSubscription(subscription);
      }
    }
  }

  private startPingInterval(): void {
    this.pingIntervalId = setInterval(() => {
      this.send({ method: 'ping' });
    }, this.config.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}

