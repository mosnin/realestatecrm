import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
import type { CustomAgent, SwarmRun, SwarmStatus } from '@/lib/swarm-types';
import { SwarmLaunchForm } from '@/components/swarm/swarm-launch-form';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type StatusConfig = { dot: string; label: string; badge: string };

function statusConfig(status: SwarmStatus): StatusConfig {
  switch (status) {
    case 'completed':
      return {
        dot: 'bg-emerald-500',
        label: 'Completed',
        badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
      };
    case 'failed':
      return {
        dot: 'bg-rose-500',
        label: 'Failed',
        badge: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
      };
    case 'running':
    case 'planning':
    case 'auditing':
      return {
        dot: 'bg-blue-500',
        label: status.charAt(0).toUpperCase() + status.slice(1),
        badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
      };
    case 'cancelled':
      return {
        dot: 'bg-muted-foreground/40',
        label: 'Cancelled',
        badge: 'bg-muted text-muted-foreground',
      };
    case 'queued':
    default:
      return {
        dot: 'bg-muted-foreground/40',
        label: 'Queued',
        badge: 'bg-muted text-muted-foreground',
      };
  }
}

// ── Recent runs list ──────────────────────────────────────────────────────────

function RecentRunsList({ runs, slug }: { runs: SwarmRun[]; slug: string }) {
  if (runs.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className={cn(SECTION_LABEL)}>Recent runs</p>
      <ul className="divide-y divide-border/60">
        {runs.map((run) => {
          const cfg = statusConfig(run.status);
          const goal =
            run.goal.length > 60 ? run.goal.slice(0, 60) + '…' : run.goal;

          return (
            <li key={run.id}>
              <Link
                href={`/s/${slug}/swarm/${run.id}`}
                className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-md hover:bg-muted/30 transition-colors"
              >
                {/* Status badge */}
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0',
                    cfg.badge
                  )}
                >
                  <span className={cn('size-1.5 rounded-full flex-shrink-0', cfg.dot)} />
                  {cfg.label}
                </span>

                {/* Goal */}
                <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                  {goal}
                </p>

                {/* Relative time */}
                <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
                  {relativeTime(run.createdAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SwarmPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Parallel fetch: active custom agents + recent swarm runs.
  const [{ data: agentsData }, { data: runsData }] = await Promise.all([
    supabase
      .from('CustomAgent')
      .select('*')
      .eq('spaceId', space.id)
      .eq('isActive', true),
    supabase
      .from('SwarmRun')
      .select('*')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(10),
  ]);

  const agents = (agentsData ?? []) as CustomAgent[];
  const runs = (runsData ?? []) as SwarmRun[];
  const liveRuns = runs.filter((run) => ['running', 'planning', 'auditing', 'queued'].includes(run.status)).length;
  const completedRuns = runs.filter((run) => run.status === 'completed').length;
  const failedRuns = runs.filter((run) => run.status === 'failed').length;

  return (
    <SupportingPage family="coordination" width="wide">
      <SupportingOrientation
        family="coordination"
        eyebrow="Workforce / Coordinated run"
        title="Give the team one outcome to own"
        summary={`${agents.length} active specialists are available. ${liveRuns} ${liveRuns === 1 ? 'run is' : 'runs are'} currently in motion.`}
        nextAction={agents.length < 2 ? 'Add another specialist before launching work that truly benefits from parallel ownership.' : 'Describe the finished outcome, constraints, and evidence the coordinator must return.'}
        action={<SupportingActionLink href="#swarm-launch">Launch coordinated work</SupportingActionLink>}
      />
      <SupportingMetricBand>
        <SupportingMetric label="Specialists" value={agents.length} detail="available for selection" />
        <SupportingMetric label="In motion" value={liveRuns} detail="queued or active" accent />
        <SupportingMetric label="Completed" value={completedRuns} detail="recent outcomes" />
        <SupportingMetric label="Needs attention" value={failedRuns} detail="recent failed runs" />
      </SupportingMetricBand>

      <SupportingWorkArea className="grid gap-10 lg:grid-cols-[minmax(0,0.62fr)_minmax(18rem,0.38fr)] lg:items-start">
      <div id="swarm-launch" className="chippi-dashboard-panel scroll-mt-24 rounded-[2rem] border-l-2 border-l-foreground p-6 sm:p-8">
        <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Define the mission</p>
        <SwarmLaunchForm availableAgents={agents} slug={slug} spaceId={space.id} />
      </div>

      {/* Recent runs — only rendered when runs exist */}
      <div className="lg:sticky lg:top-8"><RecentRunsList runs={runs} slug={slug} /></div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
