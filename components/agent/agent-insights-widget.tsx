'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentInsight {
  id: string;
  memoryType: 'fact' | 'observation';
  content: string;
  importance: number;
  entityType: 'contact' | 'deal' | 'space';
  entityId: string;
  entityName: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ImportanceBadge({ importance }: { importance: number }) {
  if (importance >= 0.7)
    return <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />;
  if (importance >= 0.4)
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />;
}

export function AgentInsightsWidget({ slug }: { slug: string }) {
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDrafts, setPendingDrafts] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [insightsRes, draftsRes] = await Promise.all([
          fetch('/api/agent/insights'),
          fetch('/api/agent/drafts?status=pending&limit=1'),
        ]);
        if (insightsRes.ok) setInsights(await insightsRes.json());
        if (draftsRes.ok) {
          const drafts = await draftsRes.json();
          setPendingDrafts(Array.isArray(drafts) ? drafts.length : 0);
        }
      } catch {
        // silently fail — widget is not critical path
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-primary animate-pulse" />
            <h2 className="text-sm font-semibold">What Your Agent Noticed</h2>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-muted mt-1.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3.5 bg-muted rounded animate-pulse" style={{ width: `${50 + i * 12}%` }} />
                <div className="h-3 bg-muted rounded animate-pulse" style={{ width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (insights.length === 0 && pendingDrafts === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-primary" />
          <h2 className="text-sm font-semibold">What Your Agent Noticed</h2>
        </div>
        <Link
          href={`/s/${slug}/agent`}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Agent hub <ArrowRight size={10} />
        </Link>
      </div>

      {/* Pending drafts callout */}
      {pendingDrafts > 0 && (
        <Link
          href={`/s/${slug}/agent?tab=inbox`}
          className="flex items-center justify-between gap-3 px-5 py-3 bg-primary/5 border-b border-border hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {pendingDrafts}
            </span>
            <div>
              <p className="text-sm font-medium">Draft{pendingDrafts !== 1 ? 's' : ''} awaiting approval</p>
              <p className="text-xs text-muted-foreground">Your agent prepared messages for your review</p>
            </div>
          </div>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        </Link>
      )}

      {insights.length === 0 ? (
        <div className="px-5 py-4 text-center">
          <p className="text-xs text-muted-foreground">No recent observations. The agent will surface insights as it runs.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {insights.map(insight => {
            const href =
              insight.entityType === 'contact'
                ? `/s/${slug}/contacts/${insight.entityId}?tab=intelligence`
                : insight.entityType === 'deal'
                  ? `/s/${slug}/deals/${insight.entityId}?tab=overview`
                  : `/s/${slug}/agent`;

            return (
              <Link
                key={insight.id}
                href={href}
                className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
              >
                <ImportanceBadge importance={insight.importance} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug line-clamp-2">{insight.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {insight.entityName && (
                      <span className={cn(
                        'text-[10px] font-medium rounded px-1.5 py-0.5',
                        insight.entityType === 'contact' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400' :
                        insight.entityType === 'deal' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' :
                        'bg-muted text-muted-foreground',
                      )}>
                        {insight.entityName}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{timeAgo(insight.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight size={13} className="text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors shrink-0 mt-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
