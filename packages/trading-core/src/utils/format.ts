/**
 * Format Utilities
 * Functions for formatting trading data
 */

/**
 * Format USD amount
 */
export function formatUsd(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format price with appropriate decimals
 */
export function formatPrice(price: number, decimals = 2): string {
  if (price >= 1000) {
    return formatUsd(price, 2);
  } else if (price >= 1) {
    return formatUsd(price, 4);
  } else {
    return formatUsd(price, 8);
  }
}

/**
 * Format quantity
 */
export function formatQuantity(qty: number, decimals = 8): string {
  return qty.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format PnL with color class
 */
export function formatPnL(value: number): { text: string; color: string } {
  const text = formatUsd(value);
  const color = value >= 0 ? 'text-green-500' : 'text-red-500';
  return { text, color };
}

/**
 * Format date/time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Format large numbers with K/M/B suffixes
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `${(value / 1e9).toFixed(1)}B`;
  } else if (Math.abs(value) >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  } else if (Math.abs(value) >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format order side
 */
export function formatSide(side: 'buy' | 'sell'): { text: string; color: string } {
  return side === 'buy'
    ? { text: 'BUY', color: 'text-green-500' }
    : { text: 'SELL', color: 'text-red-500' };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Format wallet address
 */
export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

