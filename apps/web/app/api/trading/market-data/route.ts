/**
 * Market Data API
 * Hyperliquid and Alpaca market data access
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createHyperliquidInfo } from '@kit/integrations/hyperliquid';
import { createAlpacaClient } from '@kit/integrations/alpaca';

// Map interval format for Alpaca
const ALPACA_TIMEFRAMES: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '4h': '4Hour',
  '1d': '1Day',
};

// Map symbol format for Alpaca crypto
function toAlpacaSymbol(coin: string): string {
  // BTC -> BTC/USD
  if (!coin.includes('/')) {
    return `${coin}/USD`;
  }
  return coin;
}

// Calculate start time based on interval for reasonable data range
function getStartTimeForInterval(interval: string): Date {
  const now = new Date();
  const hours: Record<string, number> = {
    '1m': 6,      // 6 hours
    '5m': 24,     // 1 day
    '15m': 48,    // 2 days
    '30m': 72,    // 3 days
    '1h': 168,    // 7 days
    '4h': 336,    // 14 days
    '1d': 720,    // 30 days
  };
  const hoursBack = hours[interval] || 168;
  return new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
}

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dataType = searchParams.get('type');
    const coin = searchParams.get('coin');
    const source = searchParams.get('source') || 'hyperliquid'; // 'hyperliquid' or 'alpaca'

    const hlInfo = createHyperliquidInfo();

    switch (dataType) {
      case 'meta': {
        const meta = await hlInfo.getMeta();
        return NextResponse.json(meta);
      }

      case 'mids': {
        const mids = await hlInfo.getAllMids();
        return NextResponse.json(mids);
      }

      case 'orderbook': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for orderbook' },
            { status: 400 }
          );
        }
        const orderbook = await hlInfo.getOrderBook(coin);
        return NextResponse.json(orderbook);
      }

      case 'funding': {
        const funding = await hlInfo.getFundingRates();
        return NextResponse.json(funding);
      }

      case 'trades': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for trades' },
            { status: 400 }
          );
        }
        const trades = await hlInfo.getRecentTrades(coin);
        return NextResponse.json(trades);
      }

      case 'candles': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for candles' },
            { status: 400 }
          );
        }
        const interval = searchParams.get('interval') || '1h';
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');

        // Use Alpaca for candles if requested
        if (source === 'alpaca') {
          try {
            const alpaca = createAlpacaClient(true);
            const alpacaTimeframe = ALPACA_TIMEFRAMES[interval] || '1Hour';
            const alpacaSymbol = toAlpacaSymbol(coin);
            const start = startTime ? new Date(parseInt(startTime, 10)) : getStartTimeForInterval(interval);
            const end = endTime ? new Date(parseInt(endTime, 10)) : new Date();

            const bars = await alpaca.getCryptoBars(
              alpacaSymbol,
              alpacaTimeframe,
              start,
              end,
              300
            );

            // Transform to common format (same as Hyperliquid)
            const candles = bars.map((bar) => ({
              t: new Date(bar.t).getTime(),
              o: bar.o,
              h: bar.h,
              l: bar.l,
              c: bar.c,
              v: bar.v,
            }));

            return NextResponse.json(candles);
          } catch (alpacaError) {
            console.error('Alpaca candles error, falling back to Hyperliquid:', alpacaError);
            // Fall back to Hyperliquid
          }
        }

        // Default: Use Hyperliquid
        const candles = await hlInfo.getCandles(
          coin,
          interval,
          startTime ? parseInt(startTime, 10) : Date.now() - 24 * 60 * 60 * 1000,
          endTime ? parseInt(endTime, 10) : undefined
        );
        return NextResponse.json(candles);
      }

      case 'quote': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for quote' },
            { status: 400 }
          );
        }

        if (source === 'alpaca') {
          try {
            const alpaca = createAlpacaClient(true);
            const quote = await alpaca.getLatestCryptoQuote(toAlpacaSymbol(coin));
            return NextResponse.json(quote);
          } catch (alpacaError) {
            console.error('Alpaca quote error:', alpacaError);
          }
        }

        // Use Hyperliquid mid price as fallback
        const mids = await hlInfo.getAllMids();
        const mid = mids[coin];
        if (mid) {
          return NextResponse.json({ mid: parseFloat(mid), bid: null, ask: null });
        }
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }

      case 'spot-meta': {
        const spotMeta = await hlInfo.getSpotMeta();
        return NextResponse.json(spotMeta);
      }

      // =====================================
      // Advanced Market Data Endpoints
      // =====================================

      case 'asset-contexts': {
        // Full market data: mark price, oracle, funding, OI, 24h volume, impact prices
        const assetCtxs = await hlInfo.getParsedAssetCtxs();
        return NextResponse.json(assetCtxs);
      }

      case 'all-stats': {
        // All coins with full stats including max leverage
        try {
          const allStats = await hlInfo.getAllCoinStats();
          console.log(`[market-data] all-stats returned ${allStats?.length || 0} items`);
          return NextResponse.json(allStats);
        } catch (statsError) {
          console.error('[market-data] all-stats error:', statsError);
          return NextResponse.json(
            { error: statsError instanceof Error ? statsError.message : 'Failed to fetch stats' },
            { status: 500 }
          );
        }
      }

      case 'predicted-fundings': {
        // Predicted funding rates compared to other exchanges
        const predictions = await hlInfo.getPredictedFundings();
        return NextResponse.json(predictions);
      }

      case 'funding-history': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for funding history' },
            { status: 400 }
          );
        }
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');

        const history = await hlInfo.getFundingHistory(
          coin,
          startTime ? parseInt(startTime, 10) : Date.now() - 7 * 24 * 60 * 60 * 1000, // Default 7 days
          endTime ? parseInt(endTime, 10) : undefined
        );
        return NextResponse.json(history);
      }

      case 'whale-trades': {
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required for whale trades' },
            { status: 400 }
          );
        }
        const threshold = searchParams.get('threshold');
        const whaleThreshold = threshold ? parseInt(threshold, 10) : 100000; // Default $100k

        try {
          const whaleTrades = await hlInfo.getRecentTradesWithWhaleDetection(coin, whaleThreshold);
          return NextResponse.json(whaleTrades);
        } catch (whaleError) {
          // Some coins may not be supported by Hyperliquid API
          console.warn(`[market-data] whale-trades error for ${coin}:`, whaleError instanceof Error ? whaleError.message : whaleError);
          return NextResponse.json([]); // Return empty array instead of error
        }
      }

      case 'all-trades': {
        // Get all recent trades without filtering (for debugging)
        if (!coin) {
          return NextResponse.json(
            { error: 'Coin parameter required' },
            { status: 400 }
          );
        }
        const allTrades = await hlInfo.getAllRecentTrades(coin);
        return NextResponse.json(allTrades);
      }

      case 'wallet': {
        // Get comprehensive wallet details
        const walletAddress = searchParams.get('address');
        if (!walletAddress) {
          return NextResponse.json(
            { error: 'Wallet address required' },
            { status: 400 }
          );
        }

        const walletDetails = await hlInfo.getWalletDetails(walletAddress);
        return NextResponse.json(walletDetails);
      }

      case 'user-fills': {
        // Get user trade history with detailed info
        const walletAddress = searchParams.get('address');
        if (!walletAddress) {
          return NextResponse.json(
            { error: 'Wallet address required' },
            { status: 400 }
          );
        }
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');

        const fills = startTime
          ? await hlInfo.getUserFillsByTime(
              walletAddress,
              parseInt(startTime, 10),
              endTime ? parseInt(endTime, 10) : undefined
            )
          : await hlInfo.getUserFillsDetailed(walletAddress);

        return NextResponse.json(fills);
      }

      case 'user-ledger': {
        // Get user non-funding ledger updates (liquidations, deposits, withdrawals)
        const walletAddress = searchParams.get('address');
        if (!walletAddress) {
          return NextResponse.json(
            { error: 'Wallet address required' },
            { status: 400 }
          );
        }
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');

        const ledger = await hlInfo.getUserNonFundingLedgerUpdates(
          walletAddress,
          startTime ? parseInt(startTime, 10) : Date.now() - 30 * 24 * 60 * 60 * 1000, // Default 30 days
          endTime ? parseInt(endTime, 10) : undefined
        );
        return NextResponse.json(ledger);
      }

      default: {
        // Return all mids as default
        const mids = await hlInfo.getAllMids();
        return NextResponse.json(mids);
      }
    }
  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
