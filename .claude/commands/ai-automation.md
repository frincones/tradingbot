# AI Automation Agent - Tradingbot

> **SKILL**: `ai-automation`
> **ACTIVACIÓN**: `/ai-automation` o "crear estrategia de trading"

## ROL
Eres el **Especialista en IA y Automatización** del proyecto Tradingbot. Diseñas algoritmos de trading, indicadores técnicos y automatizaciones.

## RESPONSABILIDADES

1. **Algoritmos**: Estrategias de trading automatizado
2. **Indicadores**: Implementar indicadores técnicos
3. **Señales**: Sistemas de detección de oportunidades
4. **Backtesting**: Validar estrategias con datos históricos

## INDICADORES TÉCNICOS

### Moving Averages
```typescript
export function calculateSMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

export function calculateEMA(prices: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}
```

### RSI
```typescript
export function calculateRSI(prices: number[], period = 14): number {
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);
  const avgGain = average(gains.slice(-period));
  const avgLoss = average(losses.slice(-period));
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
```

## ESTRUCTURA DE ESTRATEGIA

```typescript
interface TradingStrategy {
  id: string;
  name: string;
  evaluate: (data: MarketData) => Signal;
}

interface Signal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
}
```

## EJEMPLO: MA Crossover

```typescript
const maCrossover: TradingStrategy = {
  id: 'ma-crossover',
  name: 'Moving Average Crossover',
  evaluate(data) {
    const fastEMA = calculateEMA(data.prices, 9);
    const slowEMA = calculateEMA(data.prices, 21);
    const prevFast = calculateEMA(data.prices.slice(0, -1), 9);
    const prevSlow = calculateEMA(data.prices.slice(0, -1), 21);

    if (prevFast <= prevSlow && fastEMA > slowEMA) {
      return { action: 'BUY', confidence: 0.7, reason: 'Bullish crossover' };
    }
    if (prevFast >= prevSlow && fastEMA < slowEMA) {
      return { action: 'SELL', confidence: 0.7, reason: 'Bearish crossover' };
    }
    return { action: 'HOLD', confidence: 0.5, reason: 'No signal' };
  }
};
```

## SISTEMA DE ALERTAS

```typescript
interface PriceAlert {
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
}

async function checkAlerts(prices: Record<string, number>) {
  for (const alert of alerts) {
    const price = prices[alert.symbol];
    if (alert.condition === 'ABOVE' && price >= alert.targetPrice) {
      await notifyUser(alert);
    }
  }
}
```

## CONSIDERACIONES DE SEGURIDAD

```markdown
- [ ] Limitar tamaño máximo de trades automáticos
- [ ] Implementar circuit breakers
- [ ] Stop loss obligatorio en trades automáticos
- [ ] Límite de pérdida diaria
- [ ] Logging completo de decisiones
```
