'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Signal {
  id: string;
  strategy_id: string;
  setup: 'LONG' | 'SHORT' | 'NONE';
  scores_json: Record<string, number>;
  levels_json: Record<string, number>;
  confirmations_json: Record<string, boolean>;
  ts: string;
  created_at: string;
}

const SETUP_ICONS: Record<string, typeof TrendingUp> = {
  LONG: TrendingUp,
  SHORT: TrendingDown,
  NONE: Minus,
};

const SETUP_COLORS: Record<string, string> = {
  LONG: 'text-green-500 bg-green-500/10',
  SHORT: 'text-red-500 bg-red-500/10',
  NONE: 'text-gray-500 bg-gray-500/10',
};

export function RecentSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSignals() {
      try {
        const response = await fetch('/api/trading/signals?limit=10');
        if (response.ok) {
          const data = await response.json();
          setSignals(data);
        }
      } catch (err) {
        console.error('Failed to fetch signals:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSignals();
    const interval = setInterval(fetchSignals, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Recent Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No signals detected yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((signal) => {
              const Icon = SETUP_ICONS[signal.setup] || Minus;
              const colorClasses = SETUP_COLORS[signal.setup] || SETUP_COLORS.NONE;
              const totalScore = Object.values(signal.scores_json || {}).reduce(
                (a, b) => a + (typeof b === 'number' ? b : 0),
                0
              );
              const confirmationCount = Object.values(signal.confirmations_json || {}).filter(Boolean).length;
              const totalConfirmations = Object.keys(signal.confirmations_json || {}).length;

              return (
                <div
                  key={signal.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${colorClasses}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            signal.setup === 'LONG'
                              ? 'default'
                              : signal.setup === 'SHORT'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {signal.setup}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Score: {totalScore.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {confirmationCount}/{totalConfirmations} confirmations
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(signal.ts), { addSuffix: true })}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                      {signal.id.slice(0, 8)}...
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
