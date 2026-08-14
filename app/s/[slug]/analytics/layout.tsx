import type { Metadata } from 'next';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';
import { SupportingPage } from '../_components/supporting-page';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <SupportingPage family="intelligence" width="wide" className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Performance intelligence
        </p>
        <p className="hidden text-xs text-muted-foreground sm:block">Live from your workspace</p>
      </div>
      <AnalyticsTabs slug={slug} />
      {children}
    </SupportingPage>
  );
}
