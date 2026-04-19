'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Clock, AlertCircle, Lightbulb, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface ActivityContact {
  id: string;
  name: string;
}

interface ActivityDeal {
  id: string;
  title: string;
}

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

interface Props {
  slug: string;
}

const OUTCOME_CONFIG = {
  completed: {
    icon: CheckCircle2,
    className: 'text-emerald-500',
    label: 'Completed',
  },
  queued_for_approval: {
    icon: Clock,
    className: 'text-amber-500',
    label: 'Awaiting approval',
  },
  suggested: {
    icon: Lightbulb,
    className: 'text-blue-500',
    label: 'Suggested',
  },
  failed: {
    icon: AlertCircle,
    className: 'text-destructive',
    label: 'Failed',
  },
} as const;

function formatAgentType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatActionType(t: string) {
  return t.replace(/_/g, ' ');
}

export function AgentActivityFeed({ slug }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/activity?limit=50`);
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Bot size={22} />
        </div>
        <div>
          <p className="font-medium text-foreground">No activity yet</p>
          <p className="text-sm mt-0.5">Agent actions will appear here once the agent runs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const config = OUTCOME_CONFIG[entry.outcome] ?? OUTCOME_CONFIG.completed;
        const Icon = config.icon;
        const isLast = i === entries.length - 1;

        return (
          <div key={entry.id} className="flex gap-3 group">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5', config.className)}>
                <Icon size={13} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
            </div>

            {/* Content */}
            <div className={cn('pb-4 min-w-0 flex-1', isLast && 'pb-0')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    {formatActionType(entry.actionType)}
                    {entry.Contact && (
                      <span className="text-muted-foreground font-normal"> · {entry.Contact.name}</span>
                    )}
                    {entry.Deal && (
                      <span className="text-muted-foreground font-normal"> · {entry.Deal.title}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatAgentType(entry.agentType)} · {config.label}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0 mt-0.5">
                  {timeAgo(entry.createdAt)}
                </span>
              </div>

              {entry.reasoning && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {entry.reasoning}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
