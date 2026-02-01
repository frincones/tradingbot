'use client';

/**
 * Alert Notification - WhatsApp-style floating notification popup
 * Shows when new AI alert is generated
 */

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  X,
  BellRing,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';
import type { AgentAlert } from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  alert: AgentAlert;
  onDismiss: () => void;
  onClick?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getRecommendationBorder(rec: string): string {
  switch (rec) {
    case 'APPROVE':
      return 'border-l-green-500';
    case 'WAIT':
      return 'border-l-yellow-500';
    case 'BLOCK':
      return 'border-l-red-500';
    default:
      return 'border-l-muted';
  }
}

function getRecommendationIcon(rec: string) {
  switch (rec) {
    case 'APPROVE':
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    case 'WAIT':
      return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    case 'BLOCK':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return null;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AlertNotification({ alert, onDismiss, onClick }: Props) {
  return (
    <div
      className={cn(
        'bg-card border rounded-lg shadow-xl p-3 max-w-sm cursor-pointer',
        'border-l-4',
        getRecommendationBorder(alert.recommendation),
        'animate-in slide-in-from-right-5 fade-in duration-300',
        'hover:bg-accent/50 transition-colors'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <BellRing className="h-4 w-4 text-primary" />
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
          </div>
          <span className="text-xs font-semibold">AI Alert</span>
          {getRecommendationIcon(alert.recommendation)}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-2">
        {/* Symbol and setup */}
        <div className="flex items-center gap-2">
          {alert.setup === 'LONG' ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <Badge
            variant={alert.setup === 'LONG' ? 'default' : 'destructive'}
            className="text-[10px] px-1.5"
          >
            {alert.setup}
          </Badge>
          <span className="font-bold text-sm">{alert.symbol}</span>
          <Badge variant="outline" className="text-[10px] px-1.5">
            {alert.recommendation}
          </Badge>
        </div>

        {/* Thesis title */}
        <p className="text-xs text-muted-foreground line-clamp-2">
          {alert.thesis_json?.title || 'Patrón detectado'}
        </p>

        {/* Execution preview if APPROVE */}
        {alert.recommendation === 'APPROVE' && alert.execution_json && (
          <div className="flex items-center gap-3 text-[10px] bg-muted/30 rounded p-1.5">
            <span>
              Entry:{' '}
              <span className="font-mono">
                ${alert.execution_json.entry_zone.min.toLocaleString()}
              </span>
            </span>
            <span className="text-green-500">
              TP: ${alert.execution_json.take_profit.toLocaleString()}
            </span>
            <span className="text-red-500">
              SL: ${alert.execution_json.stop_loss.toLocaleString()}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span>
            Confianza:{' '}
            <span className="font-mono font-semibold">
              {(alert.confidence * 100).toFixed(0)}%
            </span>
          </span>
          <span className="flex items-center gap-1 text-primary">
            Ver detalles <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
