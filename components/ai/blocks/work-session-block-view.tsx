'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { WorkSessionBlock } from '@/lib/ai-tools/blocks';
import type { WorkSessionRow } from '@/lib/work-sessions/types';
import { WorkSessionCard } from '@/components/chippi/work-sessions-strip';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function WorkSessionBlockView({ block }: { block: WorkSessionBlock }) {
  const params = useParams<{ slug?: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [session, setSession] = useState<WorkSessionRow | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(
        `/api/work-sessions/${encodeURIComponent(block.sessionId)}?slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const json = (await res.json()) as { session?: WorkSessionRow };
      if (json.session) {
        setSession(json.session);
        setFailed(false);
      }
    } catch {
      setFailed(true);
    }
  }, [block.sessionId, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session || TERMINAL.has(session.status)) return;
    const id = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(id);
  }, [load, session]);

  if (session) {
    return <WorkSessionCard session={session} slug={slug} />;
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        {!failed && <Loader2 size={14} className="shrink-0 animate-spin text-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">{block.goal}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {failed ? 'Could not refresh this work session.' : 'Connecting to the work session…'}
          </p>
        </div>
        {failed && (
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
