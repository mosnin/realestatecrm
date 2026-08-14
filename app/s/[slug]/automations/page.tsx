import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { WorkflowsManager } from '@/components/workflows/workflows-manager';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { TrustLadderBanner } from '@/components/workflows/trust-ladder-banner';
import { AutomationsIntro } from '@/components/workflows/automations-intro';
import { BODY_MUTED, H1, TITLE_FONT, SECTION_LABEL, CAPTION } from '@/lib/typography';
import {
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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

  let workflowCount = 0;
  let activeWorkflowCount = 0;
  let routineCount = 0;
  let activeRoutineCount = 0;
  try {
    const [workflows, activeWorkflows, routines, activeRoutines] = await Promise.all([
      supabase.from('Workflow').select('*', { count: 'exact', head: true }).eq('spaceId', space.id),
      supabase.from('Workflow').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).eq('enabled', true),
      supabase.from('Routine').select('*', { count: 'exact', head: true }).eq('spaceId', space.id),
      supabase.from('Routine').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).eq('enabled', true),
    ]);
    workflowCount = workflows.count ?? 0;
    activeWorkflowCount = activeWorkflows.count ?? 0;
    routineCount = routines.count ?? 0;
    activeRoutineCount = activeRoutines.count ?? 0;
  } catch (err) {
    console.error('[automations] count query failed', err);
  }

  // Standard dashboard page frame — the outer LayoutShell already supplies the
  // 1500px max width, horizontal padding, and scroll. This page renders a
  // Deals/People-style header (serif H1 + muted status line) and its sections
  // directly, so Automations sits in the same wide data surface as the rest of
  // the app rather than the narrow chat-reading column ChippiPageShell imposes.
  // Reading surfaces (header, section labels, lists) sit in People's centered
  // max-w-5xl column; the managers themselves cap their browse chrome to the
  // same column and let only the builder/canvas working surfaces span the
  // full 1500px LayoutShell frame.
  return (
    <SupportingPage family="operations" width="full">
      <div className="mx-auto w-full max-w-6xl">
        <SupportingOrientation
          family="operations"
          eyebrow="Automation / Standing orders"
          title="Work that keeps moving after you leave"
          summary={`${activeWorkflowCount + activeRoutineCount} automations are active across event triggers and scheduled routines.`}
          nextAction={
            workflowCount + routineCount === 0
              ? 'Create one follow-up rule for a real moment that happens every week.'
              : 'Test the highest-impact automation and confirm its latest outcome before adding another.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              <a href="#workflows" className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background">New event workflow</a>
              <a href="#routines" className="inline-flex h-10 items-center rounded-full border chippi-dashboard-divider px-5 text-sm font-medium text-foreground">New routine</a>
            </div>
          }
        />

        <SupportingMetricBand>
          <SupportingMetric label="Event workflows" value={workflowCount} detail="all rules" />
          <SupportingMetric label="Active workflows" value={activeWorkflowCount} detail="listening now" accent />
          <SupportingMetric label="Scheduled routines" value={routineCount} detail="all schedules" />
          <SupportingMetric label="Active routines" value={activeRoutineCount} detail="queued to run" />
        </SupportingMetricBand>
      </div>

      <SupportingWorkArea className="mx-auto w-full max-w-6xl space-y-10">
        <TrustLadderBanner />

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1.18fr)_minmax(22rem,0.82fr)] xl:items-start">
          <section id="workflows" className="scroll-mt-24 space-y-4">
            <div className="space-y-1 border-b chippi-dashboard-divider pb-4">
              <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground">When something changes</h2>
              <p className={CAPTION}>A new lead, an inbound reply, or a deal moving stage starts the work.</p>
            </div>
            <Suspense fallback={null}>
              <WorkflowsManager />
            </Suspense>
          </section>

          <section id="routines" className="scroll-mt-24 space-y-4 xl:border-l xl:border-border/60 xl:pl-8">
            <div className="space-y-1 border-b chippi-dashboard-divider pb-4">
              <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground">On a recurring beat</h2>
              <p className={CAPTION}>Morning prep, weekday follow-up, and every schedule you want Chippi to keep.</p>
            </div>
            <RoutinesManager apiBase="/api/routines" />
          </section>
        </div>
      </SupportingWorkArea>

      {/* First-visit feature tour — self-dismissing, persisted per browser. */}
      <AutomationsIntro />
    </SupportingPage>
  );
}
