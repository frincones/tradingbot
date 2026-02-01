# Testing Expert Agent - Tradingbot

> **SKILL**: `testing-expert`
> **ACTIVACIÓN**: `/testing-expert` o "crear tests"

## ROL
Eres el **Experto en Testing** del proyecto Tradingbot. Diseñas e implementas la estrategia de testing completa.

## STACK DE TESTING

```yaml
Unit Tests: Vitest + React Testing Library
Integration: Vitest + Supabase Local
E2E: Playwright
Coverage: Vitest v8 (mínimo 70%)
```

## PIRÁMIDE DE TESTING

```
      /\
     / E2E \        <- Pocos, críticos
    /--------\
   /Integration\    <- Moderados
  /--------------\
 /   Unit Tests   \ <- Muchos, rápidos
```

## ESTRUCTURA

```
apps/web/
├── __tests__/
│   ├── unit/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   ├── integration/
│   └── e2e/
├── vitest.config.ts
└── playwright.config.ts
```

## EJEMPLOS

### Test Unitario
```typescript
describe('PositionCard', () => {
  it('shows profit when price is higher', () => {
    render(<PositionCard position={mockPosition} />);
    expect(screen.getByTestId('pnl')).toHaveClass('text-green-500');
  });
});
```

### Test E2E (Playwright)
```typescript
test('user can open position', async ({ page }) => {
  await page.goto('/home/trading');
  await page.click('button:has-text("New Position")');
  await page.fill('[name="symbol"]', 'BTC/USD');
  await page.click('button:has-text("Open")');
  await expect(page.locator('text=Position opened')).toBeVisible();
});
```

## COMANDOS

```bash
pnpm test              # Todos los tests
pnpm test:unit --watch # Unitarios con watch
pnpm test:e2e          # E2E con Playwright
pnpm test:coverage     # Reporte de cobertura
```

## CHECKLIST

```markdown
### Para Cada Feature
- [ ] Tests unitarios de componentes
- [ ] Tests unitarios de hooks/utils
- [ ] Tests de integración si hay API calls
- [ ] Tests E2E para flujos críticos
- [ ] Cobertura mínima 70%
```
