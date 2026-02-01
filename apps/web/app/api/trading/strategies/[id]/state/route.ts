/**
 * Strategy State API
 * State machine transitions for strategies
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { updateStrategyState } from '@kit/supabase/trading';
import type { Database } from '@kit/supabase/database';

type StrategyState = Database['public']['Enums']['strategy_state'];

const VALID_TRANSITIONS: Record<StrategyState, StrategyState[]> = {
  IDLE: ['SETUP'],
  SETUP: ['TRIGGERED', 'IDLE'],
  TRIGGERED: ['ORDERING', 'IDLE'],
  ORDERING: ['IN_POSITION', 'IDLE'],
  IN_POSITION: ['EXITING'],
  EXITING: ['COOLDOWN', 'IN_POSITION'],
  COOLDOWN: ['IDLE'],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: strategyId } = await params;
    const body = await request.json();
    const { newState, metadata } = body;

    if (!newState) {
      return NextResponse.json(
        { error: 'New state is required' },
        { status: 400 }
      );
    }

    // Get current strategy state
    const { data: strategy, error: fetchError } = await client
      .from('strategies')
      .select('current_state')
      .eq('id', strategyId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const currentState = strategy.current_state as StrategyState;
    const validNextStates = VALID_TRANSITIONS[currentState] || [];

    if (!validNextStates.includes(newState as StrategyState)) {
      return NextResponse.json(
        {
          error: `Invalid state transition from ${currentState} to ${newState}`,
          validTransitions: validNextStates,
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await updateStrategyState(
      client,
      strategyId,
      newState as StrategyState,
      metadata
    );

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      previousState: currentState,
      newState,
    });
  } catch (error) {
    console.error('Error updating strategy state:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
