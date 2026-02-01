/**
 * Hyperliquid Types
 * Type definitions for Hyperliquid API
 */

export interface HLTrade {
  coin: string;
  side: 'B' | 'S';
  px: string;
  sz: string;
  time: number;
  hash: string;
}

export interface HLOrderBookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface HLOrderBook {
  coin: string;
  levels: {
    bids: HLOrderBookLevel[];
    asks: HLOrderBookLevel[];
  };
  time: number;
}

export interface HLCandle {
  t: number;  // timestamp
  T: number;  // close timestamp
  s: string;  // coin
  i: string;  // interval
  o: string;  // open
  c: string;  // close
  h: string;  // high
  l: string;  // low
  v: string;  // volume
  n: number;  // number of trades
}

export interface HLUserState {
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      returnOnEquity: string;
      leverage: { type: string; value: number };
      maxTradeSzs: [string, string];
    };
  }>;
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
    withdrawable: string;
  };
}

export interface HLFundingRate {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

export interface HLMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated: boolean;
  }>;
}

// Asset context from metaAndAssetCtxs - full market data
export interface HLAssetCtx {
  coin: string;
  markPx: string;        // Mark price
  oraclePx: string;      // Oracle price
  funding: string;       // Current funding rate
  openInterest: string;  // Open interest
  dayNtlVlm: string;     // 24h volume in notional
  impactPxs: [string, string]; // [bid impact price, ask impact price]
  prevDayPx: string;     // Previous day price
  premium: string;       // Premium over spot
}

export interface HLMetaAndAssetCtxs {
  meta: HLMeta;
  assetCtxs: HLAssetCtx[];
}

// Predicted funding rates compared to other exchanges
export interface HLPredictedFunding {
  coin: string;
  venue: string;       // 'Hyperliquid', 'Binance', 'Bybit', etc.
  fundingRate: string;
  time: number;
}

// Funding history for historical charts
export interface HLFundingHistory {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

// User trade fill details
export interface HLUserFill {
  coin: string;
  px: string;          // Execution price
  sz: string;          // Size
  side: 'B' | 'S';     // Buy or Sell
  time: number;
  startPosition: string;
  dir: string;         // Direction
  closedPnl: string;   // Realized PNL
  hash: string;
  oid: number;         // Order ID
  crossed: boolean;
  fee: string;
  tid: number;         // Trade ID
  feeToken: string;
}

// Liquidation data
export interface HLLiquidation {
  lid: number;                  // Liquidation ID
  liquidator: string;           // Liquidator address
  liquidatedUser: string;       // User who got liquidated
  liquidatedNtlPos: string;     // Notional position liquidated
  liquidatedAccountValue: string; // Account value when liquidated
}

// User order
export interface HLOrder {
  coin: string;
  oid: number;
  side: 'B' | 'S';
  limitPx: string;
  sz: string;
  timestamp: number;
  origSz: string;
  reduceOnly?: boolean;
}

// Whale/large trade detection
export interface HLWhaleTrade {
  coin: string;
  side: 'B' | 'S';
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
  notionalUsd: number; // Computed: px * sz
  isLarge: boolean;    // True if > threshold
}

export type HLSubscriptionType = 'allMids' | 'l2Book' | 'trades' | 'candle' | 'userEvents' | 'webData2' | 'activeAssetData' | 'notification' | 'userFills' | 'userFundings' | 'userNonFundingLedgerUpdates';

export interface HLSubscription {
  type: HLSubscriptionType;
  coin?: string;
  interval?: string;
  user?: string;
}

export function isValidSubscriptionType(type: string): type is HLSubscriptionType {
  return ['allMids', 'l2Book', 'trades', 'candle', 'userEvents', 'webData2', 'activeAssetData', 'notification', 'userFills', 'userFundings', 'userNonFundingLedgerUpdates'].includes(type);
}

export interface HLWebSocketMessage {
  channel: string;
  data: unknown;
}

export type HLMessageHandler = (data: unknown) => void;

export interface HLWebSocketConfig {
  url?: string;
  reconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectDelay?: number;
  pingInterval?: number;
}

// Parsed types (converted from string to number)
export interface ParsedTrade {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  time: number;
  hash: string;
}

export interface ParsedOrderBook {
  coin: string;
  bids: Array<{ price: number; size: number; count: number }>;
  asks: Array<{ price: number; size: number; count: number }>;
  time: number;
}

export interface ParsedCandle {
  coin: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  numTrades: number;
}

export interface ParsedPosition {
  coin: string;
  size: number;
  side: 'long' | 'short';
  entryPrice: number;
  positionValue: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface ParsedAccountSummary {
  accountValue: number;
  totalPosition: number;
  totalCash: number;
  marginUsed: number;
  withdrawable: number;
  positions: ParsedPosition[];
}

// Parsed asset context
export interface ParsedAssetCtx {
  coin: string;
  markPrice: number;
  oraclePrice: number;
  funding: number;
  fundingAnnualized: number;
  openInterest: number;
  volume24h: number;
  impactBidPrice: number;
  impactAskPrice: number;
  prevDayPrice: number;
  priceChange24h: number;
  priceChangePct24h: number;
  premium: number;
}

// Parsed liquidation
export interface ParsedLiquidation {
  id: number;
  liquidator: string;
  liquidatedUser: string;
  notionalPosition: number;
  accountValue: number;
  timestamp: number;
}

// Parsed whale trade
export interface ParsedWhaleTrade {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  notionalUsd: number;
  hash: string;
  time: number;
  tid: number;
}

