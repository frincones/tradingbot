'use client';

import { Button } from '@kit/ui/button';
import { RefreshCw, Bot, FileText } from 'lucide-react';
import Link from 'next/link';

export function QuickActions() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleRefresh}>
        <RefreshCw className="h-4 w-4 mr-1" />
        Refresh
      </Button>
      <Link href="/home/trading/agents">
        <Button variant="outline" size="sm">
          <Bot className="h-4 w-4 mr-1" />
          AI Agents
        </Button>
      </Link>
      <Link href="/home/trading/reports">
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1" />
          Reports
        </Button>
      </Link>
    </div>
  );
}
