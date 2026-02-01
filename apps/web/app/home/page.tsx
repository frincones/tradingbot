'use client';

import dynamic from 'next/dynamic';

import { PageBody, PageHeader } from '@kit/ui/page';
import { LoadingOverlay } from '@kit/ui/loading-overlay';

// Dynamically import KPI Dashboard (client component with hooks)
const KPIDashboard = dynamic(
  () => import('./_components/kpis').then((mod) => mod.KPIDashboard),
  {
    ssr: false,
    loading: () => (
      <LoadingOverlay>
        <span className="text-muted-foreground">Loading KPIs...</span>
      </LoadingOverlay>
    ),
  }
);

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Trading Reports"
        description="Real-time KPIs and performance metrics"
      />

      <PageBody className="overflow-auto">
        <KPIDashboard />
      </PageBody>
    </>
  );
}
