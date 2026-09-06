import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AutomationsHub } from '@/components/workflows/automations-hub';
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
 * /automations — standing orders in one place.
 * When something happens, or on a schedule. You pick draft or send
 * (permission mode) per automation. No tour, no bazaar, no two-column split.
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

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  let countsAvailable = true;
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
    if ([workflows, activeWorkflows, routines, activeRoutines].some(result => result.error)) throw new Error('Automation counts unavailable');
    workflowCount = workflows.count ?? 0;
    activeWorkflowCount = activeWorkflows.count ?? 0;
    routineCount = routines.count ?? 0;
    activeRoutineCount = activeRoutines.count ?? 0;
  } catch (err) {
    countsAvailable = false;
    console.error('[automations] count query failed', err);
  }

  const on = activeWorkflowCount + activeRoutineCount;
  const paused = Math.max(0, workflowCount + routineCount - on);

  return (
    <SupportingPage family="operations" width="content">
      <SupportingOrientation
        family="operations"
        layout="stacked"
        eyebrow="Automations"
        title="Automations"
        summary="Respond and follow up on the triggers you choose. Each automation shows whether it sends or prepares work for review."
        nextAction={
          workflowCount + routineCount === 0
            ? 'Start with one real moment you already handle by hand every week.'
            : 'Read what the live ones do, then turn one on.'
        }
        action={
          <a
            href="?new=1#workflows"
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            New
          </a>
        }
      />

      <SupportingMetricBand>
        <SupportingMetric label="On" value={countsAvailable ? on : 'Unavailable'} detail="enabled" accent />
        <SupportingMetric label="Paused" value={countsAvailable ? paused : 'Unavailable'} detail="paused" />
      </SupportingMetricBand>

      <SupportingWorkArea>
        <Suspense fallback={null}>
          <AutomationsHub />
        </Suspense>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
