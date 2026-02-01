'use client';

/**
 * Trading KPIs Hook
 * Fetches and manages all trading KPIs via API route
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AllKPIs,
  PatternPerformance,
  EquityCurvePoint,
} from '@kit/trading-core';
import { emptyAllKPIs } from '@kit/trading-core';

interface UseTradingKPIsOptions {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

interface UseTradingKPIsReturn {
  kpis: AllKPIs;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

export function useTradingKPIs(options: UseTradingKPIsOptions = {}): UseTradingKPIsReturn {
  const { autoRefresh = true, refreshIntervalMs = 30000 } = options;

  const [kpis, setKpis] = useState<AllKPIs>(emptyAllKPIs);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchKPIs = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/trading/kpis');

      if (!response.ok) {
        if (response.status === 401) {
          setError('User not authenticated');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setKpis(data as AllKPIs);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching KPIs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch KPIs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchKPIs();
  }, [fetchKPIs]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && refreshIntervalMs > 0) {
      intervalRef.current = setInterval(() => {
        fetchKPIs();
      }, refreshIntervalMs);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshIntervalMs, fetchKPIs]);

  return {
    kpis,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchKPIs,
  };
}

// ============================================================================
// Pattern Analysis Hook
// ============================================================================

interface UsePatternAnalysisReturn {
  patterns: PatternPerformance[];
  bestPattern: PatternPerformance | null;
  worstPattern: PatternPerformance | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePatternAnalysis(): UsePatternAnalysisReturn {
  const { kpis, isLoading, error, refetch } = useTradingKPIs({ autoRefresh: false });

  const patterns = kpis.pattern_performance || [];

  // Calculate best and worst patterns by P&L
  const sortedByPnl = [...patterns].sort((a, b) => (b.total_pnl || 0) - (a.total_pnl || 0));
  const bestPattern = sortedByPnl[0] || null;
  const worstPattern = (sortedByPnl.length > 0 ? sortedByPnl[sortedByPnl.length - 1] : null) || null;

  return {
    patterns,
    bestPattern,
    worstPattern,
    isLoading,
    error,
    refetch,
  };
}

// ============================================================================
// Agent ROI Hook
// ============================================================================

interface AgentROI {
  totalCost: number;
  totalPnL: number;
  netROI: number;
  roiPercentage: number;
  costPerTrade: number;
  costPerProfitableTrade: number;
}

interface UseAgentROIReturn {
  roi: AgentROI;
  isLoading: boolean;
  error: string | null;
}

export function useAgentROI(): UseAgentROIReturn {
  const { kpis, isLoading, error } = useTradingKPIs({ autoRefresh: false });

  const roi: AgentROI = {
    totalCost:
      (kpis.agent_costs?.total_cost_usd || 0) +
      (kpis.atlas_entry?.total_cost_usd || 0) +
      (kpis.atlas_trade?.total_cost_usd || 0),
    totalPnL: kpis.pnl?.total_realized_pnl_usd || 0,
    netROI: 0,
    roiPercentage: 0,
    costPerTrade: 0,
    costPerProfitableTrade: 0,
  };

  // Calculate net ROI
  roi.netROI = roi.totalPnL - roi.totalCost;

  // Calculate ROI percentage
  if (roi.totalCost > 0) {
    roi.roiPercentage = ((roi.totalPnL - roi.totalCost) / roi.totalCost) * 100;
  }

  // Cost per trade
  if (kpis.trades?.total_trades > 0) {
    roi.costPerTrade = roi.totalCost / kpis.trades.total_trades;
  }

  // Cost per profitable trade
  if (kpis.pnl?.winning_trades > 0) {
    roi.costPerProfitableTrade = roi.totalCost / kpis.pnl.winning_trades;
  }

  return {
    roi,
    isLoading,
    error,
  };
}

// ============================================================================
// Equity Curve Hook (placeholder for future implementation)
// ============================================================================

interface UseEquityCurveOptions {
  period?: '24h' | '7d' | '30d' | '90d';
}

interface UseEquityCurveReturn {
  data: EquityCurvePoint[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useEquityCurve(_options: UseEquityCurveOptions = {}): UseEquityCurveReturn {
  // For now, return empty data - equity curve requires additional API endpoint
  const [data] = useState<EquityCurvePoint[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    // TODO: Implement equity curve API call
  }, []);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
