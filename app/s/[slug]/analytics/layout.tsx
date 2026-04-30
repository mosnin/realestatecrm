import type { Metadata } from 'next';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';

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
    <div className="space-y-6 max-w-[1120px]">
      <header>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Analytics
        </h1>
      </header>
      <AnalyticsTabs slug={slug} />
      {children}
    </div>
  );
}
