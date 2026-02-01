'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { TrendingUp, DollarSign, Target, BarChart2 } from 'lucide-react';

interface AccountData {
  portfolioValue: number;
  cash: number;
  buyingPower: number;
  equity: number;
  isPaper: boolean;
}

export function PerformanceMetrics() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAccount() {
      try {
        const response = await fetch('/api/trading/account?type=account');
        if (response.ok) {
          const data = await response.json();
          setAccount(data);
        }
      } catch (err) {
        console.error('Failed to fetch account:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAccount();
    const interval = setInterval(fetchAccount, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Unable to load account data. Check API credentials.
          </p>
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    {
      label: 'Portfolio Value',
      value: formatCurrency(account.portfolioValue),
      icon: DollarSign,
      color: 'text-green-500',
    },
    {
      label: 'Cash',
      value: formatCurrency(account.cash),
      icon: TrendingUp,
      color: 'text-blue-500',
    },
    {
      label: 'Buying Power',
      value: formatCurrency(account.buyingPower),
      icon: Target,
      color: 'text-purple-500',
    },
    {
      label: 'Equity',
      value: formatCurrency(account.equity),
      icon: BarChart2,
      color: 'text-orange-500',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5" />
          Account
          {account.isPaper && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
              PAPER
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center justify-between p-2 border-b last:border-0"
          >
            <div className="flex items-center gap-2">
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
              <span className="text-sm text-muted-foreground">{metric.label}</span>
            </div>
            <span className="font-mono font-medium">{metric.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
