/**
 * Execute Approved Entry API
 * Executes a Binance order when Atlas approves an entry candidate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { executeTradeOnBinance } from '@kit/integrations/binance';

export const maxDuration = 30; // Allow time for Binance API call
export const preferredRegion = ['fra1']; // Frankfurt - Binance is geo-blocked in US regions

interface ExecuteEntryRequest {
  candidateId: string;
  symbol: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ExecuteEntryRequest;
    const { candidateId, symbol } = body;

    if (!candidateId || !symbol) {
      return NextResponse.json(
        { error: 'Missing candidateId or symbol' },
        { status: 400 }
      );
    }

    console.log('[Execute Entry] Processing approved entry:', candidateId);

    // Get Supabase client with user context
    const client = await getSupabaseServerClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ============================================================================
    // 1. FETCH ALERT DETAILS
    // ============================================================================

    const { data: alert, error: alertError } = await client
      .from('agent_alerts')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (alertError || !alert) {
      console.error('[Execute Entry] Alert not found:', candidateId);
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    console.log('[Execute Entry] Alert found:', {
      symbol: alert.symbol,
      setup: alert.setup,
      confidence: alert.confidence,
    });

    // ============================================================================
    // 2. EXTRACT ORDER PARAMETERS
    // ============================================================================

    const execution = alert.execution_json as Record<string, unknown> | null;

    // Determine side (LONG = BUY, SHORT = SELL)
    const setup = alert.setup as string;
    const side = setup === 'LONG' ? 'BUY' : 'SELL';

    // Get entry zone
    const entryZone = execution?.entry_zone as { min?: number; max?: number; ideal?: number } | undefined;
    const idealEntry = entryZone?.ideal || entryZone?.max || 0;

    // Get stop loss and take profit
    const stopLossData = execution?.stop_loss;
    const stopLoss = typeof stopLossData === 'object'
      ? (stopLossData as { price?: number }).price || 0
      : (stopLossData as number) || 0;

    const takeProfit = (execution?.take_profit as number) || 0;

    // Default position size: $50 USD (conservative for testnet)
    const sizeUsd = 50;

    console.log('[Execute Entry] Order parameters:', {
      symbol: `${symbol}/USDT`,
      side,
      sizeUsd,
      idealEntry,
      stopLoss,
      takeProfit,
    });

    // ============================================================================
    // 3. EXECUTE BINANCE ORDER
    // ============================================================================

    console.log('[Execute Entry] Calling executeTradeOnBinance...');

    const orderResult = await executeTradeOnBinance({
      symbol: `${symbol}/USDT`,
      side: side as 'BUY' | 'SELL',
      sizeUsd,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
    });

    console.log('[Execute Entry] Binance order executed:', {
      orderId: orderResult.entryOrder.orderId,
      status: orderResult.entryOrder.status,
      executedQty: orderResult.entryOrder.executedQty,
    });

    // ============================================================================
    // 4. GET OR CREATE STRATEGY
    // ============================================================================

    // Check if strategy exists for this user and symbol
    let strategyId: string;

    const { data: existingStrategy } = await client
      .from('strategies')
      .select('id')
      .eq('user_id', user.id)
      .eq('symbol', `${symbol}USDT`)
      .eq('name', 'Atlas Auto Trading')
      .single();

    if (existingStrategy) {
      strategyId = existingStrategy.id;
    } else {
      // Create new strategy
      const { data: newStrategy, error: strategyError } = await client
        .from('strategies')
        .insert({
          user_id: user.id,
          symbol: `${symbol}USDT`,
          name: 'Atlas Auto Trading',
          description: 'Automated trading based on Atlas Entry approvals',
          current_state: 'ORDERING',
        })
        .select('id')
        .single();

      if (strategyError || !newStrategy) {
        console.error('[Execute Entry] Failed to create strategy:', strategyError);
        return NextResponse.json(
          { error: 'Failed to create strategy' },
          { status: 500 }
        );
      }

      strategyId = newStrategy.id;
    }

    // ============================================================================
    // 5. SAVE ORDER TO DATABASE
    // ============================================================================

    const filledQty = parseFloat(orderResult.entryOrder.executedQty || '0');
    const quoteQty = parseFloat(orderResult.entryOrder.cummulativeQuoteQty || '0');
    const filledPrice = filledQty > 0 ? quoteQty / filledQty : 0;

    // Generate unique client order ID
    const clientOrderId = `atlas-${candidateId.slice(0, 8)}-${Date.now()}`;

    // Map Binance status to DB order_status enum
    const dbStatus = mapBinanceStatus(orderResult.entryOrder.status);

    const { data: savedOrder, error: saveError } = await client
      .from('orders')
      .insert({
        strategy_id: strategyId,
        client_order_id: clientOrderId,
        symbol: `${symbol}USDT`,
        side: side.toLowerCase() as 'buy' | 'sell',
        order_type: 'market',
        status: dbStatus,
        qty: filledQty || sizeUsd,
        filled_qty: filledQty > 0 ? filledQty : null,
        filled_avg_price: filledPrice > 0 ? filledPrice : null,
        broker: 'binance',
        binance_order_id: orderResult.entryOrder.orderId,
        binance_client_order_id: orderResult.entryOrder.clientOrderId,
        stop_price: stopLoss > 0 ? stopLoss : null,
        filled_at: filledQty > 0 ? new Date().toISOString() : null,
        alert_id: candidateId,
        is_paper: false,
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('[Execute Entry] Failed to save order:', saveError);
      return NextResponse.json(
        { error: 'Order executed but failed to save to database' },
        { status: 500 }
      );
    }

    console.log('[Execute Entry] Order saved to database:', savedOrder.id);

    // ============================================================================
    // 6. UPDATE ALERT STATUS
    // ============================================================================

    const { error: updateError } = await client
      .from('agent_alerts')
      .update({
        status: 'actioned' as const,
        actioned_at: new Date().toISOString(),
        action_taken: 'executed',
      })
      .eq('id', candidateId);

    if (updateError) {
      console.warn('[Execute Entry] Failed to update alert status:', updateError);
    }

    // ============================================================================
    // 7. RETURN SUCCESS
    // ============================================================================

    return NextResponse.json({
      success: true,
      order: {
        id: savedOrder.id,
        binanceOrderId: orderResult.entryOrder.orderId,
        symbol: `${symbol}USDT`,
        side,
        status: orderResult.entryOrder.status,
        executedQty: filledQty,
        avgPrice: filledPrice,
      },
    });
  } catch (error) {
    console.error('[Execute Entry] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Map Binance order status to DB order_status enum
 */
function mapBinanceStatus(binanceStatus: string): 'pending' | 'submitted' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired' {
  switch (binanceStatus) {
    case 'FILLED': return 'filled';
    case 'PARTIALLY_FILLED': return 'partially_filled';
    case 'NEW': return 'submitted';
    case 'CANCELED': return 'cancelled';
    case 'REJECTED': return 'rejected';
    case 'EXPIRED': return 'expired';
    default: return 'pending';
  }
}
