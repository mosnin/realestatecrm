'use client';

import { useState, useEffect } from 'react';
import { Bot, Play, Settings, FileText, HelpCircle, Target, Activity, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { ChippiTerminal } from '@/components/agent/chippi-terminal';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { AgentPortfolioInsights } from '@/components/agent/agent-portfolio-insights';
import { cn } from '@/lib/utils';

export default function AgentPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [view, setView] = useState<'workspace' | 'settings'>('workspace');
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({ drafts: 0, questions: 0, goals: 0 });

  useEffect(() => {
    async function loadCounts() {
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
    }
    void loadCounts();
  }, []);

  async function handleRunNow() {
    setRunning(true);
    try {
      await fetch('/api/agent/run-now', { method: 'POST' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/25">
            <Bot size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Chippi Workspace</h1>
            <p className="text-xs text-muted-foreground">Your AI agent · autonomous outreach platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setView(view === 'settings' ? 'workspace' : 'settings')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors',
              view === 'settings'
                ? 'bg-orange-500 text-white'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Settings size={12} />
            Settings
          </button>
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
      {view === 'settings' && (
        <AgentSettingsPanel slug={slug} />
      )}

      {/* Workspace view — two columns */}
      {view === 'workspace' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
            {/* LEFT: Inbox */}
            <div className="space-y-6">
              {/* Drafts section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={14} className="text-orange-500" />
                  <h2 className="text-sm font-semibold">Awaiting Review</h2>
                  {counts.drafts > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500 text-white min-w-[18px] text-center">
                      {counts.drafts}
                    </span>
                  )}
                </div>
                <AgentDraftInbox slug={slug} />
              </div>

              {/* Questions section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle size={14} className="text-amber-500" />
                  <h2 className="text-sm font-semibold">Questions</h2>
                  {counts.questions > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white min-w-[18px] text-center">
                      {counts.questions}
                    </span>
                  )}
                </div>
                <AgentQuestionsPanel />
              </div>

              {/* Goals section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Target size={14} className="text-orange-500/70" />
                  <h2 className="text-sm font-semibold">Active Goals</h2>
                  {counts.goals > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground min-w-[18px] text-center">
                      {counts.goals}
                    </span>
                  )}
                </div>
                <AgentGoalsPanel />
              </div>
            </div>

            {/* RIGHT: Terminal */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-orange-500" />
                <h2 className="text-sm font-semibold">Live Terminal</h2>
                <span className="text-[11px] text-muted-foreground">Real-time agent output</span>
              </div>
              <ChippiTerminal className="h-full" />
            </div>
          </div>

          {/* Portfolio Insights below the grid */}
          <div className="mt-8">
            <AgentPortfolioInsights />
          </div>
        </>
      )}
    </div>
  );
}
