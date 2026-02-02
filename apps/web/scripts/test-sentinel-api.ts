/**
 * Test Script: Sentinel Agent API Direct Test
 *
 * Tests the Sentinel agent directly via the API route
 * with a mock RealtimeBundle to verify OpenAI integration.
 *
 * Usage: npx tsx apps/web/scripts/test-sentinel-api.ts
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006',
  SYMBOL: 'BTC',
};

// ============================================================================
// CREATE MOCK BUNDLE WITH INTERESTING PATTERNS
// ============================================================================

function createMockBundle() {
  const currentPrice = 77233;

  return {
    market_state: {
      symbol: CONFIG.SYMBOL,
      current_price: currentPrice,
      mark_price: currentPrice,
      oracle_price: currentPrice * 0.9998,
      funding_rate: 0.00003,
      open_interest: 23500000000,
      volume_24h: 5900000000,
      bid_price: currentPrice - 5,
      ask_price: currentPrice + 5,
      spread_bps: 0.13,
      timestamp: Date.now(),
    },
    features: {
      // Simulating a FLUSH event followed by reclaim
      flush_events: [
        {
          type: 'FLUSH',
          direction: 'down',
          start_price: currentPrice * 1.002,
          end_price: currentPrice * 0.995,
          volume_usd: 5000000,
          trades_count: 150,
          duration_ms: 30000,
          timestamp: Date.now() - 60000,
        },
      ],
      burst_events: [
        {
          type: 'BURST',
          direction: 'up',
          start_price: currentPrice * 0.995,
          end_price: currentPrice,
          volume_usd: 3000000,
          trades_count: 80,
          duration_ms: 20000,
          timestamp: Date.now() - 30000,
        },
      ],
      absorption_events: [
        {
          type: 'ABSORPTION',
          side: 'bid',
          price_level: currentPrice * 0.997,
          volume_absorbed: 2000000,
          orders_absorbed: 45,
          duration_ms: 15000,
          timestamp: Date.now() - 45000,
        },
      ],
      recent_trades_count: 500,
      recent_volume_usd: 15000000,
    },
    levels: {
      support_levels: [
        currentPrice * 0.99,
        currentPrice * 0.98,
        currentPrice * 0.97,
      ],
      resistance_levels: [
        currentPrice * 1.01,
        currentPrice * 1.02,
        currentPrice * 1.03,
      ],
      key_price_levels: [
        currentPrice,
        77000,
        78000,
      ],
      liquidation_clusters: [
        {
          side: 'longs' as const,
          zone: [currentPrice * 0.95, currentPrice * 0.96] as [number, number],
          weight: 0.7,
        },
        {
          side: 'shorts' as const,
          zone: [currentPrice * 1.04, currentPrice * 1.05] as [number, number],
          weight: 0.5,
        },
      ],
    },
    whales: {
      recent_trades: [
        {
          coin: CONFIG.SYMBOL,
          side: 'buy' as const,
          price: currentPrice,
          size: 2.5,
          notionalUsd: 193082,
          hash: '0xabc123',
          time: Date.now() - 10000,
        },
        {
          coin: CONFIG.SYMBOL,
          side: 'buy' as const,
          price: currentPrice * 0.999,
          size: 1.8,
          notionalUsd: 138900,
          hash: '0xdef456',
          time: Date.now() - 25000,
        },
        {
          coin: CONFIG.SYMBOL,
          side: 'sell' as const,
          price: currentPrice * 1.001,
          size: 0.8,
          notionalUsd: 61900,
          hash: '0xghi789',
          time: Date.now() - 40000,
        },
      ],
      large_positions_opened: [],
      total_whale_buying_usd: 331982,
      total_whale_selling_usd: 61900,
      net_whale_flow_usd: 270082,
      dominant_direction: 'buying' as const,
    },
    execution_context: {
      spread_bps: 0.13,
      liquidity_score: 0.92,
      slippage_estimate: 0.05,
      best_bid: currentPrice - 5,
      best_ask: currentPrice + 5,
      latency_estimate_ms: 25,
    },
    risk_state: {
      daily_loss_usd: 0,
      daily_trades_count: 0,
      max_daily_loss_usd: 1000,
      max_trades_per_day: 10,
      cooldown_active: false,
      cooldown_until: null,
      kill_switch_active: false,
      kill_switch_reason: null,
      current_position_value: 0,
      max_position_value: 10000,
    },
    config: {
      flush_threshold: 70,
      burst_threshold: 70,
      absorption_threshold: 70,
      whale_confirmation_required: true,
      min_confidence: 0.6,
      max_position_usd: 5000,
      max_daily_loss_usd: 1000,
      max_trades_per_day: 10,
      cooldown_minutes: 15,
      paper_mode: true,
    },
  };
}

// ============================================================================
// DIRECT OPENAI TEST (without API route)
// ============================================================================

async function testOpenAIDirectly() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   🤖 SENTINEL AGENT - OPENAI DIRECT TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('\x1b[33m[WARN]\x1b[0m OPENAI_API_KEY not set. Skipping direct OpenAI test.');
    console.log('Set it in .env.local or export OPENAI_API_KEY=your-key');
    return null;
  }

  console.log('\x1b[36m[INFO]\x1b[0m OpenAI API key found. Testing direct API call...\n');

  const bundle = createMockBundle();

  // Simplified prompt for testing
  const messages = [
    {
      role: 'system',
      content: `You are a trading pattern detection AI. Analyze the market data and return a JSON response.

Your response MUST be valid JSON with this structure:
{
  "decision": "ALERT" | "NO_ALERT" | "NEED_MORE_DATA",
  "pattern": {
    "type": "FLUSH_RECLAIM" | "BURST_CONTINUATION" | "ABSORPTION_REVERSAL" | "WHALE_DRIVEN",
    "setup": "LONG_SETUP" | "SHORT_SETUP",
    "total_score": number (0-100)
  },
  "thesis": {
    "title": string,
    "reasoning": string
  },
  "confidence": number (0-1),
  "recommendation": "APPROVE" | "WAIT" | "BLOCK"
}`,
    },
    {
      role: 'user',
      content: `Analyze this market data for ${bundle.market_state.symbol}:

Market State:
- Price: $${bundle.market_state.mark_price.toLocaleString()}
- Spread: ${bundle.market_state.spread_bps} bps
- 24h Volume: $${(bundle.market_state.volume_24h / 1e9).toFixed(2)}B
- Funding: ${(bundle.market_state.funding_rate * 100).toFixed(4)}%

Features Detected:
- Flush Events: ${bundle.features.flush_events.length} (latest: ${bundle.features.flush_events[0]?.direction || 'none'})
- Burst Events: ${bundle.features.burst_events.length} (latest: ${bundle.features.burst_events[0]?.direction || 'none'})
- Absorption Events: ${bundle.features.absorption_events.length}

Whale Activity:
- Net Whale Flow: $${bundle.whales.net_whale_flow_usd.toLocaleString()}
- Whale Trades: ${bundle.whales.recent_trades.length}
- Dominant Direction: ${bundle.whales.dominant_direction}

Risk State:
- Daily Loss: $${bundle.risk_state.daily_loss_usd}
- Cooldown Active: ${bundle.risk_state.cooldown_active}
- Kill Switch: ${bundle.risk_state.kill_switch_active}

Analyze this data and provide your assessment.`,
    },
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const result = JSON.parse(content);

    console.log('--- OpenAI Response ---\n');

    const decisionColor = result.decision === 'ALERT' ? '\x1b[32m' : '\x1b[33m';
    console.log(`Decision: ${decisionColor}${result.decision}\x1b[0m`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Recommendation: ${result.recommendation}`);

    if (result.pattern) {
      console.log(`\nPattern Type: ${result.pattern.type}`);
      console.log(`Setup: ${result.pattern.setup}`);
      console.log(`Score: ${result.pattern.total_score}`);
    }

    if (result.thesis) {
      console.log(`\nThesis: ${result.thesis.title}`);
      console.log(`Reasoning: ${result.thesis.reasoning}`);
    }

    console.log('\n--- API Usage ---');
    console.log(`Tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`);
    console.log(`Model: ${data.model}`);

    return result;
  } catch (error) {
    console.error('\x1b[31m[ERROR]\x1b[0m OpenAI API call failed:', error);
    return null;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Load env vars from .env.local
  const fs = await import('fs');
  const path = await import('path');

  const envPath = path.join(process.cwd(), 'apps', 'web', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.startsWith('#')) {
        const value = valueParts.join('=').trim();
        if (value && !process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    }
  }

  await testOpenAIDirectly();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   ✅ TEST COMPLETED');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
