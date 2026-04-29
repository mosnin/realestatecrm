'use client';

import { useState, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { ChippiTerminal } from '@/components/agent/chippi-terminal';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { AgentPortfolioInsights } from '@/components/agent/agent-portfolio-insights';

interface Counts {
  drafts: number;
  questions: number;
  goals: number;
}

function pluralizeWaiting(c: Counts, running: boolean): string {
  if (running) return 'Working through your pipeline now…';
  const total = c.drafts + c.questions;
  if (total === 0) return 'Nothing waiting on you — pipeline looks healthy.';
  const parts: string[] = [];
  if (c.drafts > 0) parts.push(`${c.drafts} draft${c.drafts === 1 ? '' : 's'}`);
  if (c.questions > 0) parts.push(`${c.questions} question${c.questions === 1 ? '' : 's'}`);
  return `${parts.join(' · ')} waiting for you.`;
}

export default function AgentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const tab = searchParams?.get('tab') ?? null;
  const isSettings = tab === 'settings';

  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState<Counts>({ drafts: 0, questions: 0, goals: 0 });
  const [, setCountsLoading] = useState(true);

  useEffect(() => {
    async function loadCounts() {
      try {
        const [draftsRes, questionsRes, goalsRes] = await Promise.all([
          fetch('/api/agent/drafts?status=pending&limit=50'),
          fetch('/api/agent/questions?status=pending&limit=50'),
          fetch('/api/agent/goals?status=active&limit=50'),
        ]);
        const [draftsData, questionsData, goalsData] = await Promise.all([
          draftsRes.ok ? draftsRes.json() : [],
          questionsRes.ok ? questionsRes.json() : [],
          goalsRes.ok ? goalsRes.json() : [],
        ]);
        setCounts({
          drafts: Array.isArray(draftsData) ? draftsData.length : 0,
          questions: Array.isArray(questionsData) ? questionsData.length : 0,
          goals: Array.isArray(goalsData) ? goalsData.length : 0,
        });
      } catch {
        // non-critical
      } finally {
        setCountsLoading(false);
      }
    }
    void loadCounts();
  }, []);

  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      if (res.ok && data?.triggered) {
        toast.success(
          data.method === 'modal'
            ? 'Chippi is on it — watch the activity feed'
            : 'Queued — Chippi will pick this up at the next heartbeat (~15 min)',
        );
      } else {
        toast.error("Couldn't kick off Chippi — please try again");
      }
    } catch {
      toast.error('Could not reach server');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-10 pb-12">
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="space-y-1.5">
          <h1
            className="text-3xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            {isSettings ? 'Chippi · Settings' : 'Inbox'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSettings
              ? 'Tune what Chippi does on its own and what it brings to you.'
              : pluralizeWaiting(counts, running)}
          </p>
        </div>
        {!isSettings && (
          <button
            onClick={() => void handleRunNow()}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Run now
          </button>
        )}
      </header>

      {/* Settings view */}
      {isSettings && <AgentSettingsPanel slug={slug} />}

      {/* Workspace view */}
      {!isSettings && (
        <div className="space-y-12">
          <AgentDraftInbox slug={slug} />
          <AgentQuestionsPanel />
          <AgentGoalsPanel />

          {/* Activity / context — quieter, lives below the work */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start pt-2">
            <ChippiTerminal className="min-h-[260px]" />
            <AgentPortfolioInsights />
          </div>
        </div>
      )}
    </div>
  );
}
