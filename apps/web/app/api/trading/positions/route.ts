/**
 * Trading Positions API
 * Position management and tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createAlpacaClient } from '@kit/integrations/alpaca';
import type { Database } from '@kit/supabase/database';

type OrderSide = Database['public']['Enums']['order_side'];

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const strategyId = searchParams.get('strategyId');
    const openOnly = searchParams.get('openOnly') === 'true';

    let query = client.from('positions').select('*').eq('user_id', user.id);

    if (strategyId) query = query.eq('strategy_id', strategyId);
    if (openOnly) query = query.eq('is_open', true);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.strategyId || !body.symbol) {
      return NextResponse.json(
        { error: 'strategyId and symbol are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('positions')
      .insert({
        user_id: user.id,
        strategy_id: body.strategyId,
        entry_intent_id: body.intentId || null,
        entry_order_id: body.orderId || null,
        symbol: body.symbol,
        side: (body.side || 'buy') as OrderSide,
        qty: body.quantity || 0,
        avg_entry_price: body.entryPrice || null,
        entry_at: body.entryAt || new Date().toISOString(),
        is_open: true,
        stop_loss_price: body.stopLoss || null,
        take_profit_price: body.takeProfit || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating position:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Position ID required' },
        { status: 400 }
      );
    }

    const { error } = await client
      .from('positions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating position:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Close position endpoint
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const positionId = searchParams.get('id');
    const symbol = searchParams.get('symbol');
    const closeReason = searchParams.get('reason') || 'manual';

    if (!positionId && !symbol) {
      return NextResponse.json(
        { error: 'Position ID or symbol required' },
        { status: 400 }
      );
    }

    // If symbol provided, close on Alpaca
    if (symbol) {
      try {
        const alpaca = createAlpacaClient(true);
        await alpaca.closePosition(symbol);
      } catch (closeError) {
        console.error('Failed to close on broker:', closeError);
      }
    }

    // Update position in database
    if (positionId) {
      const { error } = await client
        .from('positions')
        .update({
          is_open: false,
          closed_at: new Date().toISOString(),
          close_reason: closeReason,
        })
        .eq('id', positionId)
        .eq('user_id', user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error closing position:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
