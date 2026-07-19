import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { H1, TITLE_FONT } from '@/lib/typography';
import { DripClient } from '@/components/drip/drip-client';
import type { DripSequenceUI, EnrollmentCounts } from '@/components/drip/types';
import { emptyCounts } from '@/components/drip/types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface EnrollmentCountRow {
  sequenceId: string;
  status: 'enrolled' | 'completed' | 'stopped';
}

/**
 * Server component: the caller's drip sequences + a live enrolled/completed/
 * stopped count per sequence, handed to the client island (DripClient) for
 * the interactive list/builder/enrollment-view experience. The outer
 * /s/[slug] layout already gates on space ownership, so this only resolves
 * the space and reads its OWN spaceId-scoped rows (mirrors
 * app/s/[slug]/reviews/page.tsx).
 */
export default async function DripSequencesPage({ params }: PageProps) {
  const { slug } = await params;

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: sequenceRows }, { data: enrollmentRows }] = await Promise.all([
    supabase
      .from('DripSequence')
      .select('id, name, active, steps, createdAt, updatedAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false }),
    supabase
      .from('DripEnrollment')
      .select('sequenceId, status')
      .eq('spaceId', space.id),
  ]);

  const sequences = (sequenceRows ?? []) as unknown as DripSequenceUI[];
  const enrollments = (enrollmentRows ?? []) as unknown as EnrollmentCountRow[];

  const counts: Record<string, EnrollmentCounts> = {};
  for (const seq of sequences) counts[seq.id] = emptyCounts();
  for (const e of enrollments) {
    const bucket = counts[e.sequenceId] ?? emptyCounts();
    bucket[e.status] += 1;
    counts[e.sequenceId] = bucket;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Automations.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Drip sequences
        </h1>
        <p className="text-sm text-muted-foreground">
          Scripted nurture cadences — each step schedules a message via your normal
          drafting/sending settings, and a sequence stops the moment a contact replies.
        </p>
      </header>

      <DripClient slug={slug} initialSequences={sequences} initialCounts={counts} />
    </div>
  );
}
