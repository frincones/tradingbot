'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Settings, Plus, Zap } from 'lucide-react';
import Link from 'next/link';

interface Strategy {
  id: string;
  name: string;
  symbol: string;
  mode: 'paper' | 'live' | 'disabled';
  current_state: string;
  config_json: Record<string, unknown>;
  created_at: string;
}

const STATE_COLORS: Record<string, string> = {
  IDLE: 'bg-gray-500',
  SETUP: 'bg-blue-500',
  TRIGGERED: 'bg-yellow-500',
  ORDERING: 'bg-orange-500',
  IN_POSITION: 'bg-green-500',
  EXITING: 'bg-red-500',
  COOLDOWN: 'bg-purple-500',
};

export function ActiveStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStrategies() {
      try {
        const response = await fetch('/api/trading/strategies');
        if (response.ok) {
          const data = await response.json();
          setStrategies(data);
        }
      } catch (err) {
        console.error('Failed to fetch strategies:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStrategies();
    const interval = setInterval(fetchStrategies, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Zap className="h-8 w-8 mb-1 opacity-50" />
        <p className="text-xs mb-2">No strategies created yet</p>
        <Link href="/home/trading/strategies/new">
          <Button variant="outline" size="sm" className="h-6 text-[10px]">
            <Plus className="h-3 w-3 mr-1" />
            Create Strategy
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_0.6fr_0.6fr_0.7fr_0.4fr] gap-2 px-2 py-1 text-[10px] text-muted-foreground border-b sticky top-0 bg-background">
        <span>Strategy</span>
        <span>Symbol</span>
        <span>Mode</span>
        <span>State</span>
        <span></span>
      </div>

      {/* Strategy rows */}
      <div className="divide-y divide-border/50">
        {strategies.map((strategy) => (
          <div
            key={strategy.id}
            className="grid grid-cols-[1fr_0.6fr_0.6fr_0.7fr_0.4fr] gap-2 px-2 py-1 items-center text-[11px] hover:bg-muted/30"
          >
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${STATE_COLORS[strategy.current_state] || 'bg-gray-400'}`}
              />
              <span className="font-medium truncate">{strategy.name}</span>
            </div>
            <span className="text-muted-foreground font-mono">{strategy.symbol}</span>
            <Badge
              variant={strategy.mode === 'live' ? 'destructive' : 'secondary'}
              className="text-[9px] px-1 py-0 h-4 w-fit"
            >
              {strategy.mode}
            </Badge>
            <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 h-4 w-fit">
              {strategy.current_state}
            </Badge>
            <div className="flex justify-end">
              <Link href={`/home/trading/strategies/${strategy.id}`}>
                <Button variant="ghost" size="icon" className="h-5 w-5">
                  <Settings className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Add new button at bottom */}
      <div className="p-2 border-t">
        <Link href="/home/trading/strategies/new">
          <Button variant="outline" size="sm" className="w-full h-6 text-[10px]">
            <Plus className="h-3 w-3 mr-1" />
            New Strategy
          </Button>
        </Link>
      </div>
    </ScrollArea>
  );
}
