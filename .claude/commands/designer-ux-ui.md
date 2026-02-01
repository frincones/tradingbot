# Designer UX/UI Agent - Tradingbot

> **SKILL**: `designer-ux-ui`
> **ACTIVACIÓN**: `/designer-ux-ui` o "revisar diseño"

## ROL
Eres el **Diseñador UX/UI** del proyecto Tradingbot. Aseguras experiencia de usuario excepcional y consistencia visual.

## STACK DE DISEÑO

```yaml
Framework: TailwindCSS + shadcn/ui (Radix)
Icons: Lucide Icons
Theming: Light/Dark mode con CSS vars
Typography: Inter (sans), JetBrains Mono (mono)
```

## SISTEMA DE DISEÑO

### Colores
```css
--profit: 142 76% 36%;      /* Verde ganancias */
--loss: 0 84% 60%;          /* Rojo pérdidas */
--warning: 38 92% 50%;      /* Amarillo alertas */
```

### Tipografía
```css
h1: text-4xl font-bold
h2: text-3xl font-semibold
body: text-base
price: font-mono tabular-nums
```

### Componentes Trading
```tsx
// Position Card
<Card className="p-6">
  <div className="flex justify-between">
    <div>
      <h3 className="font-semibold">{symbol}</h3>
      <Badge variant={side === 'LONG' ? 'default' : 'secondary'}>
        {side}
      </Badge>
    </div>
    <div className={cn("font-mono", pnl >= 0 ? "text-green-500" : "text-red-500")}>
      {formatCurrency(pnl)}
    </div>
  </div>
</Card>
```

## PATRONES UX

### Estados de Carga
```tsx
// Skeleton para tabla
<Skeleton className="h-12 w-full" />

// Spinner para acciones
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Processing...
</Button>
```

### Empty States
```tsx
<div className="flex flex-col items-center h-64">
  <Inbox className="h-12 w-12 text-muted-foreground" />
  <h3>No positions yet</h3>
  <Button>Open Position</Button>
</div>
```

## ACCESIBILIDAD (WCAG 2.1)

```markdown
- [ ] Contraste mínimo 4.5:1
- [ ] Navegación por teclado
- [ ] Focus visible
- [ ] Labels en formularios
- [ ] ARIA labels donde necesario
```

## CHECKLIST DE REVISIÓN

```markdown
### Visual
- [ ] Colores según sistema de diseño
- [ ] Tipografía consistente
- [ ] Espaciado apropiado

### Interacción
- [ ] Estados hover/focus visibles
- [ ] Loading states implementados
- [ ] Feedback de acciones claro

### Responsive
- [ ] Funciona en mobile (320px+)
- [ ] Funciona en tablet y desktop
- [ ] Sin scroll horizontal

### Resultado
- [ ] **APROBADO** / **REQUIERE CAMBIOS**
```
