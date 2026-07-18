import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { H1, TITLE_FONT } from '@/lib/typography';
import { SurfaceCard, SurfaceCardHeader, StatusPill } from '@/components/ui/surface-card';

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface SequenceRow {
  id: string;
  name: string;
  active: boolean;
  steps: Array<{ dayOffset: number; channel: string; instruction: string }>;
  createdAt: string;
}

interface EnrollmentCountRow {
  sequenceId: string;
  status: 'enrolled' | 'completed' | 'stopped';
}

/**
 * Read-only drip sequence overview: the caller's own sequences, each with a
 * live enrolled/completed/stopped count. The outer /s/[slug] layout already
 * gates on space ownership, so this server component only resolves the
 * space and reads its OWN spaceId-scoped rows — no auth/ownership logic is
 * re-derived here (mirrors app/s/[slug]/reviews/page.tsx).
 *
 * Honest empty state: no sequences yet renders a plain explanation, never a
 * fabricated example row.
 */
export default async function DripSequencesPage({ params }: PageProps) {
  const { slug } = await params;

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: sequenceRows }, { data: enrollmentRows }] = await Promise.all([
    supabase
      .from('DripSequence')
      .select('id, name, active, steps, createdAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false }),
    supabase
      .from('DripEnrollment')
      .select('sequenceId, status')
      .eq('spaceId', space.id),
  ]);

  const sequences = (sequenceRows ?? []) as unknown as SequenceRow[];
  const enrollments = (enrollmentRows ?? []) as unknown as EnrollmentCountRow[];

  const countsBySequence = new Map<string, { enrolled: number; completed: number; stopped: number }>();
  for (const e of enrollments) {
    const bucket = countsBySequence.get(e.sequenceId) ?? { enrolled: 0, completed: 0, stopped: 0 };
    bucket[e.status] += 1;
    countsBySequence.set(e.sequenceId, bucket);
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

      {sequences.length === 0 ? (
        <SurfaceCard>
          <SurfaceCardHeader title="No drip sequences yet" />
          <p className="mt-3 text-sm text-muted-foreground">
            Create one with a name and a list of timed steps (day offset, channel, instruction) via
            the API, then enroll contacts into it. Nothing is scheduled until a sequence exists and a
            contact is enrolled.
          </p>
        </SurfaceCard>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const counts = countsBySequence.get(seq.id) ?? { enrolled: 0, completed: 0, stopped: 0 };
            return (
              <SurfaceCard key={seq.id}>
                <SurfaceCardHeader
                  title={seq.name}
                  action={<StatusPill>{seq.active ? 'active' : 'paused'}</StatusPill>}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {seq.steps.length} step{seq.steps.length === 1 ? '' : 's'}
                  {seq.steps.length > 0 && (
                    <>
                      {' — '}
                      {seq.steps
                        .map((s) => `day ${s.dayOffset} (${s.channel})`)
                        .join(', ')}
                    </>
                  )}
                </p>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className="text-foreground">{counts.enrolled} enrolled</span>
                  <span className="text-muted-foreground">{counts.completed} completed</span>
                  <span className="text-muted-foreground">{counts.stopped} stopped</span>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
