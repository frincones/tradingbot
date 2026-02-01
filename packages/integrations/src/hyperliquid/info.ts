/**
 * Hyperliquid Info API Client
 * REST API for market data and user info
 */

import type {
  HLMeta,
  HLUserState,
  HLFundingRate,
  HLMetaAndAssetCtxs,
  HLAssetCtx,
  HLPredictedFunding,
  HLFundingHistory,
  HLUserFill,
  HLOrder,
  HLTrade,
  ParsedAccountSummary,
  ParsedOrderBook,
  ParsedAssetCtx,
  ParsedWhaleTrade,
} from './types';
import { parseUserState, parseOrderBook } from './parsers';

const INFO_API_URL = 'https://api.hyperliquid.xyz/info';

export interface HLInfoConfig {
  baseUrl?: string;
}

export class HyperliquidInfo {
  private baseUrl: string;

  constructor(config: HLInfoConfig = {}) {
    this.baseUrl = config.baseUrl || INFO_API_URL;
  }

  /**
   * Make a POST request to the info API
   */
  private async post<T>(type: string, payload: object = {}): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get metadata about available assets
   */
  async getMeta(): Promise<HLMeta> {
    return this.post<HLMeta>('meta');
  }

  /**
   * Get user state (positions, balances)
   */
  async getUserState(user: string): Promise<ParsedAccountSummary> {
    const state = await this.post<HLUserState>('clearinghouseState', { user });
    return parseUserState(state);
  }

  /**
   * Get raw user state
   */
  async getRawUserState(user: string): Promise<HLUserState> {
    return this.post<HLUserState>('clearinghouseState', { user });
  }

  /**
   * Get L2 order book for a coin
   */
  async getOrderBook(coin: string): Promise<ParsedOrderBook> {
    const book = await this.post<unknown>('l2Book', { coin });
    return parseOrderBook(book);
  }

  /**
   * Get all mid prices
   */
  async getAllMids(): Promise<Record<string, string>> {
    return this.post<Record<string, string>>('allMids');
  }

  /**
   * Get funding rates
   */
  async getFundingRates(): Promise<HLFundingRate[]> {
    return this.post<HLFundingRate[]>('fundingRates');
  }

  /**
   * Get open orders for a user
   */
  async getOpenOrders(user: string): Promise<unknown[]> {
    return this.post<unknown[]>('openOrders', { user });
  }

  /**
   * Get user fills (trade history)
   */
  async getUserFills(user: string): Promise<unknown[]> {
    return this.post<unknown[]>('userFills', { user });
  }

  /**
   * Get recent trades for a coin
   */
  async getRecentTrades(coin: string): Promise<unknown[]> {
    return this.post<unknown[]>('recentTrades', { coin });
  }

  /**
   * Get candles for a coin
   * Hyperliquid expects: { "type": "candleSnapshot", "req": { "coin": "BTC", "interval": "1h", "startTime": 0, "endTime": ... } }
   */
  async getCandles(
    coin: string,
    interval: string,
    startTime: number,
    endTime?: number
  ): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> {
    // The candleSnapshot type requires a nested "req" object
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
          interval,
          startTime,
          endTime: endTime || Date.now(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid candles API error: ${response.status}`);
    }

    const data = await response.json() as Array<{
      t: number;
      T: number;
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      n: number;
    }>;

    // Transform to consistent format
    return data.map((candle) => ({
      t: candle.t,
      o: parseFloat(candle.o),
      h: parseFloat(candle.h),
      l: parseFloat(candle.l),
      c: parseFloat(candle.c),
      v: parseFloat(candle.v),
    }));
  }

  /**
   * Get spot metadata
   */
  async getSpotMeta(): Promise<unknown> {
    return this.post<unknown>('spotMeta');
  }

  /**
   * Get spot user state
   */
  async getSpotUserState(user: string): Promise<unknown> {
    return this.post<unknown>('spotClearinghouseState', { user });
  }

  // =====================================
  // Advanced Market Data Endpoints
  // =====================================

  /**
   * Get meta data AND asset contexts (mark price, oracle, funding, OI, volume, impact prices)
   * This is the most comprehensive market data endpoint
   */
  async getMetaAndAssetCtxs(): Promise<HLMetaAndAssetCtxs> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    const data = await response.json();
    // Response is [meta, [assetCtx1, assetCtx2, ...]]
    const [meta, assetCtxs] = data;

    // Map asset contexts to include coin names from meta
    const mappedCtxs: HLAssetCtx[] = assetCtxs.map((ctx: Record<string, unknown>, idx: number) => ({
      coin: meta.universe[idx]?.name || `UNKNOWN_${idx}`,
      markPx: ctx.markPx as string || '0',
      oraclePx: ctx.oraclePx as string || '0',
      funding: ctx.funding as string || '0',
      openInterest: ctx.openInterest as string || '0',
      dayNtlVlm: ctx.dayNtlVlm as string || '0',
      impactPxs: ctx.impactPxs as [string, string] || ['0', '0'],
      prevDayPx: ctx.prevDayPx as string || '0',
      premium: ctx.premium as string || '0',
    }));

    return { meta, assetCtxs: mappedCtxs };
  }

  /**
   * Get parsed asset contexts with computed values
   */
  async getParsedAssetCtxs(): Promise<ParsedAssetCtx[]> {
    const { meta, assetCtxs } = await this.getMetaAndAssetCtxs();

    return assetCtxs.map((ctx, idx) => {
      const markPrice = parseFloat(ctx.markPx);
      const prevDayPrice = parseFloat(ctx.prevDayPx);
      const priceChange24h = markPrice - prevDayPrice;
      const priceChangePct24h = prevDayPrice > 0 ? (priceChange24h / prevDayPrice) * 100 : 0;
      const funding = parseFloat(ctx.funding);

      return {
        coin: meta.universe[idx]?.name || ctx.coin,
        markPrice,
        oraclePrice: parseFloat(ctx.oraclePx),
        funding,
        fundingAnnualized: funding * 3 * 365 * 100, // Funding is per 8h, annualized as %
        openInterest: parseFloat(ctx.openInterest),
        volume24h: parseFloat(ctx.dayNtlVlm),
        impactBidPrice: parseFloat(ctx.impactPxs[0]),
        impactAskPrice: parseFloat(ctx.impactPxs[1]),
        prevDayPrice,
        priceChange24h,
        priceChangePct24h,
        premium: parseFloat(ctx.premium),
      };
    });
  }

  /**
   * Get predicted funding rates (compared with other exchanges)
   */
  async getPredictedFundings(): Promise<HLPredictedFunding[]> {
    const data = await this.post<unknown[]>('predictedFundings');
    return data as HLPredictedFunding[];
  }

  /**
   * Get funding history for a specific coin
   * @param coin The coin symbol (e.g., 'BTC')
   * @param startTime Start timestamp in ms
   * @param endTime End timestamp in ms (optional, defaults to now)
   */
  async getFundingHistory(
    coin: string,
    startTime: number,
    endTime?: number
  ): Promise<HLFundingHistory[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'fundingHistory',
        coin,
        startTime,
        endTime: endTime || Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get user fills (detailed trade history) with leverage info
   * @param user Wallet address
   * @param aggregateByTime Whether to aggregate fills (optional)
   */
  async getUserFillsDetailed(user: string, aggregateByTime?: boolean): Promise<HLUserFill[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFills',
        user,
        aggregateByTime: aggregateByTime ?? false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get user fills by time range
   */
  async getUserFillsByTime(
    user: string,
    startTime: number,
    endTime?: number
  ): Promise<HLUserFill[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFillsByTime',
        user,
        startTime,
        endTime: endTime || Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get front-end open orders (more details than openOrders)
   */
  async getFrontendOpenOrders(user: string): Promise<HLOrder[]> {
    const data = await this.post<HLOrder[]>('frontendOpenOrders', { user });
    return data;
  }

  /**
   * Get user rate limits
   */
  async getUserRateLimits(user: string): Promise<{ cumVlm: string; nRequestsUsed: number; nRequestsCap: number }> {
    return this.post('userRateLimit', { user });
  }

  // =====================================
  // Whale and Large Trade Tracking
  // =====================================

  /**
   * Get recent trades with whale detection
   * Trades over threshold USD are marked as whale trades
   * @param coin The coin symbol
   * @param whaleThresholdUsd Minimum notional to consider a whale trade (default $100k)
   */
  async getRecentTradesWithWhaleDetection(
    coin: string,
    whaleThresholdUsd: number = 100000
  ): Promise<ParsedWhaleTrade[]> {
    const trades = await this.post<HLTrade[]>('recentTrades', { coin });

    // Parse all trades and include notionalUsd
    const parsedTrades = trades.map((trade) => {
      const price = parseFloat(trade.px);
      const size = parseFloat(trade.sz);
      const notionalUsd = price * size;

      return {
        coin: trade.coin || coin, // recentTrades response might not include coin
        side: trade.side === 'B' ? 'buy' as const : 'sell' as const,
        price,
        size,
        notionalUsd,
        hash: trade.hash,
        time: trade.time,
        tid: 0, // Not available in this endpoint
      };
    });

    // Filter by threshold and sort by notional (largest first)
    return parsedTrades
      .filter((trade) => trade.notionalUsd >= whaleThresholdUsd)
      .sort((a, b) => b.notionalUsd - a.notionalUsd);
  }

  /**
   * Get ALL recent trades for a coin (no filtering)
   * Useful for analysis and debugging
   */
  async getAllRecentTrades(coin: string): Promise<ParsedWhaleTrade[]> {
    const trades = await this.post<HLTrade[]>('recentTrades', { coin });

    return trades.map((trade) => {
      const price = parseFloat(trade.px);
      const size = parseFloat(trade.sz);
      const notionalUsd = price * size;

      return {
        coin: trade.coin || coin,
        side: trade.side === 'B' ? 'buy' as const : 'sell' as const,
        price,
        size,
        notionalUsd,
        hash: trade.hash,
        time: trade.time,
        tid: 0,
      };
    }).sort((a, b) => b.time - a.time);
  }

  // =====================================
  // Liquidation Tracking
  // =====================================

  /**
   * Get user liquidation history
   * Note: Hyperliquid doesn't have a direct liquidation history endpoint,
   * but liquidations can be tracked via:
   * 1. WebSocket 'liquidation' events
   * 2. userNonFundingLedgerUpdates for the user's own liquidations
   */
  async getUserNonFundingLedgerUpdates(
    user: string,
    startTime: number,
    endTime?: number
  ): Promise<unknown[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userNonFundingLedgerUpdates',
        user,
        startTime,
        endTime: endTime || Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get comprehensive wallet details
   * Includes positions with leverage, margin info, and trading history
   */
  async getWalletDetails(user: string): Promise<{
    state: ParsedAccountSummary;
    orders: HLOrder[];
    fills: HLUserFill[];
    rateLimit: { cumVlm: string; nRequestsUsed: number; nRequestsCap: number };
  }> {
    // Fetch all wallet data in parallel
    const [rawState, orders, fills, rateLimit] = await Promise.all([
      this.getRawUserState(user),
      this.getFrontendOpenOrders(user).catch(() => [] as HLOrder[]),
      this.getUserFillsDetailed(user).catch(() => [] as HLUserFill[]),
      this.getUserRateLimits(user).catch(() => ({ cumVlm: '0', nRequestsUsed: 0, nRequestsCap: 1000 })),
    ]);

    return {
      state: parseUserState(rawState),
      orders,
      fills,
      rateLimit,
    };
  }

  // =====================================
  // Aggregated Market Data
  // =====================================

  /**
   * Get all coins with their full market stats
   * Combines meta, asset contexts, and funding rates
   */
  async getAllCoinStats(): Promise<Array<ParsedAssetCtx & {
    maxLeverage: number;
    onlyIsolated: boolean;
    szDecimals: number;
  }>> {
    const [assetCtxs, { meta }] = await Promise.all([
      this.getParsedAssetCtxs(),
      this.getMetaAndAssetCtxs(),
    ]);

    return assetCtxs.map((ctx, idx) => ({
      ...ctx,
      maxLeverage: meta.universe[idx]?.maxLeverage || 1,
      onlyIsolated: meta.universe[idx]?.onlyIsolated || false,
      szDecimals: meta.universe[idx]?.szDecimals || 0,
    }));
  }
}

/**
 * Create a default Hyperliquid info client
 */
export function createHyperliquidInfo(config?: HLInfoConfig): HyperliquidInfo {
  return new HyperliquidInfo(config);
}

