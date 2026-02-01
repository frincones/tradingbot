/**
 * Hyperliquid Parsers
 * Convert raw HL data to typed objects
 */

import type {
  HLTrade,
  HLOrderBook,
  HLCandle,
  HLUserState,
  ParsedTrade,
  ParsedOrderBook,
  ParsedCandle,
  ParsedPosition,
  ParsedAccountSummary,
} from './types';

/**
 * Parse a raw trade from Hyperliquid
 */
export function parseTrade(trade: HLTrade): ParsedTrade {
  return {
    coin: trade.coin,
    side: trade.side === 'B' ? 'buy' : 'sell',
    price: parseFloat(trade.px),
    size: parseFloat(trade.sz),
    time: trade.time,
    hash: trade.hash,
  };
}

/**
 * Parse an array of trades
 */
export function parseTrades(trades: HLTrade[]): ParsedTrade[] {
  return trades.map(parseTrade);
}

/**
 * Parse order book from Hyperliquid
 * The API can return levels in different formats:
 * - New format: { levels: [[bids...], [asks...]] }
 * - Old format: { levels: { bids: [...], asks: [...] } }
 */
export function parseOrderBook(book: unknown): ParsedOrderBook {
  let bids: Array<{ price: number; size: number; count: number }> = [];
  let asks: Array<{ price: number; size: number; count: number }> = [];
  let coin = 'UNKNOWN';
  let time = Date.now();

  const bookObj = book as Record<string, unknown>;

  if (bookObj.coin && typeof bookObj.coin === 'string') {
    coin = bookObj.coin;
  }
  if (bookObj.time && typeof bookObj.time === 'number') {
    time = bookObj.time;
  }

  // Handle levels
  if (bookObj.levels) {
    // New format: levels is an array of arrays
    if (Array.isArray(bookObj.levels)) {
      const levels = bookObj.levels as unknown[][];
      const rawBids = levels[0] as Array<{ px: string; sz: string; n?: number }> | undefined;
      const rawAsks = levels[1] as Array<{ px: string; sz: string; n?: number }> | undefined;

      if (rawBids && Array.isArray(rawBids)) {
        bids = rawBids.map((level) => ({
          price: parseFloat(String(level.px)),
          size: parseFloat(String(level.sz)),
          count: level.n ?? 0,
        }));
      }

      if (rawAsks && Array.isArray(rawAsks)) {
        asks = rawAsks.map((level) => ({
          price: parseFloat(String(level.px)),
          size: parseFloat(String(level.sz)),
          count: level.n ?? 0,
        }));
      }
    }
    // Old format: levels is an object with bids/asks
    else if (typeof bookObj.levels === 'object' && bookObj.levels !== null) {
      const levelsObj = bookObj.levels as { bids?: unknown[]; asks?: unknown[] };

      if (levelsObj.bids && Array.isArray(levelsObj.bids)) {
        bids = levelsObj.bids.map((level: unknown) => {
          const l = level as { px: string; sz: string; n?: number };
          return {
            price: parseFloat(String(l.px)),
            size: parseFloat(String(l.sz)),
            count: l.n ?? 0,
          };
        });
      }

      if (levelsObj.asks && Array.isArray(levelsObj.asks)) {
        asks = levelsObj.asks.map((level: unknown) => {
          const l = level as { px: string; sz: string; n?: number };
          return {
            price: parseFloat(String(l.px)),
            size: parseFloat(String(l.sz)),
            count: l.n ?? 0,
          };
        });
      }
    }
  }

  return { coin, bids, asks, time };
}

/**
 * Parse candle from Hyperliquid
 */
export function parseCandle(candle: HLCandle): ParsedCandle {
  return {
    coin: candle.s,
    interval: candle.i,
    timestamp: candle.t,
    open: parseFloat(candle.o),
    high: parseFloat(candle.h),
    low: parseFloat(candle.l),
    close: parseFloat(candle.c),
    volume: parseFloat(candle.v),
    numTrades: candle.n,
  };
}

/**
 * Parse user state from Hyperliquid
 */
export function parseUserState(state: HLUserState): ParsedAccountSummary {
  const positions: ParsedPosition[] = state.assetPositions
    .filter((ap) => parseFloat(ap.position.szi) !== 0)
    .map((ap) => {
      const size = parseFloat(ap.position.szi);
      return {
        coin: ap.position.coin,
        size: Math.abs(size),
        side: size > 0 ? 'long' as const : 'short' as const,
        entryPrice: parseFloat(ap.position.entryPx),
        positionValue: parseFloat(ap.position.positionValue),
        unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
        leverage: ap.position.leverage.value,
      };
    });

  return {
    accountValue: parseFloat(state.marginSummary.accountValue),
    totalPosition: parseFloat(state.marginSummary.totalNtlPos),
    totalCash: parseFloat(state.marginSummary.totalRawUsd),
    marginUsed: parseFloat(state.marginSummary.totalMarginUsed),
    withdrawable: parseFloat(state.marginSummary.withdrawable),
    positions,
  };
}

/**
 * Calculate mid price from order book
 */
export function calculateMidPrice(book: ParsedOrderBook): number | null {
  const firstBid = book.bids[0];
  const firstAsk = book.asks[0];
  if (!firstBid || !firstAsk) {
    return null;
  }
  return (firstBid.price + firstAsk.price) / 2;
}

/**
 * Calculate spread from order book
 */
export function calculateSpread(book: ParsedOrderBook): number | null {
  const firstBid = book.bids[0];
  const firstAsk = book.asks[0];
  if (!firstBid || !firstAsk) {
    return null;
  }
  return firstAsk.price - firstBid.price;
}

/**
 * Calculate spread percentage
 */
export function calculateSpreadPercent(book: ParsedOrderBook): number | null {
  const mid = calculateMidPrice(book);
  const spread = calculateSpread(book);
  if (mid === null || spread === null || mid === 0) {
    return null;
  }
  return (spread / mid) * 100;
}

/**
 * Aggregate trades into OHLCV candle
 */
export function aggregateTrades(trades: ParsedTrade[], intervalMs: number): ParsedCandle | null {
  const firstTrade = trades[0];
  const lastTrade = trades[trades.length - 1];

  if (!firstTrade || !lastTrade) {
    return null;
  }

  let high = firstTrade.price;
  let low = firstTrade.price;
  let volume = 0;

  for (const trade of trades) {
    if (trade.price > high) high = trade.price;
    if (trade.price < low) low = trade.price;
    volume += trade.size;
  }

  return {
    coin: firstTrade.coin,
    interval: `${intervalMs}ms`,
    timestamp: Math.floor(firstTrade.time / intervalMs) * intervalMs,
    open: firstTrade.price,
    high,
    low,
    close: lastTrade.price,
    volume,
    numTrades: trades.length,
  };
}

