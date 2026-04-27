'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bot, CheckCircle2, AlertCircle, FileText, Info, Loader2, Zap } from 'lucide-react';
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
  runId?: string;           // if provided, connects to live SSE stream for this runId
  className?: string;
  maxEvents?: number;       // defaults to 30
  compact?: boolean;        // compact mode for sidebar use
}

function EventRow({ event }: { event: StreamEvent }) {
  const icons: Record<StreamEvent['type'], React.ReactNode> = {
    info: <Info size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />,
    action: <CheckCircle2 size={12} className="text-orange-500 flex-shrink-0 mt-0.5" />,
    draft: <FileText size={12} className="text-orange-400 flex-shrink-0 mt-0.5" />,
    complete: <Zap size={12} className="text-orange-500 flex-shrink-0 mt-0.5" />,
    error: <AlertCircle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />,
    connected: null,
  };

  if (event.type === 'connected') return null;

  const isComplete = event.type === 'complete';
  const isError = event.type === 'error';
  const isDraft = event.type === 'draft';

  return (
    <div className={cn(
      'flex items-start gap-2 py-0.5 font-mono text-[12px] leading-relaxed',
      isComplete && 'mt-2 pt-2 border-t border-border/40',
      isError && 'text-red-500',
      isDraft && 'text-orange-500',
      !isComplete && !isError && !isDraft && 'text-foreground/80',
    )}>
      {icons[event.type]}
      <span className={cn(
        'flex-1 min-w-0',
        event.type === 'action' && 'text-foreground',
        event.type === 'info' && 'text-muted-foreground text-[11px]',
        isComplete && 'text-orange-500 font-medium',
      )}>
        {event.agentType && event.type === 'action' && (
          <span className="text-orange-500/60 mr-1.5">[{event.agentType}]</span>
        )}
        {event.message}
      </span>
      <span className="text-[10px] text-muted-foreground/40 flex-shrink-0 tabular-nums">
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

  // Load history on mount
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

        // Take first run's events
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

  // Connect to live SSE if runId provided
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
    es.onerror = () => {
      setStatus('error');
      es.close();
    };
    return () => es.close();
  }, [runId, maxEvents]);

  // Auto-scroll
  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, userScrolled]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }, []);

  const isRunning = status === 'live';

  // Suppress unused variable warning — TerminalRun is a shared data type
  void (null as unknown as TerminalRun);

  return (
    <div className={cn('relative rounded-xl border border-border bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-muted/20">
        <div className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
          isRunning ? 'bg-orange-500' : 'bg-orange-500/20',
        )}>
          {isRunning
            ? <Loader2 size={12} className="text-white animate-spin" />
            : <Bot size={12} className="text-orange-500" />}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono font-semibold text-foreground">
            {isRunning ? 'chippi running...' : 'chippi'}
          </span>
          {agentType && (
            <span className="text-[10px] font-mono text-orange-500/70 bg-orange-500/10 px-1.5 py-0.5 rounded">
              {agentType.replace(/_/g, '-')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {runDuration && (
            <span className="text-[10px] font-mono text-muted-foreground">{runDuration}</span>
          )}
          {lastRunAt && !isRunning && (
            <span className="text-[10px] font-mono text-muted-foreground">{timeAgo(lastRunAt)}</span>
          )}
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isRunning ? 'bg-orange-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-orange-500/30',
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
          'overflow-y-auto px-4 py-3 font-mono',
          compact ? 'max-h-48' : 'max-h-72',
        )}
      >
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono">
            <Loader2 size={11} className="animate-spin" />
            loading last run...
          </div>
        )}
        {status === 'idle' && (
          <div className="text-[12px] text-muted-foreground font-mono">
            <span className="text-orange-500">$</span> chippi has not run yet
            <br />
            <span className="text-muted-foreground/50">run her now or wait for the next scheduled heartbeat</span>
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
          className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/90 text-white text-[10px] font-medium shadow-md hover:bg-orange-600 transition-colors"
        >
          ↓ Live
        </button>
      )}
    </div>
  );
}
