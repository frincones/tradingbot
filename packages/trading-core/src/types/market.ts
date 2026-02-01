/**
 * Market Data Types
 * Types for market data from Hyperliquid
 */

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  numOrders?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface MarketDataCache {
  id: string;
  symbol: string;
  data_type: 'ticker' | 'orderbook' | 'trades' | 'ohlcv';
  ts: string;
  data_json: Record<string, unknown>;
  source: string;
  created_at: string;
  expires_at?: string | null;
}

export interface HyperliquidTrade {
  coin: string;
  side: 'B' | 'S';
  px: string;
  sz: string;
  time: number;
  hash: string;
}

export interface HyperliquidOrderBook {
  coin: string;
  levels: {
    bids: Array<{ px: string; sz: string; n: number }>;
    asks: Array<{ px: string; sz: string; n: number }>;
  };
  time: number;
}

export interface HyperliquidUserState {
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
    };
  }>;
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}

