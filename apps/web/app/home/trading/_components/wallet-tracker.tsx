'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { ScrollArea } from '@kit/ui/scroll-area';
import {
  Wallet,
  Search,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

interface Position {
  coin: string;
  size: number;
  side: 'long' | 'short';
  entryPrice: number;
  positionValue: number;
  unrealizedPnl: number;
  leverage: number;
}

interface WalletInfo {
  address: string;
  nickname?: string;
  accountValue: number;
  totalPosition: number;
  marginUsed: number;
  withdrawable: number;
  positions: Position[];
  recentFills: number;
  loading: boolean;
  error?: string;
}

interface Props {
  initialWallets?: string[];
}

// Shorten wallet address for display
function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletTracker({ initialWallets = [] }: Props) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Fetch wallet data
  const fetchWalletData = useCallback(async (address: string): Promise<WalletInfo> => {
    try {
      const response = await fetch(`/api/trading/market-data?type=wallet&address=${address}`);
      if (!response.ok) throw new Error('Failed to fetch wallet data');

      const data = await response.json();

      return {
        address,
        accountValue: data.state.accountValue,
        totalPosition: data.state.totalPosition,
        marginUsed: data.state.marginUsed,
        withdrawable: data.state.withdrawable,
        positions: data.state.positions,
        recentFills: data.fills?.length || 0,
        loading: false,
      };
    } catch {
      return {
        address,
        accountValue: 0,
        totalPosition: 0,
        marginUsed: 0,
        withdrawable: 0,
        positions: [],
        recentFills: 0,
        loading: false,
        error: 'Failed to load wallet',
      };
    }
  }, []);

  // Add a new wallet to track
  const addWallet = async () => {
    if (!newAddress.trim() || newAddress.length < 10) return;

    const address = newAddress.trim();

    // Check if already tracking
    if (wallets.some((w) => w.address.toLowerCase() === address.toLowerCase())) {
      setNewAddress('');
      setIsAdding(false);
      return;
    }

    // Add with loading state
    setWallets((prev) => [
      ...prev,
      {
        address,
        accountValue: 0,
        totalPosition: 0,
        marginUsed: 0,
        withdrawable: 0,
        positions: [],
        recentFills: 0,
        loading: true,
      },
    ]);
    setNewAddress('');
    setIsAdding(false);

    // Fetch data
    const walletData = await fetchWalletData(address);
    setWallets((prev) => prev.map((w) => (w.address === address ? walletData : w)));
  };

  // Remove wallet from tracking
  const removeWallet = (address: string) => {
    setWallets((prev) => prev.filter((w) => w.address !== address));
  };

  // Refresh wallet data
  const refreshWallet = async (address: string) => {
    setWallets((prev) => prev.map((w) => (w.address === address ? { ...w, loading: true } : w)));
    const walletData = await fetchWalletData(address);
    setWallets((prev) => prev.map((w) => (w.address === address ? walletData : w)));
  };

  // Copy address to clipboard
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const formatUsd = (num: number) => {
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  if (wallets.length === 0 && !isAdding) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Wallet className="h-8 w-8 mb-1 opacity-50" />
        <p className="text-xs mb-2">No wallets tracked</p>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setIsAdding(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Add wallet input */}
      {isAdding && (
        <div className="flex gap-1 p-1 border-b shrink-0">
          <Input
            placeholder="0x..."
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="h-6 text-[10px] font-mono"
            onKeyDown={(e) => e.key === 'Enter' && addWallet()}
            autoFocus
          />
          <Button size="sm" className="h-6 px-2" onClick={addWallet}>
            <Search className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setIsAdding(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1fr_0.6fr_0.6fr_0.6fr_0.4fr] gap-1 px-2 py-1 text-[9px] text-muted-foreground border-b shrink-0">
        <div className="flex items-center justify-between">
          <span>Wallet</span>
          {!isAdding && (
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setIsAdding(true)}>
              <Plus className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
        <span className="text-right">Value</span>
        <span className="text-right">Margin</span>
        <span className="text-right">Pos</span>
        <span></span>
      </div>

      {/* Wallet rows */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {wallets.map((wallet) => (
            <div
              key={wallet.address}
              className="grid grid-cols-[1fr_0.6fr_0.6fr_0.6fr_0.4fr] gap-1 px-2 py-1 items-center text-[10px] hover:bg-muted/30"
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-mono truncate">{shortenAddress(wallet.address)}</span>
                <button
                  onClick={() => copyAddress(wallet.address)}
                  className="text-muted-foreground hover:text-primary shrink-0"
                >
                  {copiedAddress === wallet.address ? (
                    <Check className="h-2.5 w-2.5 text-green-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </button>
                <a
                  href={`https://app.hyperliquid.xyz/explorer/address/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary shrink-0"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className="text-right font-mono">
                {wallet.loading ? (
                  <RefreshCw className="h-3 w-3 animate-spin inline" />
                ) : wallet.error ? (
                  <span className="text-destructive">Err</span>
                ) : (
                  formatUsd(wallet.accountValue)
                )}
              </div>
              <div className="text-right font-mono text-muted-foreground">
                {!wallet.loading && !wallet.error && (
                  `${((wallet.marginUsed / wallet.accountValue) * 100 || 0).toFixed(0)}%`
                )}
              </div>
              <div className="text-right">
                {!wallet.loading && !wallet.error && wallet.positions.length > 0 && (
                  <div className="flex items-center justify-end gap-0.5">
                    {wallet.positions.slice(0, 2).map((pos) => (
                      <Badge
                        key={pos.coin}
                        variant={pos.side === 'long' ? 'default' : 'destructive'}
                        className="text-[8px] px-0.5 py-0 h-3"
                      >
                        {pos.coin}
                      </Badge>
                    ))}
                    {wallet.positions.length > 2 && (
                      <span className="text-[8px] text-muted-foreground">+{wallet.positions.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => refreshWallet(wallet.address)}
                  disabled={wallet.loading}
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${wallet.loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-destructive"
                  onClick={() => removeWallet(wallet.address)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
