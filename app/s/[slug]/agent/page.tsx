'use client';

import { useState, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { ChippiTerminal } from '@/components/agent/chippi-terminal';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { AgentPortfolioInsights } from '@/components/agent/agent-portfolio-insights';
import { ChippiAvatar } from '@/components/agent/chippi-avatar';
import { cn } from '@/lib/utils';

export default function AgentPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [view, setView] = useState<'workspace' | 'settings'>('workspace');
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({ drafts: 0, questions: 0, goals: 0 });
  const [countsLoading, setCountsLoading] = useState(true);

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
        toast.success(data.method === 'modal' ? 'Agent is running now' : 'Queued — will run at next heartbeat (~15 min)');
      } else {
        toast.error('Could not start agent run');
      }
    } catch {
      toast.error('Could not reach server');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Command bar ─────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card px-5 py-4">
        <div className="flex items-center gap-4 flex-wrap gap-y-3">
          {/* Identity */}
          <div className="flex items-center gap-3.5">
            <ChippiAvatar size="md" pulse={running} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight">Chippi</h1>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">AI outreach agent</p>
            </div>
          </div>

          {/* Quick stats */}
          {countsLoading ? (
            <div className="flex items-center gap-3">
              {[80, 72, 60].map((w) => (
                <div key={w} className={`h-9 w-${w === 80 ? '20' : w === 72 ? '[4.5rem]' : '16'} rounded-lg bg-muted/50 animate-pulse`} />
              ))}
            </div>
          ) : (
            <div className="flex items-center rounded-xl border border-border overflow-hidden">
              {[
                { label: 'Drafts', value: counts.drafts, accent: counts.drafts > 0 ? 'text-orange-500' : 'text-muted-foreground' },
                { label: 'Questions', value: counts.questions, accent: counts.questions > 0 ? 'text-amber-500' : 'text-muted-foreground' },
                { label: 'Goals', value: counts.goals, accent: 'text-muted-foreground' },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={cn('flex items-baseline gap-2 px-4 py-2.5', i > 0 && 'border-l border-border')}
                >
                  <span className={cn('text-base font-bold tabular-nums leading-none', s.accent)}>{s.value}</span>
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs + Run Now */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
              <button
                onClick={() => setView('workspace')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  view === 'workspace' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Workspace
              </button>
              <button
                onClick={() => setView('settings')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  view === 'settings' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Settings
              </button>
            </div>
            <button
              onClick={() => void handleRunNow()}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Run Now
            </button>
          </div>
        </div>
      </div>

      {/* ── Settings view ───────────────────────────────────── */}
      {view === 'settings' && <AgentSettingsPanel slug={slug} />}

      {/* ── Workspace view ──────────────────────────────────── */}
      {view === 'workspace' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
          {/* Left: inbox sections */}
          <div className="space-y-5">
            <AgentDraftInbox slug={slug} />
            <AgentQuestionsPanel />
            <AgentGoalsPanel />
          </div>
          {/* Right: terminal + portfolio */}
          <div className="space-y-5">
            <ChippiTerminal className="min-h-[280px]" />
            <AgentPortfolioInsights />
          </div>
        </div>
      )}
    </div>
  );
}
