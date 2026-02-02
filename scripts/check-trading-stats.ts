/**
 * Check Trading Statistics
 * Query Sentinel alerts and Binance orders from Supabase
 */

import { config } from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: join(__dirname, '../apps/web/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Checking Trading Statistics...\n');

  // Check Sentinel Alerts (last 24 hours)
  const { data: alerts, error: alertsError } = await supabase
    .from('agent_alerts')
    .select('alert_type, confidence, decision, created_at')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  if (alertsError) {
    console.error('❌ Error fetching alerts:', alertsError);
  } else {
    console.log(`📊 SENTINEL ALERTS (Last 24 hours)`);
    console.log(`   Total Alerts: ${alerts?.length || 0}`);

    if (alerts && alerts.length > 0) {
      const byType = alerts.reduce((acc: any, alert) => {
        acc[alert.alert_type] = (acc[alert.alert_type] || 0) + 1;
        return acc;
      }, {});

      const byDecision = alerts.reduce((acc: any, alert) => {
        acc[alert.decision] = (acc[alert.decision] || 0) + 1;
        return acc;
      }, {});

      const avgConfidence = alerts.reduce((sum, a) => sum + (a.confidence || 0), 0) / alerts.length;

      console.log('\n   By Alert Type:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });

      console.log('\n   By Decision:');
      Object.entries(byDecision).forEach(([decision, count]) => {
        console.log(`     ${decision}: ${count}`);
      });

      console.log(`\n   Average Confidence: ${(avgConfidence * 100).toFixed(2)}%`);

      // Show recent high-confidence alerts
      const highConfidence = alerts.filter(a => (a.confidence || 0) >= 0.80);
      console.log(`\n   High Confidence (≥80%): ${highConfidence.length}`);

      if (highConfidence.length > 0) {
        console.log('\n   Recent High-Confidence Alerts:');
        highConfidence.slice(0, 5).forEach((alert, i) => {
          console.log(`     ${i + 1}. ${alert.alert_type} - ${alert.decision} (${((alert.confidence || 0) * 100).toFixed(0)}%) - ${new Date(alert.created_at).toLocaleString()}`);
        });
      }
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Check Binance Orders
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, symbol, side, status, qty, filled_avg_price, broker, created_at')
    .eq('broker', 'binance')
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('❌ Error fetching orders:', ordersError);
  } else {
    console.log(`💰 BINANCE ORDERS (All Time)`);
    console.log(`   Total Orders: ${orders?.length || 0}`);

    if (orders && orders.length > 0) {
      const byStatus = orders.reduce((acc: any, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      const bySide = orders.reduce((acc: any, order) => {
        acc[order.side] = (acc[order.side] || 0) + 1;
        return acc;
      }, {});

      console.log('\n   By Status:');
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`     ${status}: ${count}`);
      });

      console.log('\n   By Side:');
      Object.entries(bySide).forEach(([side, count]) => {
        console.log(`     ${side}: ${count}`);
      });

      // Recent orders
      console.log('\n   Recent Orders:');
      orders.slice(0, 10).forEach((order, i) => {
        const price = order.filled_avg_price ? `@ $${Number(order.filled_avg_price).toFixed(2)}` : '';
        const qty = order.qty ? `${Number(order.qty).toFixed(8)} ` : '';
        console.log(`     ${i + 1}. ${order.side} ${qty}${order.symbol} ${price} - ${order.status} - ${new Date(order.created_at).toLocaleString()}`);
      });
    }
  }

  console.log('\n✅ Statistics check complete!\n');
}

main().catch(console.error);
