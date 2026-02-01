/**
 * Trading Account API
 * Alpaca account information and status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createAlpacaClient, AlpacaClient } from '@kit/integrations/alpaca';

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const paper = searchParams.get('paper') !== 'false';
    const dataType = searchParams.get('type') || 'account';

    const alpaca = createAlpacaClient(paper);

    switch (dataType) {
      case 'account': {
        const account = await alpaca.getAccount();
        return NextResponse.json({
          id: account.id,
          status: account.status,
          currency: account.currency,
          buyingPower: parseFloat(account.buying_power),
          cash: parseFloat(account.cash),
          portfolioValue: parseFloat(account.portfolio_value),
          equity: parseFloat(account.equity),
          longMarketValue: parseFloat(account.long_market_value),
          shortMarketValue: parseFloat(account.short_market_value),
          initialMargin: parseFloat(account.initial_margin),
          maintenanceMargin: parseFloat(account.maintenance_margin),
          patternDayTrader: account.pattern_day_trader,
          tradingBlocked: account.trading_blocked,
          transfersBlocked: account.transfers_blocked,
          accountBlocked: account.account_blocked,
          cryptoStatus: account.crypto_status,
          daytradeCount: account.daytrade_count,
          multiplier: account.multiplier,
          shortingEnabled: account.shorting_enabled,
          isPaper: paper,
        });
      }

      case 'positions': {
        const positions = await alpaca.getPositions();
        return NextResponse.json(
          positions.map((pos) => AlpacaClient.parsePosition(pos))
        );
      }

      case 'orders': {
        const status = searchParams.get('status') as 'open' | 'closed' | 'all' | undefined;
        const orders = await alpaca.getOrders({ status: status || 'all', limit: 100 });
        return NextResponse.json(
          orders.map((order) => AlpacaClient.parseOrder(order))
        );
      }

      case 'buying-power': {
        const buyingPower = await alpaca.getBuyingPower();
        return NextResponse.json({ buyingPower });
      }

      case 'is-active': {
        const isActive = await alpaca.isAccountActive();
        return NextResponse.json({ isActive });
      }

      default:
        return NextResponse.json(
          { error: `Unknown data type: ${dataType}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error fetching account data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
