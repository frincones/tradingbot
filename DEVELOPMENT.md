# Tradingbot - Local Development Guide

## Prerequisites

- Node.js 20+
- pnpm 10+
- Supabase CLI (optional for local DB)

## Environment Setup

1. Copy the environment file:
```bash
cp apps/web/.env.example apps/web/.env.local
```

2. Add your credentials to `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://vokwlwknebbpmeowyqgt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Alpaca (Paper Trading)
ALPACA_PAPER_KEY=your_alpaca_key
ALPACA_PAPER_SECRET=your_alpaca_secret
ALPACA_PAPER_URL=https://paper-api.alpaca.markets/v2

# OpenAI
OPENAI_API_KEY=your_openai_key
```

## Installation

```bash
# Install dependencies
pnpm install

# Verify types
pnpm run typecheck
```

## Development

```bash
# Start the development server
pnpm run dev

# The app will be available at http://localhost:3000
```

## Project Structure

```
tradingbot/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/
│       │   ├── api/trading/    # Trading API routes
│       │   ├── home/trading/   # Trading dashboard
│       │   └── ...
│       └── ...
├── packages/
│   ├── integrations/           # External service integrations
│   │   └── src/
│   │       ├── hyperliquid/    # Market data
│   │       ├── alpaca/         # Order execution
│   │       └── openai/         # AI agents
│   ├── trading-core/           # Core trading types & utilities
│   └── supabase/               # Database types & queries
└── ...
```

## Trading Dashboard

Navigate to `/home/trading` after signing in to access:

- **Market Overview**: Live prices from Hyperliquid
- **Active Strategies**: Manage trading strategies
- **Open Positions**: View and close positions
- **Recent Signals**: Signal detection history
- **Performance Metrics**: Alpaca account status

## API Endpoints

### Strategies
- `GET /api/trading/strategies` - List strategies
- `POST /api/trading/strategies` - Create strategy
- `PATCH /api/trading/strategies` - Update strategy
- `DELETE /api/trading/strategies?id=xxx` - Delete strategy
- `POST /api/trading/strategies/[id]/state` - Transition state

### Signals
- `GET /api/trading/signals` - List signals
- `POST /api/trading/signals` - Create signal

### Orders
- `GET /api/trading/orders` - List orders
- `POST /api/trading/orders` - Create & execute order
- `DELETE /api/trading/orders?id=xxx` - Cancel order

### Positions
- `GET /api/trading/positions` - List positions
- `POST /api/trading/positions` - Create position
- `DELETE /api/trading/positions?id=xxx` - Close position

### Market Data
- `GET /api/trading/market-data?type=mids` - All mid prices
- `GET /api/trading/market-data?type=orderbook&coin=BTC` - Order book
- `GET /api/trading/market-data?type=candles&coin=BTC&interval=1h` - Candles

### AI Agents
- `POST /api/trading/agents` - Call AI agent
  - `action: 'explain'` - Explain trading event
  - `action: 'supervise'` - Review trading decision
  - `action: 'report'` - Generate performance report
  - `action: 'optimize'` - Suggest optimizations

### Account
- `GET /api/trading/account?type=account` - Account info
- `GET /api/trading/account?type=positions` - Alpaca positions
- `GET /api/trading/account?type=orders` - Alpaca orders

## Strategy States

The trading strategy follows this state machine:

```
IDLE → SETUP → TRIGGERED → ORDERING → IN_POSITION → EXITING → COOLDOWN → IDLE
```

## Database Tables

Core trading tables:
- `strategies` - Trading strategies configuration
- `signals` - Market signals (flush, burst, absorption)
- `trade_intents` - Planned trades
- `orders` - Order records
- `positions` - Position tracking
- `risk_events` - Risk management events
- `whale_events` - Whale activity detection
- `agent_traces` - AI agent execution logs

## Useful Commands

```bash
# Run type checking
pnpm run typecheck

# Run linting
pnpm run lint

# Build for production
pnpm run build

# Generate Supabase types
cd apps/web && pnpm run supabase:typegen
```
