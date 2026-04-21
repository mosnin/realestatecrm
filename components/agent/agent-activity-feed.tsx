'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, Clock, AlertCircle, Lightbulb, Bot, Loader2,
  User, Briefcase,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Convert snake_case action type to a human-readable sentence
const ACTION_LABELS: Record<string, string> = {
  create_draft_message: 'Drafted message',
  set_contact_follow_up: 'Scheduled follow-up',
  set_deal_follow_up: 'Scheduled deal follow-up',
  log_agent_observation: 'Logged observation',
  update_lead_score: 'Updated lead score',
  update_deal_probability: 'Updated deal probability',
  create_follow_up_reminder: 'Created reminder',
  log_observation: 'Logged observation',
  store_memory: 'Stored insight',
};

function formatActionType(t: string): string {
  return ACTION_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const AGENT_LABELS: Record<string, string> = {
  lead_nurture: 'Lead Nurture',
  deal_sentinel: 'Deal Sentinel',
  long_term_nurture: 'Long-term Nurture',
};

function formatAgentType(t: string): string {
  return AGENT_LABELS[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── types ────────────────────────────────────────────────────────────────────

interface ActivityContact { id: string; name: string; }
interface ActivityDeal { id: string; title: string; }

interface ActivityEntry {
  id: string;
  runId: string;
  agentType: string;
  actionType: string;
  reasoning: string | null;
  outcome: 'completed' | 'queued_for_approval' | 'suggested' | 'failed';
  relatedContactId: string | null;
  relatedDealId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  Contact: ActivityContact | null;
  Deal: ActivityDeal | null;
}

interface RunGroup {
  runId: string;
  agentType: string;
  entries: ActivityEntry[];
  startedAt: string;
}

interface Props { slug: string; }

type Filter = 'all' | 'completed' | 'queued_for_approval' | 'failed';

// ─── outcome config ───────────────────────────────────────────────────────────

const OUTCOME_CONFIG = {
  completed: {
    icon: CheckCircle2,
    dotClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
    label: 'Done',
  },
  queued_for_approval: {
    icon: Clock,
    dotClass: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
    label: 'Awaiting approval',
  },
  suggested: {
    icon: Lightbulb,
    dotClass: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
    label: 'Suggested',
  },
  failed: {
    icon: AlertCircle,
    dotClass: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',
    label: 'Failed',
  },
} as const;

// ─── RunGroup component ───────────────────────────────────────────────────────

function RunGroupCard({ group, slug }: { group: RunGroup; slug: string }) {
  const completedCount = group.entries.filter((e) => e.outcome === 'completed').length;
  const draftCount = group.entries.filter((e) => e.outcome === 'queued_for_approval').length;
  const failedCount = group.entries.filter((e) => e.outcome === 'failed').length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Run header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Bot size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {formatAgentType(group.agentType)}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{group.entries.length} action{group.entries.length !== 1 ? 's' : ''}</span>
          {completedCount > 0 && (
            <span className="text-[11px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 font-medium px-1.5 py-0.5 rounded-full">
              {completedCount} done
            </span>
          )}
          {draftCount > 0 && (
            <span className="text-[11px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded-full">
              {draftCount} draft{draftCount !== 1 ? 's' : ''}
            </span>
          )}
          {failedCount > 0 && (
            <span className="text-[11px] bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 font-medium px-1.5 py-0.5 rounded-full">
              {failedCount} failed
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">{timeAgo(group.startedAt)}</span>
      </div>

      {/* Entries */}
      <div className="divide-y divide-border/50">
        {group.entries.map((entry) => {
          const cfg = OUTCOME_CONFIG[entry.outcome] ?? OUTCOME_CONFIG.completed;
          const Icon = cfg.icon;

          return (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', cfg.dotClass)}>
                <Icon size={12} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{formatActionType(entry.actionType)}</span>

                  {/* Contact link */}
                  {entry.Contact && (
                    <Link
                      href={`/s/${slug}/contacts/${entry.Contact.id}`}
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline underline-offset-2"
                    >
                      <User size={10} />
                      {entry.Contact.name}
                    </Link>
                  )}

                  {/* Deal link */}
                  {entry.Deal && (
                    <Link
                      href={`/s/${slug}/deals`}
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline underline-offset-2"
                    >
                      <Briefcase size={10} />
                      {entry.Deal.title}
                    </Link>
                  )}

                  <span className="text-[11px] text-muted-foreground ml-auto flex-shrink-0">{cfg.label}</span>
                </div>

                {entry.reasoning && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {entry.reasoning}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'queued_for_approval', label: 'Awaiting approval' },
  { key: 'failed', label: 'Failed' },
];

export function AgentActivityFeed({ slug }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/activity?limit=100');
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.outcome === filter);

  // Group consecutive entries by runId, preserving chronological order
  const runs: RunGroup[] = [];
  for (const entry of filtered) {
    const last = runs[runs.length - 1];
    if (last && last.runId === entry.runId) {
      last.entries.push(entry);
    } else {
      runs.push({
        runId: entry.runId,
        agentType: entry.agentType,
        entries: [entry],
        startedAt: entry.createdAt,
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((n) => <div key={n} className="h-28 rounded-xl bg-muted/40 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'all' ? entries.length : entries.filter((e) => e.outcome === key).length;
          if (key !== 'all' && count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
                filter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span className={cn('text-[10px] rounded-full px-1', filter === key ? 'bg-primary-foreground/20' : 'bg-background/60')}>
                {count}
              </span>
            </button>
          );
        })}
        <Button variant="ghost" size="sm" onClick={load} className="h-7 text-xs gap-1.5 ml-auto">
          <Loader2 size={11} className={loading ? 'animate-spin' : 'hidden'} />
          Refresh
        </Button>
      </div>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Bot size={24} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Agent actions will appear here as it monitors your leads and deals.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((group) => (
            <RunGroupCard key={group.runId} group={group} slug={slug} />
          ))}
        </div>
      )}
    </div>
  );
}
