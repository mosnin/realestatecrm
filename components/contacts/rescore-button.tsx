'use client';

import { useState } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  contactId: string;
  onComplete?: (result: { leadScore: number | null; scoreLabel: string; scoreSummary: string | null }) => void;
}

export function RescoreButton({ contactId, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRescore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/rescore`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDone(true);
        toast.success('Lead re-scored');
        onComplete?.(data);
        // Refresh the page after a moment so the new score renders
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error('Scoring failed — try again');
        setError('Re-score failed. Please try again.');
      }
    } catch {
      setError('Re-score failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRescore}
        disabled={loading || done}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border transition-colors',
          done
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20'
            : 'text-muted-foreground bg-muted border-border hover:bg-accent hover:text-foreground',
          loading && 'opacity-60 cursor-not-allowed',
        )}
      >
        {loading ? (
          <RotateCcw size={11} className="animate-spin" />
        ) : done ? (
          <Sparkles size={11} />
        ) : (
          <RotateCcw size={11} />
        )}
        {loading ? 'Scoring…' : done ? 'Scored!' : 'Re-score'}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
