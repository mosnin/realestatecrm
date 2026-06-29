import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { WorkflowsManager } from '@/components/workflows/workflows-manager';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { TrustLadderBanner } from '@/components/workflows/trust-ladder-banner';
import { SECTION_LABEL, CAPTION } from '@/lib/typography';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automations — Chippi' };

/**
 * /automations — ONE home for everything Chippi runs on its own.
 *
 * Workflows (when something happens) and Routines (on a schedule) were two
 * separate destinations for the same idea: standing orders. This hub unifies
 * them under one vocabulary and one page — two clearly-labelled sections, each
 * embedding its existing manager — so a realtor holds a single concept instead
 * of two. The old /workflows and /routines routes redirect here; the activity
 * feed deep-links land on the matching section anchor.
 */
export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Ownership gate — mirror the other /chippi/* sub-pages: the signed-in
  // Clerk user must own this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Automations."
      title="Things I run on my own."
      subtitle="Standing orders — every run drafts, nothing goes out without your tap. Set them to run when something happens, or on a schedule."
    >
      <div className="space-y-10">
        {/* Earned-autonomy nudge — shows only when the realtor's real draft
            track record has earned it; silent otherwise. */}
        <TrustLadderBanner />

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className={SECTION_LABEL}>When something happens</h2>
            <p className={CAPTION}>
              React to an event — a new lead, a reply, a deal moving stage.
            </p>
          </div>
          <Suspense fallback={null}>
            <WorkflowsManager />
          </Suspense>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className={SECTION_LABEL}>On a schedule</h2>
            <p className={CAPTION}>
              A recurring beat — every morning, every weekday, every hour.
            </p>
          </div>
          <RoutinesManager apiBase="/api/routines" />
        </section>
      </div>
    </ChippiPageShell>
  );
}
