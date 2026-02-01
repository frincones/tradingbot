/**
 * Close Paper Order API
 * POST: Close an open paper order
 */

// Vercel Serverless Function Configuration
export const maxDuration = 30; // seconds

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { ClosePaperOrderInput, PaperOrderStatus } from '@kit/trading-core';

// Note: Using 'any' for table references until Supabase types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const client = getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ClosePaperOrderInput = await request.json();

    if (!body.exit_price || !body.exit_reason) {
      return NextResponse.json(
        { error: 'Missing required fields: exit_price, exit_reason' },
        { status: 400 }
      );
    }

    // Get the current order
    const { data: order, error: fetchError } = await (client as AnyClient)
      .from('paper_orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'open') {
      return NextResponse.json({ error: 'Order is already closed' }, { status: 400 });
    }

    // Calculate P&L
    const entryPrice = parseFloat(order.entry_price);
    const exitPrice = body.exit_price;
    const sizeUsd = parseFloat(order.size_usd);

    let pnlPct: number;
    if (order.side === 'LONG') {
      pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      pnlPct = ((entryPrice - exitPrice) / entryPrice) * 100;
    }
    const pnlUsd = (pnlPct / 100) * sizeUsd;

    // Determine status based on exit reason
    let status: PaperOrderStatus;
    switch (body.exit_reason) {
      case 'take_profit':
      case 'tp1':
      case 'tp2':
      case 'tp3':
        status = 'closed_tp';
        break;
      case 'stop_loss':
        status = 'closed_sl';
        break;
      case 'expired':
        status = 'expired';
        break;
      default:
        status = 'closed_manual';
    }

    // Update the order
    const { data: updatedOrder, error: updateError } = await (client as AnyClient)
      .from('paper_orders')
      .update({
        status,
        exit_price: exitPrice,
        exit_time: new Date().toISOString(),
        realized_pnl: pnlUsd,
        realized_pnl_pct: pnlPct,
        exit_reason: body.exit_reason,
        current_price: exitPrice,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error closing paper order:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update user's paper trading stats
    await updatePaperTradingStats(client, user.id, pnlUsd, order.pattern_type);

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      pnl: {
        usd: pnlUsd,
        pct: pnlPct,
      },
    });
  } catch (error) {
    console.error('Error closing paper order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function updatePaperTradingStats(
  client: AnyClient,
  userId: string,
  pnl: number,
  patternType: string | null
) {
  try {
    // Get or create stats record
    const { data: existingStats } = await client
      .from('paper_trading_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    const isWin = pnl > 0;

    if (existingStats) {
      // Update existing stats
      const newTotalTrades = existingStats.total_trades + 1;
      const newWinningTrades = existingStats.winning_trades + (isWin ? 1 : 0);
      const newLosingTrades = existingStats.losing_trades + (isWin ? 0 : 1);
      const newTotalPnl = parseFloat(existingStats.total_pnl) + pnl;
      const newWinRate = (newWinningTrades / newTotalTrades) * 100;

      // Update pattern stats
      const patternStats = existingStats.pattern_stats || {};
      if (patternType) {
        const existing = patternStats[patternType] || { trades: 0, wins: 0, total_pnl: 0, avg_pnl: 0 };
        existing.trades += 1;
        existing.wins += isWin ? 1 : 0;
        existing.total_pnl += pnl;
        existing.avg_pnl = existing.total_pnl / existing.trades;
        patternStats[patternType] = existing;
      }

      // Update streaks
      let currentStreak = existingStats.current_streak;
      if (isWin) {
        currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      } else {
        currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
      }

      await client
        .from('paper_trading_stats')
        .update({
          total_trades: newTotalTrades,
          winning_trades: newWinningTrades,
          losing_trades: newLosingTrades,
          total_pnl: newTotalPnl,
          win_rate: newWinRate,
          pattern_stats: patternStats,
          current_streak: currentStreak,
          best_streak: Math.max(existingStats.best_streak, currentStreak),
          worst_streak: Math.min(existingStats.worst_streak, currentStreak),
          max_drawdown: Math.min(existingStats.max_drawdown, newTotalPnl < 0 ? newTotalPnl : existingStats.max_drawdown),
        })
        .eq('user_id', userId);
    } else {
      // Create new stats record
      const patternStats: Record<string, { trades: number; wins: number; total_pnl: number; avg_pnl: number }> = {};
      if (patternType) {
        patternStats[patternType] = {
          trades: 1,
          wins: isWin ? 1 : 0,
          total_pnl: pnl,
          avg_pnl: pnl,
        };
      }

      await client
        .from('paper_trading_stats')
        .insert({
          user_id: userId,
          total_trades: 1,
          winning_trades: isWin ? 1 : 0,
          losing_trades: isWin ? 0 : 1,
          total_pnl: pnl,
          win_rate: isWin ? 100 : 0,
          pattern_stats: patternStats,
          current_streak: isWin ? 1 : -1,
          best_streak: isWin ? 1 : 0,
          worst_streak: isWin ? 0 : -1,
          max_drawdown: pnl < 0 ? pnl : 0,
        });
    }
  } catch (error) {
    console.error('Error updating paper trading stats:', error);
    // Don't throw - stats update failure shouldn't fail the close operation
  }
}
