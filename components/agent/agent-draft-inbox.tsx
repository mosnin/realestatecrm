'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckCircle, XCircle, MessageSquare, Mail, StickyNote,
  Bot, Loader2, RefreshCw, Pencil, Copy, Check, ChevronDown,
  ChevronUp, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  expiresAt: string | null;
  Contact: DraftContact | null;
}

interface Props {
  slug: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CHANNEL_CONFIG = {
  sms: {
    label: 'SMS',
    icon: MessageSquare,
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    charLimit: 160,
  },
  email: {
    label: 'Email',
    icon: Mail,
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    charLimit: null,
  },
  note: {
    label: 'Note',
    icon: StickyNote,
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    charLimit: null,
  },
} as const;

// ─── DraftCard ─────────────────────────────────────────────────────────────

function DraftCard({
  draft,
  slug,
  onAction,
}: {
  draft: AgentDraft;
  slug: string;
  onAction: (id: string, status: 'approved' | 'dismissed', content?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);
  const [actioning, setActioning] = useState<'approved' | 'dismissed' | null>(null);
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cfg = CHANNEL_CONFIG[draft.channel];
  const Icon = cfg.icon;
  const isEdited = editedContent.trim() !== draft.content;
  const overLimit = cfg.charLimit !== null && editedContent.length > cfg.charLimit;
  const nearLimit = cfg.charLimit !== null && editedContent.length > cfg.charLimit * 0.85;

  function startEdit() {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(false);
    setEditedContent(draft.content);
  }

  async function handleApprove() {
    setActioning('approved');
    // Copy to clipboard so the realtor can paste immediately
    try { await navigator.clipboard.writeText(editedContent); } catch { /* ignore */ }
    await onAction(draft.id, 'approved', isEdited ? editedContent : undefined);
    setActioning(null);
  }

  async function handleDismiss() {
    setActioning('dismissed');
    await onAction(draft.id, 'dismissed');
    setActioning(null);
  }

  async function copyContent() {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border/60">
          {/* Channel pill */}
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.pill)}>
            <Icon size={10} />
            {cfg.label}
          </span>

          {/* Contact link */}
          {draft.Contact ? (
            <Link
              href={`/s/${slug}/contacts/${draft.Contact.id}`}
              className="text-sm font-medium hover:underline underline-offset-2 truncate"
            >
              {draft.Contact.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Unknown contact</span>
          )}

          {/* Contact address */}
          {draft.Contact?.phone && draft.channel === 'sms' && (
            <span className="text-xs text-muted-foreground hidden sm:block truncate">
              {draft.Contact.phone}
            </span>
          )}
          {draft.Contact?.email && draft.channel === 'email' && (
            <span className="text-xs text-muted-foreground hidden sm:block truncate">
              {draft.Contact.email}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] text-muted-foreground">{timeAgo(draft.createdAt)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2.5">
          {/* Subject line */}
          {draft.subject && (
            <p className="text-xs font-semibold text-foreground">{draft.subject}</p>
          )}

          {/* Message content */}
          {editing ? (
            <div className="space-y-1.5">
              <textarea
                ref={textareaRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={Math.max(3, Math.ceil(editedContent.length / 60))}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center justify-between">
                <span className={cn('text-[11px]', overLimit ? 'text-destructive font-medium' : nearLimit ? 'text-amber-500' : 'text-muted-foreground')}>
                  {editedContent.length}{cfg.charLimit ? `/${cfg.charLimit}` : ''} chars
                  {overLimit && ' — too long for SMS'}
                </span>
                <button onClick={cancelEdit} className="text-[11px] text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="group/content relative">
              <div className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed pr-16">
                {editedContent}
                {isEdited && (
                  <span className="ml-1.5 text-[10px] text-primary font-medium">(edited)</span>
                )}
              </div>
              {/* Hover actions on content bubble */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/content:opacity-100 transition-opacity">
                <button
                  onClick={copyContent}
                  className="w-6 h-6 rounded flex items-center justify-center bg-background border text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
                <button
                  onClick={startEdit}
                  className="w-6 h-6 rounded flex items-center justify-center bg-background border text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit message"
                >
                  <Pencil size={11} />
                </button>
              </div>
            </div>
          )}

          {/* SMS char warning outside edit mode */}
          {!editing && cfg.charLimit && editedContent.length > cfg.charLimit && (
            <p className="flex items-center gap-1.5 text-[11px] text-destructive">
              <AlertTriangle size={11} />
              Exceeds {cfg.charLimit}-character SMS limit
            </p>
          )}

          {/* Reasoning — collapsible */}
          {draft.reasoning && (
            <div>
              <button
                onClick={() => setReasoningOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {reasoningOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                Why did the agent suggest this?
              </button>
              {reasoningOpen && (
                <p className="mt-1.5 text-xs text-muted-foreground border-l-2 border-muted pl-2.5 leading-relaxed">
                  {draft.reasoning}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleApprove}
            disabled={actioning !== null || (overLimit && draft.channel === 'sms')}
          >
            {actioning === 'approved' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCircle size={13} />
            )}
            {isEdited ? 'Approve edited' : 'Approve'}
          </Button>

          {!editing && (
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={startEdit}>
              <Pencil size={12} />
              Edit
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 text-muted-foreground hover:text-destructive ml-auto"
            onClick={handleDismiss}
            disabled={actioning !== null}
          >
            {actioning === 'dismissed' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <XCircle size={13} />
            )}
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function AgentDraftInbox({ slug }: Props) {
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/drafts?status=pending&limit=50');
      if (res.ok) setDrafts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Poll every 30 s so new agent drafts appear without a manual refresh
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleAction(
    draftId: string,
    status: 'approved' | 'dismissed',
    content?: string,
  ) {
    const body: Record<string, unknown> = { status };
    if (content !== undefined) body.content = content;

    const res = await fetch(`/api/agent/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    }
  }

  async function approveAll() {
    setApprovingAll(true);
    await Promise.all(
      drafts.map((d) =>
        fetch(`/api/agent/drafts/${d.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        }),
      ),
    );
    setDrafts([]);
    setApprovingAll(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((n) => (
          <div key={n} className="h-40 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Bot size={24} className="text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Inbox is clear</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            The agent will suggest follow-up messages here when it spots leads or deals that need attention.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5 mt-1">
          <RefreshCw size={13} />
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{drafts.length}</span>{' '}
          pending draft{drafts.length !== 1 ? 's' : ''} awaiting review
        </p>
        <div className="flex items-center gap-2">
          {drafts.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={approveAll}
              disabled={approvingAll}
            >
              {approvingAll ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Approve all
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} className="h-7 text-xs gap-1.5">
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Approved-copies notice */}
      <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        Approving a draft copies it to your clipboard so you can paste it into SMS or email immediately.
      </p>

      {/* Draft cards */}
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} slug={slug} onAction={handleAction} />
      ))}
    </div>
  );
}
