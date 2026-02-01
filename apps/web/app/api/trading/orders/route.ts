/**
 * Trading Orders API
 * Order management and execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createAlpacaClient, AlpacaClient } from '@kit/integrations/alpaca';
import type { Database, Json } from '@kit/supabase/database';

type OrderStatus = Database['public']['Enums']['order_status'];
type OrderSide = Database['public']['Enums']['order_side'];
type OrderType = Database['public']['Enums']['order_type'];
type TimeInForce = Database['public']['Enums']['time_in_force'];

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const intentId = searchParams.get('intentId');
    const strategyId = searchParams.get('strategyId');
    const status = searchParams.get('status') as OrderStatus | null;
    const limit = searchParams.get('limit');

    let query = client.from('orders').select('*');

    if (intentId) query = query.eq('intent_id', intentId);
    if (strategyId) query = query.eq('strategy_id', strategyId);
    if (status) query = query.eq('status', status);

    query = query.order('created_at', { ascending: false });

    if (limit) query = query.limit(parseInt(limit, 10));

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching orders:', error);
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

    // Validate required fields
    if (!body.strategyId || !body.intentId || !body.side || !body.quantity) {
      return NextResponse.json(
        { error: 'strategyId, intentId, side, and quantity are required' },
        { status: 400 }
      );
    }

    const clientOrderId = crypto.randomUUID();
    const isPaper = body.paper !== false;

    // Create order record in database first
    const { data: orderRecord, error: dbError } = await client
      .from('orders')
      .insert({
        client_order_id: clientOrderId,
        strategy_id: body.strategyId,
        intent_id: body.intentId,
        symbol: body.symbol || 'BTC/USD',
        side: body.side as OrderSide,
        order_type: (body.orderType || 'market') as OrderType,
        qty: body.quantity,
        limit_price: body.limitPrice || null,
        stop_price: body.stopPrice || null,
        time_in_force: (body.timeInForce || 'gtc') as TimeInForce,
        status: 'pending' as OrderStatus,
        is_paper: isPaper,
        raw_request: body,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    // Execute on Alpaca if requested
    if (body.execute !== false) {
      try {
        const alpaca = createAlpacaClient(isPaper);

        const alpacaOrder = await alpaca.createOrder({
          symbol: body.symbol || 'BTC/USD',
          qty: body.quantity,
          side: body.side,
          type: body.orderType || 'market',
          time_in_force: body.timeInForce || 'gtc',
          limit_price: body.limitPrice,
          client_order_id: clientOrderId,
        });

        // Update order with broker response
        await client
          .from('orders')
          .update({
            alpaca_order_id: alpacaOrder.id,
            status: 'submitted' as OrderStatus,
            submitted_at: new Date().toISOString(),
            raw_response: alpacaOrder as unknown as Json,
          })
          .eq('id', orderRecord.id);

        return NextResponse.json({
          ...orderRecord,
          alpaca_order_id: alpacaOrder.id,
          status: 'submitted',
        }, { status: 201 });
      } catch (execError) {
        // Update order as rejected
        await client
          .from('orders')
          .update({
            status: 'rejected' as OrderStatus,
            raw_response: {
              error: execError instanceof Error ? execError.message : 'Execution failed',
            } as Json,
          })
          .eq('id', orderRecord.id);

        return NextResponse.json(
          { error: 'Order execution failed', details: execError instanceof Error ? execError.message : 'Unknown error' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(orderRecord, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    // Get order to find alpaca_order_id
    const { data: order, error: fetchError } = await client
      .from('orders')
      .select('alpaca_order_id, status, is_paper')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Cancel on Alpaca if has broker order
    if (order.alpaca_order_id && order.status !== 'filled' && order.status !== 'cancelled') {
      try {
        const alpaca = createAlpacaClient(order.is_paper);
        await alpaca.cancelOrder(order.alpaca_order_id);
      } catch (cancelError) {
        console.error('Failed to cancel on broker:', cancelError);
      }
    }

    // Update order status
    await client
      .from('orders')
      .update({
        status: 'cancelled' as OrderStatus,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
