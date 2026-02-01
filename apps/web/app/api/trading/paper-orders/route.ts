/**
 * Paper Orders API
 * GET: List paper orders for user
 * POST: Create new paper order (from alert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// Note: Using 'any' for table references until Supabase types are regenerated
// Run `supabase gen types typescript` after applying migrations to fix

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'open' | 'closed' | 'all'
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client as any)
      .from('paper_orders')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'open') {
      query = query.eq('status', 'open');
    } else if (status === 'closed') {
      query = query.neq('status', 'open');
    }

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    const { data: orders, error, count } = await query;

    if (error) {
      console.error('Error fetching paper orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      orders: orders || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error('Error in paper orders GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // If alert_id is provided, fetch alert details to create the order
    if (body.alert_id && !body.symbol) {
      const { data: alert, error: alertError } = await client
        .from('agent_alerts')
        .select('*')
        .eq('id', body.alert_id)
        .eq('user_id', user.id)
        .single();

      if (alertError || !alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executionJson = alert.execution_json as any;
      if (!executionJson) {
        return NextResponse.json({ error: 'Alert has no execution data' }, { status: 400 });
      }

      // Get entry price from execution_json
      const entryPrice = executionJson.entry_zone?.ideal ||
        (executionJson.entry_zone?.min + executionJson.entry_zone?.max) / 2;

      // Get stop loss price (handle both number and object format)
      const stopLossPrice = typeof executionJson.stop_loss === 'object'
        ? executionJson.stop_loss.price
        : executionJson.stop_loss;

      // Build the order from alert data
      body.symbol = alert.symbol;
      body.side = alert.setup;
      body.entry_price = entryPrice;
      body.size_usd = body.size_usd || 100; // Default $100 if not specified
      body.stop_loss = stopLossPrice;
      body.take_profit = executionJson.take_profit;
      body.take_profit_targets = executionJson.take_profit_targets;
      body.agent_confidence = alert.confidence;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body.pattern_type = (alert.pattern_json as any)?.type;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body.thesis_title = (alert.thesis_json as any)?.title;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body.thesis_reasoning = (alert.thesis_json as any)?.reasoning;
    }

    // Validate required fields
    if (!body.symbol || !body.side || !body.entry_price || !body.size_usd) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, side, entry_price, size_usd' },
        { status: 400 }
      );
    }

    // Calculate unrealized PnL (starts at 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: order, error } = await (client as any)
      .from('paper_orders')
      .insert({
        user_id: user.id,
        alert_id: body.alert_id || null,
        symbol: body.symbol,
        side: body.side,
        entry_price: body.entry_price,
        entry_time: new Date().toISOString(),
        size_usd: body.size_usd,
        stop_loss: body.stop_loss || null,
        take_profit: body.take_profit || null,
        take_profit_targets: body.take_profit_targets || null,
        status: 'open',
        current_price: body.entry_price,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        agent_confidence: body.agent_confidence || null,
        pattern_type: body.pattern_type || null,
        thesis_title: body.thesis_title || null,
        thesis_reasoning: body.thesis_reasoning || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating paper order:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If this order came from an alert, mark the alert as actioned
    if (body.alert_id) {
      await client
        .from('agent_alerts')
        .update({
          status: 'actioned',
          actioned_at: new Date().toISOString(),
          action_taken: 'paper_trade',
        })
        .eq('id', body.alert_id);
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('Error in paper orders POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
