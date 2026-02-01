/**
 * Alerts API
 * CRUD operations for AI-generated trading alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';

type AlertStatus = Database['public']['Enums']['alert_status'];

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // comma-separated: new,viewed
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = client
      .from('agent_alerts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('ts', { ascending: false });

    // Filter by status (comma-separated)
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()) as AlertStatus[];
      query = query.in('status', statuses);
    }

    // Filter by symbol
    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      alerts: data || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error('Error in alerts GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create alert (mainly for internal/testing use)
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const { data, error } = await client
      .from('agent_alerts')
      .insert({
        user_id: user.id,
        strategy_id: body.strategy_id || null,
        symbol: body.symbol,
        decision: body.decision,
        setup: body.setup,
        pattern_json: body.pattern_json,
        thesis_json: body.thesis_json,
        execution_json: body.execution_json || null,
        confidence: body.confidence,
        recommendation: body.recommendation,
        risk_notes: body.risk_notes || [],
        expires_at: body.expires_at || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating alert:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ alert: data }, { status: 201 });
  } catch (error) {
    console.error('Error in alerts POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
