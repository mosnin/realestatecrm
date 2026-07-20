import type { Metadata } from 'next';
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs';
import { H1, TITLE_FONT, SECTION_RHYTHM } from '@/lib/typography';
import { SplitReveal } from '@/components/motion';

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
    <div className={`${SECTION_RHYTHM} max-w-5xl mx-auto pb-12`}>
      <header>
        <h1 className={H1} style={TITLE_FONT}>
          <SplitReveal as="span" text="Analytics" by="word" />
        </h1>
      </header>
      <AnalyticsTabs slug={slug} />
      {children}
    </div>
  );
}
