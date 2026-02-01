/**
 * Paper Trading Stats API
 * GET: Retrieve user's paper trading statistics
 */

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// Note: Using 'any' for table references until Supabase types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function GET() {
  try {
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get stats from paper_trading_stats table
    const { data: stats, error: statsError } = await (client as AnyClient)
      .from('paper_trading_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (statsError && statsError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine
      console.error('Error fetching paper trading stats:', statsError);
      return NextResponse.json({ error: statsError.message }, { status: 500 });
    }

    // If no stats exist yet, return default values
    if (!stats) {
      return NextResponse.json({
        stats: {
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          win_rate: 0,
          total_pnl: 0,
          avg_win: 0,
          avg_loss: 0,
          profit_factor: 0,
          max_drawdown: 0,
          pattern_stats: {},
          current_streak: 0,
          best_streak: 0,
          worst_streak: 0,
        },
        open_positions: 0,
        recent_trades: [],
      });
    }

    // Get count of open positions
    const { count: openCount } = await (client as AnyClient)
      .from('paper_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'open');

    // Get recent closed trades for context
    const { data: recentTrades } = await (client as AnyClient)
      .from('paper_orders')
      .select('id, symbol, side, entry_price, exit_price, realized_pnl, realized_pnl_pct, status, pattern_type, created_at, exit_time')
      .eq('user_id', user.id)
      .neq('status', 'open')
      .order('exit_time', { ascending: false })
      .limit(10);

    // Calculate additional metrics
    const avgWin = stats.winning_trades > 0
      ? stats.total_pnl / stats.winning_trades
      : 0;

    const avgLoss = stats.losing_trades > 0
      ? Math.abs(stats.total_pnl) / stats.losing_trades
      : 0;

    const profitFactor = avgLoss > 0
      ? avgWin / avgLoss
      : avgWin > 0 ? Infinity : 0;

    return NextResponse.json({
      stats: {
        ...stats,
        avg_win: avgWin,
        avg_loss: avgLoss,
        profit_factor: profitFactor,
      },
      open_positions: openCount || 0,
      recent_trades: recentTrades || [],
    });
  } catch (error) {
    console.error('Error fetching paper trading stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
