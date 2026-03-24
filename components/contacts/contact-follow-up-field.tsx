'use client';

import { useState } from 'react';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFollowUpDate, toDateInputValue, timeAgo } from '@/lib/formatting';

interface Props {
  contactId: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
}

export function ContactFollowUpField({ contactId, followUpAt: initialFollowUpAt, lastContactedAt: initialLastContactedAt }: Props) {
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);
  const [lastContactedAt, setLastContactedAt] = useState(initialLastContactedAt);

  async function patch(data: Record<string, unknown>) {
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('[follow-up] Patch failed:', err);
    }
  }

  function handleFollowUpChange(value: string) {
    const next = value || null;
    setFollowUpAt(next);
    patch({ followUpAt: next });
  }

  function handleMarkContacted() {
    const now = new Date().toISOString();
    setLastContactedAt(now);
    patch({ lastContactedAt: now });
  }

  const isOverdue = followUpAt && new Date(followUpAt) < new Date();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Follow-up date */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer group/fu">
        <CalendarDays size={12} className={cn(followUpAt ? 'text-primary' : 'text-muted-foreground')} />
        {followUpAt ? (
          <span className={cn('font-medium', isOverdue ? 'text-destructive' : 'text-primary')}>
            {formatFollowUpDate(followUpAt)}
          </span>
        ) : (
          <span className="group-hover/fu:text-foreground transition-colors">Set follow-up</span>
        )}
        <input
          type="date"
          className="sr-only"
          value={toDateInputValue(followUpAt)}
          onChange={(e) => handleFollowUpChange(e.target.value)}
        />
      </label>

      {/* Mark contacted */}
      <button
        type="button"
        onClick={handleMarkContacted}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-3 py-1.5 transition-colors',
          lastContactedAt
            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
            : 'text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80',
        )}
        title="Mark as contacted now"
      >
        <CheckCircle2 size={11} />
        {lastContactedAt ? `Contacted ${timeAgo(new Date(lastContactedAt))}` : 'Mark contacted'}
      </button>
    </div>
  );
}
