/**
 * Trading KPIs API Route
 * Fetches all KPIs from Supabase using fn_get_all_kpis function
 */

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { AllKPIs } from '@kit/trading-core';
import { emptyAllKPIs } from '@kit/trading-core';

export async function GET() {
  try {
    const client = getSupabaseServerClient();

    // Get current user
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the unified KPI function using type assertion
    // The function fn_get_all_kpis returns JSONB which gets parsed automatically
    const { data, error } = await (client.rpc as CallableFunction)('fn_get_all_kpis', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('Error calling fn_get_all_kpis:', error);
      // Return empty KPIs if function doesn't exist yet (migration not run)
      return NextResponse.json({
        ...emptyAllKPIs,
        generated_at: new Date().toISOString(),
      });
    }

    // Data is the JSONB result parsed by Supabase client
    const kpis = (data as unknown) as AllKPIs;

    // Ensure we have valid structure
    if (!kpis || typeof kpis !== 'object') {
      return NextResponse.json({
        ...emptyAllKPIs,
        generated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(kpis);
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    return NextResponse.json(
      {
        ...emptyAllKPIs,
        generated_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
