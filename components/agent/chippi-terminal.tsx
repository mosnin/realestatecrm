'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, FileText, Info, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface StreamEvent {
  type: 'info' | 'action' | 'draft' | 'complete' | 'error' | 'connected' | 'warning';
  message: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  ts: number;
}

interface TerminalRun {
  runId: string;
  agentType: string;
  startedAt: string;
  events: StreamEvent[];
  status: 'live' | 'complete' | 'error' | 'loading';
}

interface ChippiTerminalProps {
  runId?: string;
  className?: string;
  maxEvents?: number;
  compact?: boolean;
}

function EventRow({ event }: { event: StreamEvent }) {
  if (event.type === 'connected') return null;

  const isComplete = event.type === 'complete';
  const isError = event.type === 'error';
  const isWarning = event.type === 'warning';
  const isDraft = event.type === 'draft';
  const isInfo = event.type === 'info';

  const icon = {
    info: <Info size={11} className="text-zinc-600 flex-shrink-0 mt-0.5" />,
    action: <CheckCircle2 size={11} className="text-orange-500/80 flex-shrink-0 mt-0.5" />,
    draft: <FileText size={11} className="text-orange-400 flex-shrink-0 mt-0.5" />,
    complete: <Zap size={11} className="text-orange-500 flex-shrink-0 mt-0.5" />,
    error: <AlertCircle size={11} className="text-red-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertCircle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />,
    connected: null,
  }[event.type];

  return (
    <div className={cn(
      'flex items-start gap-2 py-0.5 font-mono text-[11.5px] leading-relaxed',
      isComplete && 'mt-2 pt-2 border-t border-zinc-800',
    )}>
      {icon}
      <span className={cn(
        'flex-1 min-w-0',
        isComplete && 'text-orange-400 font-medium',
        isError && 'text-red-400',
        isWarning && 'text-amber-400',
        isDraft && 'text-orange-300',
        isInfo && 'text-zinc-500',
        !isComplete && !isError && !isWarning && !isDraft && !isInfo && 'text-zinc-300',
      )}>
        {event.agentType && event.type === 'action' && (
          <span className="text-orange-500/50 mr-1.5">[{event.agentType.replace(/_/g, '-')}]</span>
        )}
        {event.message}
      </span>
      <span className="text-[10px] text-zinc-700 flex-shrink-0 tabular-nums">
        {new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}

export function ChippiTerminal({ runId, className, maxEvents = 30, compact = false }: ChippiTerminalProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'live' | 'complete' | 'error' | 'loading'>('loading');
  const [agentType, setAgentType] = useState<string>('');
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [runDuration, setRunDuration] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Suppress unused TerminalRun warning
  void (null as unknown as TerminalRun);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistory() {
      try {
        const res = await fetch('/api/agent/activity?limit=30', { signal: controller.signal });
        if (!res.ok) { setStatus('idle'); return; }
        const data = await res.json() as Array<{
          runId: string;
          agentType: string;
          createdAt: string;
          actionType: string;
          reasoning: string;
          outcome: string;
        }>;
        if (!data.length) { setStatus('idle'); return; }

        const firstRunId = data[0].runId;
        const runEvents = data
          .filter((a) => a.runId === firstRunId)
          .slice(0, maxEvents)
          .reverse()
          .map((a) => ({
            type: (a.outcome === 'failed' ? 'error' : a.actionType === 'run_complete' ? 'complete' : 'action') as StreamEvent['type'],
            message: a.reasoning || a.actionType,
            agentType: a.agentType,
            ts: new Date(a.createdAt).getTime(),
          } as StreamEvent));

        setEvents(runEvents);
        setAgentType(data[0].agentType);
        setLastRunAt(data[0].createdAt);
        setStatus('complete');
      } catch {
        setStatus('idle');
      }
    }
    void loadHistory();
    return () => controller.abort();
  }, [maxEvents]);

  useEffect(() => {
    if (!runId) return;
    setEvents([]);
    setStatus('live');
    const startTs = Date.now();
    const es = new EventSource(`/api/agent/stream?runId=${encodeURIComponent(runId)}`);

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data as string);
        if (event.type === 'connected') return;
        setEvents(prev => [...prev.slice(-(maxEvents - 1)), event]);
        if (event.agentType) setAgentType(event.agentType);
        if (event.type === 'complete') {
          setStatus('complete');
          setRunDuration(`${((Date.now() - startTs) / 1000).toFixed(1)}s`);
          es.close();
        }
        if (event.type === 'error') {
          setStatus('error');
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => { setStatus('error'); es.close(); };
    return () => es.close();
  }, [runId, maxEvents]);

  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, userScrolled]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setUserScrolled(el.scrollHeight - el.scrollTop - el.clientHeight > 40);
  }, []);

  const isRunning = status === 'live';

  return (
    <div className={cn('relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950', className)}>
      {/* Terminal header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className={cn('w-2.5 h-2.5 rounded-full', isRunning ? 'bg-orange-500 animate-pulse' : 'bg-zinc-700')} />
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isRunning ? (
            <Loader2 size={11} className="text-orange-500 animate-spin flex-shrink-0" />
          ) : null}
          <span className="text-[12px] font-mono text-zinc-400">
            {isRunning ? 'chippi running...' : 'chippi'}
          </span>
          {agentType && (
            <span className="text-[10px] font-mono text-orange-500/60 bg-zinc-800 px-1.5 py-0.5 rounded">
              {agentType.replace(/_/g, '-')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {runDuration && (
            <span className="text-[10px] font-mono text-zinc-600">{runDuration}</span>
          )}
          {lastRunAt && !isRunning && (
            <span className="text-[10px] font-mono text-zinc-600">{timeAgo(lastRunAt)}</span>
          )}
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isRunning ? 'bg-orange-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-zinc-700',
          )} />
        </div>
      </div>

      {/* Terminal body */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Agent event log"
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          'overflow-y-auto px-4 py-3',
          compact ? 'max-h-48' : 'max-h-72',
        )}
      >
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-[11.5px] text-zinc-600 font-mono">
            <Loader2 size={10} className="animate-spin" />
            loading last run...
          </div>
        )}

        {status === 'idle' && (
          <div className="font-mono text-[11.5px] space-y-1">
            <div>
              <span className="text-orange-500">$ </span>
              <span className="text-zinc-400">chippi</span>
            </div>
            <div className="text-zinc-600 pl-3">
              no runs yet — click{' '}
              <span className="text-orange-500/80">Run Now</span>
              {' '}or wait for the next scheduled heartbeat
            </div>
          </div>
        )}

        {events.length > 0 && events.map((event, i) => (
          <EventRow key={`${event.ts}-${i}`} event={event} />
        ))}

        {isRunning && (
          <div className="flex items-center gap-1.5 pt-1 font-mono text-[12px] text-orange-500">
            <span className="animate-pulse">▊</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {userScrolled && (
        <button
          onClick={() => {
            setUserScrolled(false);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/90 text-white text-[10px] font-mono shadow-lg hover:bg-orange-500 transition-colors"
        >
          ↓ live
        </button>
      )}
    </div>
  );
}
