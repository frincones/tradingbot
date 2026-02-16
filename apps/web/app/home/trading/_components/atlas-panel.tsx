'use client';

/**
 * Atlas Panel - AI Trade Manager dashboard
 * Shows Entry Gatekeeping and Trade Management status and recent decisions
 *
 * @version 2.0.0 - Binance-only orders
 */

import { useState } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import {
  Brain,
  Shield,
  Activity,
  Clock,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Zap,
  Target,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';
import { useAtlasEntryGatekeeping } from '~/lib/hooks/use-atlas-entry-gatekeeping';
import { useAtlasTradeManager } from '~/lib/hooks/use-atlas-trade-manager';
import { toast } from 'sonner';
// Note: Type imports commented until needed to avoid lint errors
// import type { AtlasEntryResponse, AtlasTradeResponse } from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  symbol: string;
  enabled?: boolean;
  onEntryApproved?: (candidateId: string) => void;
  onActionProposed?: (tradeId: string, actionType: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  return date.toLocaleTimeString();
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case 'NORMAL':
      return 'text-green-500 bg-green-500/10';
    case 'CAUTION':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'EMERGENCY':
      return 'text-red-500 bg-red-500/10';
    default:
      return 'text-muted-foreground bg-muted/50';
  }
}

function getDecisionColor(decision: string): string {
  switch (decision) {
    case 'APPROVE_ENTRY':
    case 'APPROVE':
      return 'text-green-500';
    case 'WAIT':
      return 'text-yellow-500';
    case 'BLOCK':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'HOLD':
      return 'text-blue-500 bg-blue-500/10';
    case 'DEFEND':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'OPTIMIZE':
      return 'text-green-500 bg-green-500/10';
    case 'EXIT':
      return 'text-red-500 bg-red-500/10';
    default:
      return 'text-muted-foreground';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AtlasPanel({ symbol, enabled = true, onEntryApproved, onActionProposed }: Props) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Entry Gatekeeping hook (5 min interval)
  const entryHook = useAtlasEntryGatekeeping({
    symbol,
    enabled,
    analysisIntervalMs: 5 * 60 * 1000, // 5 minutes
    onAnalysisComplete: (result) => {
      console.log('[AtlasPanel] Entry analysis complete');
      const approved = result.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY');
      if (approved.length > 0) {
        toast.success(`Atlas: ${approved.length} entry(s) approved`);
      }
    },
    onAnalysisError: (error) => {
      toast.error(`Atlas Entry Error: ${error.message}`);
    },
    onEntryApproved: (candidateId) => {
      onEntryApproved?.(candidateId);
    },
  });

  // Trade Manager hook (10 min interval)
  const tradeHook = useAtlasTradeManager({
    symbol,
    enabled,
    analysisIntervalMs: 10 * 60 * 1000, // 10 minutes
    onAnalysisComplete: (result) => {
      console.log('[AtlasPanel] Trade management complete');
      const actionsCount = result.trade_management.reduce(
        (sum, tm) => sum + (tm.actions?.length || 0),
        0
      );
      if (actionsCount > 0) {
        toast.info(`Atlas: ${actionsCount} action(s) proposed`);
      }
    },
    onAnalysisError: (error) => {
      toast.error(`Atlas Trade Error: ${error.message}`);
    },
    onActionProposed: (tradeId, action) => {
      onActionProposed?.(tradeId, action.type);
    },
  });

  // Determine overall status
  const overallStatus = entryHook.globalStatus === 'EMERGENCY' || tradeHook.globalStatus === 'EMERGENCY'
    ? 'EMERGENCY'
    : entryHook.globalStatus === 'CAUTION' || tradeHook.globalStatus === 'CAUTION'
      ? 'CAUTION'
      : 'NORMAL';

  const isAnyAnalyzing = entryHook.isAnalyzing || tradeHook.isAnalyzing;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Atlas Trade Manager</span>
          <Badge className={cn('text-[8px] px-1 py-0 h-3', getStatusColor(overallStatus))}>
            {overallStatus || 'INIT'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {isAnyAnalyzing && (
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => {
              entryHook.triggerAnalysis();
              tradeHook.triggerAnalysis();
            }}
            disabled={isAnyAnalyzing}
          >
            <RefreshCcw className={cn('h-3 w-3', isAnyAnalyzing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="h-7 p-0.5 mx-1 mt-1 shrink-0">
          <TabsTrigger value="overview" className="text-[9px] h-6 px-2">Overview</TabsTrigger>
          <TabsTrigger value="entries" className="text-[9px] h-6 px-2">
            Entries
            {entryHook.pendingAlertsCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[7px] px-1 h-3">
                {entryHook.pendingAlertsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trades" className="text-[9px] h-6 px-2">
            Trades
            {tradeHook.openTradesCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[7px] px-1 h-3">
                {tradeHook.openTradesCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
          {/* Entry Gatekeeping Status */}
          <div className="p-2 rounded border bg-card">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-medium">Entry Gatekeeping</span>
              </div>
              <Badge variant="outline" className="text-[8px] px-1 h-4">
                5min cycle
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[9px]">
              <div className="text-center">
                <div className="font-mono text-green-500">{entryHook.approvedCount}</div>
                <div className="text-muted-foreground">Approved</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-red-500">{entryHook.blockedCount}</div>
                <div className="text-muted-foreground">Blocked</div>
              </div>
              <div className="text-center">
                <div className="font-mono">{entryHook.cycleCount}</div>
                <div className="text-muted-foreground">Cycles</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-yellow-500">{entryHook.pendingAlertsCount}</div>
                <div className="text-muted-foreground">Pending</div>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[8px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              Last: {formatTimeAgo(entryHook.lastAnalysis)}
              {entryHook.isAnalyzing && <span className="text-primary ml-1">Analyzing...</span>}
            </div>
          </div>

          {/* Trade Management Status */}
          <div className="p-2 rounded border bg-card">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-purple-500" />
                <span className="text-[10px] font-medium">Trade Management</span>
              </div>
              <Badge variant="outline" className="text-[8px] px-1 h-4">
                10min cycle
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[9px]">
              <div className="text-center">
                <div className="font-mono">{tradeHook.openTradesCount}</div>
                <div className="text-muted-foreground">Open</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-primary">{tradeHook.actionsProposedTotal}</div>
                <div className="text-muted-foreground">Actions</div>
              </div>
              <div className="text-center">
                <div className="font-mono">{tradeHook.cycleCount}</div>
                <div className="text-muted-foreground">Cycles</div>
              </div>
              <div className="text-center">
                <Badge className={cn('text-[8px] px-1', getStatusColor(tradeHook.globalStatus))}>
                  {tradeHook.globalStatus || '-'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[8px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              Last: {formatTimeAgo(tradeHook.lastAnalysis)}
              {tradeHook.isAnalyzing && <span className="text-primary ml-1">Analyzing...</span>}
            </div>
          </div>

          {/* Global Governor */}
          {(entryHook.lastResponse?.global_governor || tradeHook.lastResponse?.global_governor) && (
            <div className="p-2 rounded border bg-card">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                <span className="text-[10px] font-medium">Global Governor</span>
              </div>
              <div className="space-y-1 text-[9px]">
                {entryHook.lastResponse?.global_governor.reasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-1 text-muted-foreground">
                    <span className="text-yellow-500">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
                {tradeHook.lastResponse?.global_governor.reasons.map((reason, i) => (
                  <div key={`trade-${i}`} className="flex items-start gap-1 text-muted-foreground">
                    <span className="text-yellow-500">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
                {(entryHook.lastResponse?.global_governor.reasons.length === 0 &&
                  tradeHook.lastResponse?.global_governor.reasons.length === 0) && (
                  <span className="text-green-500">No alerts - system operating normally</span>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {(entryHook.error || tradeHook.error) && (
            <div className="p-2 rounded border border-red-500/30 bg-red-500/10">
              <div className="flex items-center gap-1.5 text-red-500 text-[10px]">
                <XCircle className="h-3 w-3" />
                <span className="font-medium">Error</span>
              </div>
              {entryHook.error && (
                <p className="text-[9px] text-red-400 mt-1">[Entry] {entryHook.error}</p>
              )}
              {tradeHook.error && (
                <p className="text-[9px] text-red-400 mt-1">[Trade] {tradeHook.error}</p>
              )}
            </div>
          )}
          </div>
          </ScrollArea>
        </TabsContent>

        {/* Entries Tab */}
        <TabsContent value="entries" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {!entryHook.lastResponse?.entry_gatekeeping?.length ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                <Shield className="h-5 w-5 mb-1 opacity-50" />
                <p className="text-[10px]">No entry decisions yet</p>
                <p className="text-[9px]">Waiting for pending alerts...</p>
              </div>
            ) : (
              <div className="space-y-1 p-1">
                {entryHook.lastResponse.entry_gatekeeping.map((entry) => (
                  <div
                    key={entry.candidate_id}
                    className="p-2 rounded border bg-card cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedEntryId(
                      expandedEntryId === entry.candidate_id ? null : entry.candidate_id
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {entry.setup === 'LONG' ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <Badge
                          variant={entry.setup === 'LONG' ? 'default' : 'destructive'}
                          className="text-[8px] px-1 h-3"
                        >
                          {entry.setup}
                        </Badge>
                        <span className={cn('text-[10px] font-medium', getDecisionColor(entry.decision))}>
                          {entry.decision}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono">
                          {entry.confidence.score_0_100}%
                        </span>
                        {expandedEntryId === entry.candidate_id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </div>

                    {expandedEntryId === entry.candidate_id && (
                      <div className="mt-2 space-y-1 text-[9px]">
                        {/* Why */}
                        <div>
                          <span className="text-muted-foreground">Reasons:</span>
                          <ul className="list-disc list-inside mt-0.5">
                            {entry.why.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Risk flags */}
                        {entry.risk_flags.length > 0 && (
                          <div className="text-yellow-500">
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {entry.risk_flags.join(' • ')}
                          </div>
                        )}

                        {/* Execution hint */}
                        {entry.execution_hint && (
                          <div className="p-1.5 bg-muted/30 rounded text-[8px]">
                            <div className="flex items-center gap-2">
                              <Target className="h-3 w-3 text-blue-400" />
                              <span>{entry.execution_hint.entry_logic}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Shield className="h-3 w-3 text-red-400" />
                              <span>{entry.execution_hint.stop_logic}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Trades Tab */}
        <TabsContent value="trades" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {!tradeHook.lastResponse?.trade_management?.length ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                <Activity className="h-5 w-5 mb-1 opacity-50" />
                <p className="text-[10px]">No trade reviews yet</p>
                <p className="text-[9px]">Waiting for open positions...</p>
              </div>
            ) : (
              <div className="space-y-1 p-1">
                {tradeHook.lastResponse.trade_management.map((tm) => (
                  <div
                    key={tm.trade_id}
                    className="p-2 rounded border bg-card cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedTradeId(
                      expandedTradeId === tm.trade_id ? null : tm.trade_id
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn('text-[8px] px-1 h-3', getCategoryColor(tm.category))}>
                          {tm.category}
                        </Badge>
                        <span className="text-[10px] font-mono">
                          {tm.trade_id.slice(0, 8)}...
                        </span>
                        {tm.actions && tm.actions.length > 0 && (
                          <Badge variant="secondary" className="text-[7px] px-1 h-3">
                            {tm.actions.length} action(s)
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge
                          className={cn('text-[8px] px-1 h-3',
                            tm.review.progress_assessment === 'GOOD' ? 'text-green-500 bg-green-500/10' :
                            tm.review.progress_assessment === 'STALLING' ? 'text-yellow-500 bg-yellow-500/10' :
                            'text-red-500 bg-red-500/10'
                          )}
                        >
                          {tm.review.progress_assessment}
                        </Badge>
                        {expandedTradeId === tm.trade_id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </div>

                    {/* Risk snapshot mini */}
                    <div className="flex items-center gap-2 mt-1 text-[8px] text-muted-foreground">
                      <span className={tm.risk_snapshot.unrealized_pnl_usd && tm.risk_snapshot.unrealized_pnl_usd >= 0 ? 'text-green-500' : 'text-red-500'}>
                        P&L: ${tm.risk_snapshot.unrealized_pnl_usd?.toFixed(2) || '0'}
                      </span>
                      <span>Age: {Math.floor((tm.risk_snapshot.age_sec || 0) / 60)}m</span>
                      <span>MFE: ${tm.risk_snapshot.mfe_usd?.toFixed(2) || '0'}</span>
                    </div>

                    {expandedTradeId === tm.trade_id && (
                      <div className="mt-2 space-y-1 text-[9px]">
                        {/* Management thesis */}
                        <div className="p-1.5 bg-muted/30 rounded">
                          <span className="text-muted-foreground">Thesis:</span>
                          <p className="mt-0.5">{tm.management_thesis.summary}</p>
                        </div>

                        {/* Actions */}
                        {tm.actions && tm.actions.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Proposed Actions:</span>
                            <div className="space-y-1 mt-1">
                              {tm.actions.map((action, i) => (
                                <div key={i} className="flex items-center gap-2 p-1 bg-primary/10 rounded">
                                  <Zap className="h-3 w-3 text-primary" />
                                  <span className="font-medium">{action.type}</span>
                                  <span className="text-muted-foreground text-[8px]">
                                    {action.payload.reason}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Progress notes */}
                        {tm.review.progress_notes.length > 0 && (
                          <div className="text-muted-foreground">
                            {tm.review.progress_notes.map((note, i) => (
                              <p key={i}>• {note}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
