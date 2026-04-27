'use client';

import { useState, useEffect } from 'react';
import { Play, FileText, HelpCircle, Target, Activity, Loader2 } from 'lucide-react';
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
  const [countsError, setCountsError] = useState(false);

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
        setCountsError(true);
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
        if (data.method === 'modal') {
          toast.success('Agent is running now');
        } else {
          toast.success('Queued — will run at next heartbeat (~15 min)');
        }
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
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <ChippiAvatar size="md" pulse={running} />
          <div>
            <h1 className="text-base font-semibold leading-tight">Agent Inbox</h1>
            <p className="text-xs text-muted-foreground">AI-powered outreach agent</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tab pills */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5">
            <button
              onClick={() => setView('workspace')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'workspace'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Workspace
            </button>
            <button
              onClick={() => setView('settings')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'settings'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Settings
            </button>
          </div>
          {/* Run Now */}
          <button
            onClick={() => void handleRunNow()}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Run Now
          </button>
        </div>
      </div>

      {/* Settings view */}
      {view === 'settings' && <AgentSettingsPanel slug={slug} />}

      {/* Workspace view */}
      {view === 'workspace' && (
        <>
          {countsError && (
            <p className="text-xs text-destructive mb-4">Could not load counts — refresh to retry.</p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            {/* LEFT: Inbox sections */}
            <div className="space-y-6">
              {/* Drafts */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={14} className="text-orange-500" />
                  <h2 className="text-sm font-semibold">Awaiting Review</h2>
                  {!countsLoading && counts.drafts > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500 text-white min-w-[18px] text-center">
                      {counts.drafts}
                    </span>
                  )}
                </div>
                <AgentDraftInbox slug={slug} />
              </div>
              {/* Questions */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle size={14} className="text-amber-500" />
                  <h2 className="text-sm font-semibold">Questions</h2>
                  {!countsLoading && counts.questions > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white min-w-[18px] text-center">
                      {counts.questions}
                    </span>
                  )}
                </div>
                <AgentQuestionsPanel />
              </div>
              {/* Goals */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Target size={14} className="text-orange-500/70" />
                  <h2 className="text-sm font-semibold">Active Goals</h2>
                  {!countsLoading && counts.goals > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground min-w-[18px] text-center">
                      {counts.goals}
                    </span>
                  )}
                </div>
                <AgentGoalsPanel />
              </div>
            </div>
            {/* RIGHT: Terminal */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-orange-500" />
                <h2 className="text-sm font-semibold">Live Terminal</h2>
                <span className="text-[11px] text-muted-foreground">Real-time agent output</span>
              </div>
              <ChippiTerminal className="min-h-[320px]" />
            </div>
          </div>
          <div className="mt-8">
            <AgentPortfolioInsights />
          </div>
        </>
      )}
    </div>
  );
}
