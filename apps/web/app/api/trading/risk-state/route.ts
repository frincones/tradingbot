/**
 * Risk State API
 * Returns current risk bumper state for the user
 */

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function GET() {
  try {
    const client = getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0] ?? '';

    const { data: riskState } = await client
      .from('risk_bumpers_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('trading_day', today)
      .single();

    // Default config values (could come from user settings in the future)
    const defaultConfig = {
      max_daily_loss_usd: 500,
      max_trades_per_day: 10,
      current_position_value: 0,
      max_position_value: 10000,
    };

    // Return defaults if no state exists
    if (!riskState) {
      return NextResponse.json({
        daily_loss_usd: 0,
        daily_trades_count: 0,
        cooldown_active: false,
        cooldown_until: null,
        kill_switch_active: false,
        kill_switch_reason: null,
        ...defaultConfig,
      });
    }

    // Check if cooldown is active (based on cooldown_until timestamp)
    const cooldownActive = riskState.cooldown_until
      ? new Date(riskState.cooldown_until) > new Date()
      : false;

    return NextResponse.json({
      daily_loss_usd: riskState.daily_loss_usd ?? 0,
      daily_trades_count: riskState.daily_trades_count ?? 0,
      cooldown_active: cooldownActive,
      cooldown_until: riskState.cooldown_until,
      kill_switch_active: riskState.kill_switch_active ?? false,
      kill_switch_reason: riskState.kill_switch_reason,
      ...defaultConfig,
    });
  } catch (error) {
    console.error('Error fetching risk state:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
