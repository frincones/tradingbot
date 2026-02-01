/**
 * Binance REST API Client
 * Handles authentication, order creation, and account management
 */

import crypto from 'crypto';
import type {
  BinanceConfig,
  BinanceAccount,
  BinanceOrder,
  CreateBinanceOrderParams,
  BinancePrice,
  Binance24hrTicker,
  BinanceBookTicker,
  BinanceApiError,
} from './types';

const TESTNET_BASE_URL = 'https://testnet.binance.vision';
const LIVE_BASE_URL = 'https://api.binance.com';

export class BinanceClient {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(config: BinanceConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || (config.testnet !== false ? TESTNET_BASE_URL : LIVE_BASE_URL);
  }

  /**
   * Generate HMAC SHA256 signature
   */
  private sign(queryString: string): string {
    return crypto.createHmac('sha256', this.secretKey).update(queryString).digest('hex');
  }

  /**
   * Make authenticated request to Binance API
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    params: Record<string, unknown> = {},
    signed = false
  ): Promise<T> {
    const timestamp = Date.now();
    const queryParams: Record<string, string> = {};

    // Convert all params to strings
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams[key] = String(value);
      }
    });

    if (signed) {
      queryParams.timestamp = timestamp.toString();
    }

    const query = new URLSearchParams(queryParams);

    if (signed) {
      const signature = this.sign(query.toString());
      query.append('signature', signature);
    }

    const url = `${this.baseUrl}${endpoint}?${query.toString()}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: BinanceApiError = await response.json();
      throw new Error(`Binance API error ${error.code}: ${error.msg}`);
    }

    return response.json();
  }

  // ============================================
  // Account
  // ============================================

  /**
   * Get account information
   */
  async getAccount(): Promise<BinanceAccount> {
    return this.request<BinanceAccount>('/api/v3/account', 'GET', {}, true);
  }

  /**
   * Check if account can trade
   */
  async canTrade(): Promise<boolean> {
    const account = await this.getAccount();
    return account.canTrade;
  }

  /**
   * Get balance for a specific asset
   */
  async getBalance(asset: string): Promise<{ free: number; locked: number; total: number }> {
    const account = await this.getAccount();
    const balance = account.balances.find((b) => b.asset === asset);

    if (!balance) {
      return { free: 0, locked: 0, total: 0 };
    }

    const free = parseFloat(balance.free);
    const locked = parseFloat(balance.locked);

    return {
      free,
      locked,
      total: free + locked,
    };
  }

  // ============================================
  // Orders
  // ============================================

  /**
   * Create a new order
   */
  async createOrder(params: CreateBinanceOrderParams): Promise<BinanceOrder> {
    return this.request<BinanceOrder>('/api/v3/order', 'POST', params, true);
  }

  /**
   * Create a market order
   */
  async createMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string): Promise<BinanceOrder> {
    return this.createOrder({
      symbol,
      side,
      type: 'MARKET',
      quantity,
    });
  }

  /**
   * Create a limit order
   */
  async createLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string
  ): Promise<BinanceOrder> {
    return this.createOrder({
      symbol,
      side,
      type: 'LIMIT',
      quantity,
      price,
      timeInForce: 'GTC',
    });
  }

  /**
   * Create a stop-loss limit order
   */
  async createStopLossLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    limitPrice: string
  ): Promise<BinanceOrder> {
    return this.createOrder({
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      quantity,
      stopPrice,
      price: limitPrice,
      timeInForce: 'GTC',
    });
  }

  /**
   * Get an order by ID
   */
  async getOrder(symbol: string, orderId: number): Promise<BinanceOrder> {
    return this.request<BinanceOrder>('/api/v3/order', 'GET', { symbol, orderId }, true);
  }

  /**
   * Get an order by client order ID
   */
  async getOrderByClientId(symbol: string, clientOrderId: string): Promise<BinanceOrder> {
    return this.request<BinanceOrder>('/api/v3/order', 'GET', { symbol, origClientOrderId: clientOrderId }, true);
  }

  /**
   * Get all open orders for a symbol
   */
  async getOpenOrders(symbol?: string): Promise<BinanceOrder[]> {
    const params = symbol ? { symbol } : {};
    return this.request<BinanceOrder[]>('/api/v3/openOrders', 'GET', params, true);
  }

  /**
   * Get all orders (open and closed) for a symbol
   */
  async getAllOrders(symbol: string, limit = 500): Promise<BinanceOrder[]> {
    return this.request<BinanceOrder[]>('/api/v3/allOrders', 'GET', { symbol, limit }, true);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: number): Promise<BinanceOrder> {
    return this.request<BinanceOrder>('/api/v3/order', 'DELETE', { symbol, orderId }, true);
  }

  /**
   * Cancel all open orders for a symbol
   */
  async cancelAllOrders(symbol: string): Promise<BinanceOrder[]> {
    return this.request<BinanceOrder[]>('/api/v3/openOrders', 'DELETE', { symbol }, true);
  }

  // ============================================
  // Market Data (No auth required)
  // ============================================

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<BinancePrice> {
    return this.request<BinancePrice>('/api/v3/ticker/price', 'GET', { symbol });
  }

  /**
   * Get 24hr ticker statistics
   */
  async get24hrTicker(symbol: string): Promise<Binance24hrTicker> {
    return this.request<Binance24hrTicker>('/api/v3/ticker/24hr', 'GET', { symbol });
  }

  /**
   * Get best bid/ask prices
   */
  async getBookTicker(symbol: string): Promise<BinanceBookTicker> {
    return this.request<BinanceBookTicker>('/api/v3/ticker/bookTicker', 'GET', { symbol });
  }

  /**
   * Get server time (for testing connectivity)
   */
  async getServerTime(): Promise<{ serverTime: number }> {
    return this.request<{ serverTime: number }>('/api/v3/time', 'GET');
  }

  /**
   * Test connectivity to the API
   */
  async ping(): Promise<object> {
    return this.request<object>('/api/v3/ping', 'GET');
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Calculate quantity based on USDT amount and current price
   */
  async calculateQuantity(symbol: string, usdtAmount: number, precision = 8): Promise<string> {
    const price = await this.getPrice(symbol);
    const qty = usdtAmount / parseFloat(price.price);
    return qty.toFixed(precision);
  }

  /**
   * Normalize symbol (remove /)
   */
  static normalizeSymbol(symbol: string): string {
    return symbol.replace('/', '').toUpperCase();
  }
}

/**
 * Create a Binance client from environment variables
 */
export function createBinanceClient(testnet = true): BinanceClient {
  const apiKey = testnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_LIVE_API_KEY;

  const secretKey = testnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_LIVE_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error(`Missing Binance ${testnet ? 'testnet' : 'live'} API credentials`);
  }

  return new BinanceClient({
    apiKey,
    secretKey,
    testnet,
  });
}
