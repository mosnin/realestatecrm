import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { fetchRawAnalyticsData, buildOverviewData } from '@/lib/analytics-data';
import { OverviewView } from '@/components/analytics/overview-view';

export default async function AnalyticsOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  try {
    const raw = await fetchRawAnalyticsData(space.id);
    const data = buildOverviewData(raw);
    return <OverviewView data={data} />;
  } catch (err) {
    console.error('[analytics/overview] DB queries failed', err);
    return <AnalyticsErrorBlock href={`/s/${slug}/analytics`} />;
  }
}

function AnalyticsErrorBlock({ href }: { href: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3">
      <p
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        Something went wrong
      </p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load your data. This is usually temporary.
      </p>
      <a
        href={href}
        className="bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] rounded-full px-4 h-9 gap-1.5 inline-flex items-center transition-all duration-150 text-sm"
      >
        Try again
      </a>
    </div>
  );
}
