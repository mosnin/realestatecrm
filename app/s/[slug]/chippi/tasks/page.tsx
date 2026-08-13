import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { SECTION_LABEL } from '@/lib/typography';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

interface AgentTask {
  id: string;
  spaceId: string;
  title: string;
  goalDescription: string | null;
  status: TaskStatus;
  estimatedCostUsd: number;
  createdAt: string;
  completedAt: string | null;
}

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

function statusBadge(status: TaskStatus) {
  const map: Record<TaskStatus, { label: string; classes: string }> = {
    queued:    { label: 'Queued',    classes: 'border-border text-muted-foreground' },
    running:   { label: 'Running',   classes: 'border-transparent bg-foreground/[0.06] text-foreground/75' },
    completed: { label: 'Completed', classes: 'border-border text-muted-foreground' },
    failed:    { label: 'Failed',    classes: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400' },
    cancelled: { label: 'Cancelled', classes: 'border-border/70 text-muted-foreground/60' },
    paused:    { label: 'Paused',    classes: 'border-border text-muted-foreground' },
  };
  const { label, classes } = map[status] ?? map.queued;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide', classes)}>
      {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
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

  const rawPage = Number((await searchParams).page ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 50;
  const { data: tasks, error, count } = await supabase
    .from('AgentTask')
    .select('*', { count: 'exact' })
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[chippi/tasks] query error:', error);
    return (
      <ChippiPageShell
        greeting="Tasks."
        title="Something went wrong."
        subtitle="We couldn't load your tasks. This is usually temporary."
      >
        <div>
          <a
            href={`/s/${slug}/chippi/tasks`}
            className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Try again
          </a>
        </div>
      </ChippiPageShell>
    );
  }

  const taskList = (tasks ?? []) as AgentTask[];

  return (
    <ChippiPageShell
      greeting="Tasks."
      title="Agent Tasks"
      subtitle="Long-running goals Chippi is working on."
    >
      <div className="space-y-3" data-chippi-secondary-page="tasks">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
          <p className={SECTION_LABEL}>
            Recent work{taskList.length > 0 ? ` · ${taskList.length}` : ''}
          </p>
          <Link
            href={`/s/${slug}/chippi`}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to Chippi
          </Link>
        </div>

        {/* Task list */}
        {taskList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No tasks yet. Ask Chippi to work on a complex goal and it will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {taskList.map((task) => {
              const goal = task.goalDescription ?? task.title;
              const truncated = goal.length > 120 ? goal.slice(0, 120) + '…' : goal;
              const cost = typeof task.estimatedCostUsd === 'number' ? task.estimatedCostUsd : Number(task.estimatedCostUsd);

              return (
                <li key={task.id}>
                  <Link
                    href={`/s/${slug}/chippi/tasks/${task.id}`}
                    className="group/row -mx-2 flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex-shrink-0 pt-0.5">
                      {statusBadge(task.status)}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium leading-snug text-foreground">{truncated}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {relativeTime(task.createdAt)}
                        {cost > 0 && (
                          <span className="ml-3">${cost.toFixed(2)}</span>
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {(page > 1 || (count ?? 0) > page * pageSize) && (
          <nav aria-label="Task pages" className="flex items-center justify-between border-t border-border/60 pt-4">
            {page > 1 ? (
              <Link href={`/s/${slug}/chippi/tasks?page=${page - 1}`} className="text-xs text-muted-foreground hover:text-foreground">
                Newer tasks
              </Link>
            ) : <span />}
            {(count ?? 0) > page * pageSize && (
              <Link href={`/s/${slug}/chippi/tasks?page=${page + 1}`} className="text-xs text-muted-foreground hover:text-foreground">
                Older tasks
              </Link>
            )}
          </nav>
        )}
      </div>
    </ChippiPageShell>
  );
}
