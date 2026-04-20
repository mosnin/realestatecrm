'use client';

/**
 * AgentActivityPage — wraps the activity feed with a "Live stream" panel.
 *
 * Recent run IDs are loaded from /api/agent/runs. Clicking "Watch stream"
 * on any run opens the AgentLiveStream SSE view inline above the feed.
 * The latest run auto-connects if it was within the last 10 minutes.
 */

import { useEffect, useState } from 'react';
import { Play, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentActivityFeed } from './agent-activity-feed';
import { AgentLiveStream } from './agent-live-stream';

interface RecentRun {
  runId: string;
  agentType: string;
  startedAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const AGENT_LABELS: Record<string, string> = {
  lead_nurture: 'Lead Nurture',
  deal_sentinel: 'Deal Sentinel',
};

interface Props {
  slug: string;
}

export function AgentActivityPage({ slug }: Props) {
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agent/runs')
      .then((r) => r.json())
      .then((data: RecentRun[]) => {
        setRuns(data);
        // Auto-connect to the most recent run if it started within 10 minutes
        if (data[0]) {
          const age = Date.now() - new Date(data[0].startedAt).getTime();
          if (age < 10 * 60 * 1000) {
            setActiveRunId(data[0].runId);
          }
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {/* Recent runs — stream replay bar */}
      {runs.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
            <Radio size={13} className="text-primary" />
            <span className="text-xs font-semibold">Recent runs</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto">
            {runs.map((run) => {
              const isActive = activeRunId === run.runId;
              return (
                <Button
                  key={run.runId}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1.5 flex-shrink-0"
                  onClick={() => setActiveRunId(isActive ? null : run.runId)}
                >
                  <Play size={10} />
                  {AGENT_LABELS[run.agentType] ?? run.agentType} · {timeAgo(run.startedAt)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Live stream panel */}
      {activeRunId && (
        <AgentLiveStream
          runId={activeRunId}
          onClose={() => setActiveRunId(null)}
        />
      )}

      {/* Full activity feed */}
      <AgentActivityFeed slug={slug} />
    </div>
  );
}
