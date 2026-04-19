'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, MessageSquare, Mail, StickyNote, Bot, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DraftContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface AgentDraft {
  id: string;
  contactId: string | null;
  dealId: string | null;
  channel: 'sms' | 'email' | 'note';
  subject: string | null;
  content: string;
  reasoning: string | null;
  priority: number;
  status: 'pending' | 'approved' | 'dismissed' | 'sent';
  createdAt: string;
  Contact: DraftContact | null;
}

interface Props {
  slug: string;
}

const CHANNEL_ICON = {
  sms: MessageSquare,
  email: Mail,
  note: StickyNote,
} as const;

const CHANNEL_LABEL = {
  sms: 'SMS',
  email: 'Email',
  note: 'Note',
} as const;

export function AgentDraftInbox({ slug }: Props) {
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/drafts?status=pending&limit=50`);
      if (res.ok) setDrafts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(draftId: string, action: 'approved' | 'dismissed') {
    setActioningId(draftId);
    try {
      const res = await fetch(`/api/agent/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } finally {
      setActioningId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading drafts…
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Bot size={22} />
        </div>
        <div>
          <p className="font-medium text-foreground">No pending drafts</p>
          <p className="text-sm mt-0.5">The agent will suggest messages here when it finds opportunities.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{drafts.length} pending draft{drafts.length !== 1 ? 's' : ''}</p>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 h-7 text-xs">
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      {drafts.map((draft) => {
        const Icon = CHANNEL_ICON[draft.channel];
        const isActioning = actioningId === draft.id;
        return (
          <Card key={draft.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {draft.Contact?.name ?? 'Unknown contact'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      via {CHANNEL_LABEL[draft.channel]}
                      {draft.Contact?.email && draft.channel === 'email' && ` · ${draft.Contact.email}`}
                      {draft.Contact?.phone && draft.channel === 'sms' && ` · ${draft.Contact.phone}`}
                    </p>
                  </div>
                </div>
                {draft.priority > 0 && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    Priority {draft.priority}
                  </Badge>
                )}
              </div>

              {/* Subject */}
              {draft.subject && (
                <p className="text-xs font-medium text-foreground">{draft.subject}</p>
              )}

              {/* Content */}
              <div className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed">
                {draft.content}
              </div>

              {/* Reasoning */}
              {draft.reasoning && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2.5">
                  {draft.reasoning}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => handleAction(draft.id, 'approved')}
                  disabled={isActioning}
                >
                  {isActioning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn('gap-1.5 h-8 text-muted-foreground hover:text-destructive', isActioning && 'opacity-50')}
                  onClick={() => handleAction(draft.id, 'dismissed')}
                  disabled={isActioning}
                >
                  <XCircle size={13} />
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
