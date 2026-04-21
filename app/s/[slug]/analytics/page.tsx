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

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            High-level insights across your leads, contacts, and deals
          </p>
        </div>
        <OverviewView data={data} />
      </div>
    );
  } catch (err) {
    console.error('[analytics/overview] DB queries failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/analytics`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }
}
