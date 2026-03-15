'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ACTIVITY_META } from '@/lib/constants';

type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'follow_up';

type Activity = {
  id: string;
  type: ActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const TYPE_META = ACTIVITY_META;

const ACTIVITY_TYPES: ActivityType[] = ['note', 'call', 'email', 'meeting', 'follow_up'];

export function ContactActivityTab({ contactId }: { contactId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ActivityType>('note');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/activity`);
    if (res.ok) setActivities(await res.json());
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  async function handlePost() {
    if (!content.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/contacts/${contactId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content: content.trim() }),
    });
    if (res.ok) {
      const newActivity = await res.json();
      setActivities((prev) => [newActivity, ...prev]);
      setContent('');
    }
    setPosting(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Clock size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Activity log</h2>
        {activities.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{activities.length} entries</span>
        )}
      </div>

      {/* Add activity */}
      <div className="px-6 pt-4 pb-3 border-b border-border/60">
        {/* Type selector */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {ACTIVITY_TYPES.map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  type === t ? meta.color : 'text-muted-foreground bg-muted hover:text-foreground',
                )}
              >
                <Icon size={11} />
                {meta.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Add a ${TYPE_META[type].label.toLowerCase()}…`}
          rows={2}
          className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
          }}
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handlePost} disabled={posting || !content.trim()} className="gap-1.5">
            <Plus size={13} />
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && activities.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No activity yet. Log a call, note, or email above.</p>
          </div>
        )}

        {!loading && activities.length > 0 && (
          <div className="space-y-4">
            {activities.map((activity) => {
              const meta = TYPE_META[activity.type] ?? TYPE_META.note;
              const Icon = meta.icon;
              return (
                <div key={activity.id} className="flex gap-3">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', meta.color)}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(activity.createdAt as string)}</span>
                    </div>
                    {activity.content && (
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">
                        {activity.content}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
