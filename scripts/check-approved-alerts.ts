/**
 * Check Approved But Not Executed Alerts
 * Find alerts that Atlas approved but haven't been executed as orders
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
  console.log('🔍 Checking Approved Alerts Without Orders...\n');

  // Get all alerts with status 'new' (pending)
  const { data: pendingAlerts, error: pendingError } = await supabase
    .from('agent_alerts')
    .select('*')
    .eq('status', 'new')
    .eq('decision', 'ALERT')
    .order('created_at', { ascending: false });

  if (pendingError) {
    console.error('❌ Error fetching pending alerts:', pendingError);
  } else {
    console.log(`📋 PENDING ALERTS (status='new', decision='ALERT')`);
    console.log(`   Total: ${pendingAlerts?.length || 0}`);

    if (pendingAlerts && pendingAlerts.length > 0) {
      console.log('\n   Recent Pending:');
      pendingAlerts.slice(0, 10).forEach((alert, i) => {
        console.log(`     ${i + 1}. ${alert.alert_type} - ${alert.symbol} - ${((alert.confidence || 0) * 100).toFixed(0)}% - ${new Date(alert.created_at).toLocaleString()}`);
      });
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Get all alert statuses
  const { data: allAlerts, error: allError } = await supabase
    .from('agent_alerts')
    .select('status, decision, alert_type')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (!allError && allAlerts) {
    console.log(`📊 ALERT STATUS BREAKDOWN (Last 24h)`);

    const byStatus = allAlerts.reduce((acc: any, alert) => {
      acc[alert.status || 'null'] = (acc[alert.status || 'null'] || 0) + 1;
      return acc;
    }, {});

    console.log('\n   By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`     ${status}: ${count}`);
    });
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Check if there's an intent_executions or trade_executions table
  const { data: tablesList, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .like('table_name', '%intent%');

  if (!tablesError && tablesList) {
    console.log('📋 Tables related to intents/executions:');
    tablesList.forEach(t => console.log(`   - ${t.table_name}`));
  }

  console.log('\n✅ Check complete!\n');
  console.log('🔴 PROBLEMA IDENTIFICADO:');
  console.log('   - Sentinel genera alertas → Se guardan con status="new"');
  console.log('   - Atlas Entry analiza y aprueba → NO actualiza el status');
  console.log('   - NO se ejecutan órdenes en Binance automáticamente');
  console.log('\n💡 SOLUCIÓN NECESARIA:');
  console.log('   - Implementar ejecución automática de órdenes cuando Atlas aprueba');
  console.log('   - O mostrar UI para aprobar manualmente y ejecutar');
}

main().catch(console.error);
