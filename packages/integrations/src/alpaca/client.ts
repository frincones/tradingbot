/**
 * Alpaca Trading Client
 * REST API client for Alpaca Trading API
 */

import type {
  AlpacaConfig,
  AlpacaAccount,
  AlpacaOrder,
  AlpacaPosition,
  AlpacaAsset,
  AlpacaBar,
  CreateOrderParams,
  ParsedAlpacaOrder,
  ParsedAlpacaPosition,
} from './types';

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const LIVE_BASE_URL = 'https://api.alpaca.markets';
const DATA_BASE_URL = 'https://data.alpaca.markets';

export class AlpacaClient {
  private keyId: string;
  private secretKey: string;
  private baseUrl: string;
  private dataUrl: string;

  constructor(config: AlpacaConfig) {
    this.keyId = config.keyId;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || (config.paper !== false ? PAPER_BASE_URL : LIVE_BASE_URL);
    this.dataUrl = DATA_BASE_URL;
  }

  /**
   * Make authenticated request to Alpaca API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useDataApi = false
  ): Promise<T> {
    const baseUrl = useDataApi ? this.dataUrl : this.baseUrl;
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'APCA-API-KEY-ID': this.keyId,
        'APCA-API-SECRET-KEY': this.secretKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Alpaca API error: ${response.status} - ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ============================================
  // Account
  // ============================================

  /**
   * Get account information
   */
  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>('/v2/account');
  }

  /**
   * Check if account is active
   */
  async isAccountActive(): Promise<boolean> {
    const account = await this.getAccount();
    return account.status === 'ACTIVE' && !account.trading_blocked;
  }

  /**
   * Get buying power
   */
  async getBuyingPower(): Promise<number> {
    const account = await this.getAccount();
    return parseFloat(account.buying_power);
  }

  // ============================================
  // Orders
  // ============================================

  /**
   * Create a new order
   */
  async createOrder(params: CreateOrderParams): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Create a market order
   */
  async createMarketOrder(
    symbol: string,
    qty: number,
    side: 'buy' | 'sell'
  ): Promise<AlpacaOrder> {
    return this.createOrder({
      symbol,
      qty,
      side,
      type: 'market',
      time_in_force: 'gtc',
    });
  }

  /**
   * Create a limit order
   */
  async createLimitOrder(
    symbol: string,
    qty: number,
    side: 'buy' | 'sell',
    limitPrice: number
  ): Promise<AlpacaOrder> {
    return this.createOrder({
      symbol,
      qty,
      side,
      type: 'limit',
      time_in_force: 'gtc',
      limit_price: limitPrice,
    });
  }

  /**
   * Get an order by ID
   */
  async getOrder(orderId: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/orders/${orderId}`);
  }

  /**
   * Get an order by client order ID
   */
  async getOrderByClientId(clientOrderId: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/orders:by_client_order_id?client_order_id=${clientOrderId}`);
  }

  /**
   * Get all orders
   */
  async getOrders(params: {
    status?: 'open' | 'closed' | 'all';
    limit?: number;
    after?: string;
    until?: string;
    direction?: 'asc' | 'desc';
    symbols?: string;
  } = {}): Promise<AlpacaOrder[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.after) query.set('after', params.after);
    if (params.until) query.set('until', params.until);
    if (params.direction) query.set('direction', params.direction);
    if (params.symbols) query.set('symbols', params.symbols);

    return this.request<AlpacaOrder[]>(`/v2/orders?${query.toString()}`);
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<AlpacaOrder[]> {
    return this.getOrders({ status: 'open' });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.request<void>(`/v2/orders/${orderId}`, { method: 'DELETE' });
  }

  /**
   * Cancel all open orders
   */
  async cancelAllOrders(): Promise<void> {
    await this.request<void>('/v2/orders', { method: 'DELETE' });
  }

  // ============================================
  // Positions
  // ============================================

  /**
   * Get all positions
   */
  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>('/v2/positions');
  }

  /**
   * Get position for a symbol
   */
  async getPosition(symbol: string): Promise<AlpacaPosition> {
    return this.request<AlpacaPosition>(`/v2/positions/${symbol}`);
  }

  /**
   * Close all positions
   */
  async closeAllPositions(): Promise<void> {
    await this.request<void>('/v2/positions', { method: 'DELETE' });
  }

  /**
   * Close position for a symbol
   */
  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/positions/${symbol}`, { method: 'DELETE' });
  }

  // ============================================
  // Market Data (Bars/Candles)
  // ============================================

  /**
   * Get crypto bars (candles) from Alpaca Market Data API
   * @param symbol - Crypto symbol (e.g., 'BTC/USD', 'ETH/USD')
   * @param timeframe - Timeframe (e.g., '1Min', '5Min', '15Min', '1Hour', '1Day')
   * @param start - Start time (ISO string or Date)
   * @param end - End time (ISO string or Date)
   * @param limit - Max number of bars (default 100, max 10000)
   */
  async getCryptoBars(
    symbol: string,
    timeframe: string,
    start?: string | Date,
    end?: string | Date,
    limit = 300
  ): Promise<AlpacaBar[]> {
    const query = new URLSearchParams();
    query.set('symbols', symbol.replace('/', ''));
    query.set('timeframe', timeframe);
    if (start) query.set('start', typeof start === 'string' ? start : start.toISOString());
    if (end) query.set('end', typeof end === 'string' ? end : end.toISOString());
    query.set('limit', limit.toString());

    const response = await this.request<{ bars: Record<string, AlpacaBar[]> }>(
      `/v1beta3/crypto/us/bars?${query.toString()}`,
      {},
      true
    );

    const symbolKey = symbol.replace('/', '');
    return response.bars?.[symbolKey] || [];
  }

  /**
   * Get stock bars (candles) from Alpaca Market Data API
   */
  async getStockBars(
    symbol: string,
    timeframe: string,
    start?: string | Date,
    end?: string | Date,
    limit = 300
  ): Promise<AlpacaBar[]> {
    const query = new URLSearchParams();
    query.set('timeframe', timeframe);
    if (start) query.set('start', typeof start === 'string' ? start : start.toISOString());
    if (end) query.set('end', typeof end === 'string' ? end : end.toISOString());
    query.set('limit', limit.toString());

    const response = await this.request<{ bars: AlpacaBar[] }>(
      `/v2/stocks/${symbol}/bars?${query.toString()}`,
      {},
      true
    );

    return response.bars || [];
  }

  /**
   * Get latest crypto quote
   */
  async getLatestCryptoQuote(symbol: string): Promise<{ bid: number; ask: number; mid: number }> {
    const response = await this.request<{ quotes: Record<string, { bp: number; ap: number }> }>(
      `/v1beta3/crypto/us/latest/quotes?symbols=${symbol.replace('/', '')}`,
      {},
      true
    );

    const symbolKey = symbol.replace('/', '');
    const quote = response.quotes?.[symbolKey];

    if (!quote) {
      throw new Error(`No quote found for ${symbol}`);
    }

    return {
      bid: quote.bp,
      ask: quote.ap,
      mid: (quote.bp + quote.ap) / 2,
    };
  }

  // ============================================
  // Assets
  // ============================================

  /**
   * Get asset by symbol
   */
  async getAsset(symbol: string): Promise<AlpacaAsset> {
    return this.request<AlpacaAsset>(`/v2/assets/${symbol}`);
  }

  /**
   * Check if asset is tradable
   */
  async isAssetTradable(symbol: string): Promise<boolean> {
    try {
      const asset = await this.getAsset(symbol);
      return asset.tradable;
    } catch {
      return false;
    }
  }

  // ============================================
  // Parsing helpers
  // ============================================

  /**
   * Parse order to simpler format
   */
  static parseOrder(order: AlpacaOrder): ParsedAlpacaOrder {
    return {
      id: order.id,
      clientOrderId: order.client_order_id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: order.qty ? parseFloat(order.qty) : 0,
      filledQty: parseFloat(order.filled_qty),
      limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
      stopPrice: order.stop_price ? parseFloat(order.stop_price) : null,
      filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
      status: order.status,
      createdAt: order.created_at,
      submittedAt: order.submitted_at,
      filledAt: order.filled_at,
    };
  }

  /**
   * Parse position to simpler format
   */
  static parsePosition(position: AlpacaPosition): ParsedAlpacaPosition {
    return {
      symbol: position.symbol,
      side: position.side,
      qty: parseFloat(position.qty),
      avgEntryPrice: parseFloat(position.avg_entry_price),
      currentPrice: parseFloat(position.current_price),
      marketValue: parseFloat(position.market_value),
      unrealizedPnl: parseFloat(position.unrealized_pl),
      unrealizedPnlPercent: parseFloat(position.unrealized_plpc) * 100,
    };
  }
}

/**
 * Create an Alpaca client from environment variables
 */
export function createAlpacaClient(paper = true): AlpacaClient {
  const keyId = paper
    ? process.env.ALPACA_PAPER_KEY
    : process.env.ALPACA_LIVE_KEY;
  const secretKey = paper
    ? process.env.ALPACA_PAPER_SECRET
    : process.env.ALPACA_LIVE_SECRET;

  if (!keyId || !secretKey) {
    throw new Error(`Missing Alpaca ${paper ? 'paper' : 'live'} API credentials`);
  }

  return new AlpacaClient({
    keyId,
    secretKey,
    paper,
  });
}

