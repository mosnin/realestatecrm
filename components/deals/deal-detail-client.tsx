'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Send } from 'lucide-react';
import type { DealActivity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import * as LucideIcons from 'lucide-react';

interface Props {
  dealId: string;
  slug: string;
  initialActivities: DealActivity[];
  activityMeta: Record<string, { label: string; icon: any; color: string }>;
}

export function DealDetailClient({ dealId, initialActivities, activityMeta }: Props) {
  const [activities, setActivities] = useState<DealActivity[]>(initialActivities);
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: content.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setActivities((prev) => [created, ...prev]);
        setContent('');
      } else {
        setError('Failed to save. Please try again.');
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Activity size={14} className="text-muted-foreground" />
        Activity
      </h2>

      {/* Add entry */}
      <div className="rounded-xl border border-border p-3 space-y-2.5 mb-5">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="note">Note</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handlePost(); }}
          placeholder="Add a note, log a call…"
          rows={2}
          className="resize-none text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={handlePost} disabled={!content.trim() || posting}>
            <Send size={12} className="mr-1.5" />
            Post
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Activity size={28} className="mx-auto mb-2 opacity-30" />
          No activity yet. Log a call or add a note.
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => {
            const meta = activityMeta[activity.type] ?? activityMeta.note;
            const Icon = meta.icon;
            return (
              <div key={activity.id} className="flex gap-3">
                <div className={cn('flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5', meta.color)}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{meta.label}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(new Date(activity.createdAt))}</span>
                  </div>
                  {activity.content && (
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{activity.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
