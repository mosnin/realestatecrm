import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ContactTable } from '@/components/contacts/contact-table';
import { PerformanceStrip } from '@/components/contacts/performance-strip';
import { ContactsQuickCapture } from '@/components/experience/contacts-quick-capture';
import type { DealMetricRow, StageMetricRow } from '@/lib/deal-metrics';

/**
 * Read-only fetch of the realtor's own deals + stages for the performance
 * strip. Mirrors the deals page query (Deal/DealStage scoped to spaceId) but
 * pulls the whole book — every stage, every deal — because this strip reports
 * the realtor's overall output, not a single pipeline. Never writes.
 *
 * Failures are non-fatal: a throw returns empty arrays, the metric functions
 * return null, and the strip renders calm empty states instead of breaking
 * the page.
 */
async function loadPerformanceData(spaceId: string): Promise<{
  deals: DealMetricRow[];
  stages: StageMetricRow[];
  unavailable: boolean;
}> {
  try {
    const [{ data: dealRows, error: dealError }, { data: stageRows, error: stageError }] = await Promise.all([
      supabase
        .from('Deal')
        .select('id, status, stageId, createdAt, closedAt, stageChangedAt')
        .eq('spaceId', spaceId),
      supabase
        .from('DealStage')
        .select('id, name')
        .eq('spaceId', spaceId)
        .order('position', { ascending: true }),
    ]);
    if (dealError || stageError) {
      throw new Error(dealError?.message ?? stageError?.message ?? 'performance_query_failed');
    }
    return {
      deals: (dealRows ?? []) as DealMetricRow[],
      stages: (stageRows ?? []) as StageMetricRow[],
      unavailable: false,
    };
  } catch (err) {
    console.error('[contacts] performance fetch failed', err);
    return { deals: [], stages: [], unavailable: true };
  }
}

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  // Middleware only requires login; ownership of /s/[slug] is enforced here.
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  const { deals, stages, unavailable } = await loadPerformanceData(space.id);

  // The client component remains the single source of truth for contacts,
  // filters, selection, saved views, import, and all mutations. The server
  // hands its real pipeline summary into the header-to-directory flow so the
  // order is title → quiet paper facts → one dense records surface.
  return (
    <div
      className="chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full max-w-6xl pb-12 pt-3 sm:pt-5"
      data-contacts-overview="premium"
    >
      <ContactTable
        slug={slug}
        openCreateForm={sp.new === 'contact'}
        summary={<PerformanceStrip deals={deals} stages={stages} unavailable={unavailable} />}
      />
      {/* Floating quick-capture dock — jot a thought without leaving the list. */}
      <ContactsQuickCapture slug={slug} />
    </div>
  );
}
