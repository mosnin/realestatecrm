'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, X, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type ControlAction = 'paused' | 'running' | 'cancelled' | 'queued';

// ─── Export ───────────────────────────────────────────────────────────────────

export function TaskControls({
  taskId,
  status,
  slug: _slug,
}: {
  taskId: string;
  status: string;
  slug: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<ControlAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Terminal states — nothing to show (failed is handled below with retry)
  if (['completed', 'cancelled'].includes(status)) return null;

  async function handleAction(action: ControlAction) {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Pause button — only when running */}
        {status === 'running' && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading !== null}
            onClick={() => void handleAction('paused')}
          >
            {loading === 'paused' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Pause size={13} />
            )}
            Pause
          </Button>
        )}

        {/* Resume button — only when paused */}
        {status === 'paused' && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading !== null}
            onClick={() => void handleAction('running')}
          >
            {loading === 'running' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            Resume
          </Button>
        )}

        {/* Cancel button — running, paused, or queued */}
        {['running', 'paused', 'queued'].includes(status) && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={loading !== null}
            onClick={() => void handleAction('cancelled')}
          >
            {loading === 'cancelled' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <X size={13} />
            )}
            Cancel
          </Button>
        )}

        {/* Retry button — only when failed */}
        {status === 'failed' && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading !== null}
            onClick={() => void handleAction('queued')}
          >
            {loading === 'queued' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
            Retry
          </Button>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
