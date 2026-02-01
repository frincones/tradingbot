/**
 * Trading Signals API
 * Signal management and retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';

type SetupType = Database['public']['Enums']['setup_type'];

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const strategyId = searchParams.get('strategyId');
    const setup = searchParams.get('setup') as SetupType | null;
    const limit = searchParams.get('limit');

    // Get user's strategies first to filter signals
    const { data: strategies } = await client
      .from('strategies')
      .select('id')
      .eq('user_id', user.id);

    if (!strategies || strategies.length === 0) {
      return NextResponse.json([]);
    }

    const strategyIds = strategies.map((s) => s.id);

    let query = client.from('signals').select('*');

    if (strategyId) {
      // Verify user owns this strategy
      if (!strategyIds.includes(strategyId)) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }
      query = query.eq('strategy_id', strategyId);
    } else {
      query = query.in('strategy_id', strategyIds);
    }

    if (setup) query = query.eq('setup', setup);

    query = query.order('ts', { ascending: false });

    if (limit) query = query.limit(parseInt(limit, 10));

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching signals:', error);
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

    if (!body.strategyId || !body.setup) {
      return NextResponse.json(
        { error: 'strategyId and setup are required' },
        { status: 400 }
      );
    }

    // Verify user owns this strategy
    const { data: strategy } = await client
      .from('strategies')
      .select('id')
      .eq('id', body.strategyId)
      .eq('user_id', user.id)
      .single();

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const { data, error } = await client
      .from('signals')
      .insert({
        strategy_id: body.strategyId,
        setup: body.setup as SetupType,
        scores_json: body.scores || {},
        levels_json: body.levels || {},
        confirmations_json: body.confirmations || {},
        raw_data_ref: body.rawDataRef || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating signal:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
