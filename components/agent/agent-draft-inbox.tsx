'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2, XCircle, MessageSquare, Mail, StickyNote,
  Loader2, RefreshCw, Pencil, Copy, Check,
  AlertTriangle, Send, TriangleAlert, CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { ChippiBadge } from './chippi-avatar';

interface DeliveryResult {
  sent: boolean;
  method: 'email' | 'sms' | 'note';
  error?: string;
}

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
  confidence: number | null;
  status: 'pending' | 'approved' | 'dismissed' | 'sent';
  createdAt: string;
  expiresAt: string | null;
  Contact: DraftContact | null;
}

interface Props {
  slug: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG = {
  sms: {
    label: 'SMS',
    icon: MessageSquare,
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    accent: 'border-l-emerald-500',
    charLimit: 160,
  },
  email: {
    label: 'Email',
    icon: Mail,
    pill: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
    accent: 'border-l-orange-500',
    charLimit: null,
  },
  note: {
    label: 'Note',
    icon: StickyNote,
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    accent: 'border-l-amber-500',
    charLimit: null,
  },
} as const;

// ─── DraftCard ────────────────────────────────────────────────────────────────

function DraftCard({
  draft,
  slug,
  onAction,
}: {
  draft: AgentDraft;
  slug: string;
  onAction: (id: string, status: 'approved' | 'dismissed', content?: string) => Promise<DeliveryResult | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);
  const [actioning, setActioning] = useState<'approved' | 'dismissed' | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
    const result = await onAction(draft.id, 'approved', isEdited ? editedContent : undefined);
    if (result !== null && !result?.sent) {
      try { await navigator.clipboard.writeText(editedContent); } catch { /* ignore */ }
    }
    if (mountedRef.current) setActioning(null);
  }

  async function handleDismiss() {
    setActioning('dismissed');
    setDismissError(null);
    try {
      await onAction(draft.id, 'dismissed');
    } catch {
      if (mountedRef.current) {
        setActioning(null);
        setDismissError('Could not dismiss — please try again.');
      }
    }
  }

  async function copyContent() {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn('border-l-2 group/draft transition-colors', cfg.accent)}>
      {/* Header row */}
      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 px-5 pt-4 pb-3 border-b border-border/40">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.pill)}>
          <Icon size={10} />
          {cfg.label}
        </span>
        <ChippiBadge />

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

        {draft.Contact?.phone && draft.channel === 'sms' && (
          <span className="text-xs text-muted-foreground hidden sm:block truncate">{draft.Contact.phone}</span>
        )}
        {draft.Contact?.email && draft.channel === 'email' && (
          <span className="text-xs text-muted-foreground hidden sm:block truncate">{draft.Contact.email}</span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {draft.confidence !== null && draft.confidence !== undefined && (
            <span className={cn(
              'text-[11px] px-1.5 py-0.5 rounded-full font-medium',
              draft.confidence >= 80
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : draft.confidence >= 50
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
            )}>
              {draft.confidence}% confident
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{timeAgo(draft.createdAt)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-3.5 space-y-3">
        {draft.subject && (
          <p className="text-xs font-semibold text-foreground">{draft.subject}</p>
        )}

        {editing ? (
          <div className="space-y-1.5">
            <textarea
              ref={textareaRef}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={Math.max(3, Math.ceil(editedContent.length / 60))}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className={cn('text-[11px]', overLimit ? 'text-destructive font-medium' : nearLimit ? 'text-amber-500' : 'text-muted-foreground')}>
              {editedContent.length}{cfg.charLimit ? `/${cfg.charLimit}` : ''} chars
              {overLimit && ' — too long for SMS'}
            </span>
          </div>
        ) : (
          <div className="group/content relative">
            <div className="rounded-lg bg-muted/50 px-3.5 py-3 text-sm whitespace-pre-wrap leading-relaxed pr-16">
              {editedContent}
              {isEdited && (
                <span className="ml-1.5 text-[11px] text-orange-600 dark:text-orange-400 font-medium">(edited)</span>
              )}
            </div>
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-60 hover:opacity-100 focus-within:opacity-100 transition-opacity sm:opacity-0 sm:group-hover/content:opacity-100">
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

        {!editing && cfg.charLimit && editedContent.length > cfg.charLimit && (
          <p className="flex items-center gap-1.5 text-[11px] text-destructive">
            <AlertTriangle size={11} />
            Exceeds {cfg.charLimit}-character SMS limit
          </p>
        )}

        {draft.reasoning && (
          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2.5 leading-relaxed italic">
            {draft.reasoning}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-5 pb-4">
        {draft.channel === 'sms' || draft.channel === 'email' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5 h-8 w-full sm:w-auto text-xs"
                disabled={actioning !== null || (overLimit && draft.channel === 'sms')}
              >
                {actioning === 'approved' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                {editing ? 'Save & Send' : 'Approve & Send'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send this message?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will send a {draft.channel} to {draft.Contact?.name ?? 'this contact'}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleApprove}
                >
                  Yes, send it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 h-8 w-full sm:w-auto text-xs"
            onClick={handleApprove}
            disabled={actioning !== null}
          >
            {actioning === 'approved' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            {editing ? 'Save & Approve' : 'Approve'}
          </Button>
        )}

        {!editing && (
          <Button size="sm" variant="outline" className="gap-1.5 h-8 w-full sm:w-auto text-xs" onClick={startEdit}>
            <Pencil size={11} />
            Edit
          </Button>
        )}

        {editing ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground hover:text-foreground w-full sm:w-auto text-xs sm:ml-auto"
            onClick={cancelEdit}
          >
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground hover:text-destructive w-full sm:w-auto text-xs sm:ml-auto"
            onClick={handleDismiss}
            disabled={actioning !== null}
          >
            {actioning === 'dismissed' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={12} />
            )}
            Dismiss
          </Button>
        )}
      </div>

      {dismissError && (
        <p className="flex items-center gap-1.5 px-5 pb-3 text-xs text-destructive">
          <AlertTriangle size={11} />
          {dismissError}
        </p>
      )}
    </div>
  );
}

// ─── DeliveryBanner ────────────────────────────────────────────────────────────

const DELIVERY_LABELS: Record<'email' | 'sms' | 'note', string> = {
  email: 'email',
  sms: 'SMS',
  note: 'note',
};

interface DeliveryFeedback {
  contactName: string | null;
  result: DeliveryResult;
}

function DeliveryBanner({ feedback, onClose }: { feedback: DeliveryFeedback; onClose: () => void }) {
  const { result, contactName } = feedback;
  const isNotConfigured = result.error === 'not_configured';
  const methodLabel = DELIVERY_LABELS[result.method];

  if (result.sent) {
    const msg = result.method === 'note'
      ? contactName ? `Note logged for ${contactName}` : 'Note logged'
      : contactName ? `Sent ✓ — ${contactName} via ${methodLabel}` : `Sent ✓ via ${methodLabel}`;
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
        <Send size={13} className="flex-shrink-0" />
        <span className="font-medium">{msg}</span>
        <button onClick={onClose} className="ml-auto text-emerald-500 hover:text-emerald-700"><XCircle size={14} /></button>
      </div>
    );
  }

  if (isNotConfigured) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-sm text-muted-foreground">
        <Copy size={13} className="flex-shrink-0 mt-0.5" />
        <span>Copied to clipboard. Add <code className="text-[11px] bg-muted px-1 rounded">{methodLabel === 'email' ? 'RESEND_API_KEY' : 'TELNYX_API_KEY'}</code> to enable auto-send.</span>
        <button onClick={onClose} className="ml-auto flex-shrink-0"><XCircle size={14} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
      <TriangleAlert size={13} className="flex-shrink-0 mt-0.5" />
      <span><span className="font-medium">Delivery failed</span> — draft approved but {methodLabel} not sent.{result.error && <span className="opacity-75"> {result.error}</span>}</span>
      <button onClick={onClose} className="ml-auto flex-shrink-0"><XCircle size={14} /></button>
    </div>
  );
}

// ─── AgentDraftInbox ───────────────────────────────────────────────────────────

export function AgentDraftInbox({ slug }: Props) {
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [deliveryFeedback, setDeliveryFeedback] = useState<DeliveryFeedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  function showFeedback(contactName: string | null, result: DeliveryResult) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setDeliveryFeedback({ contactName, result });
    feedbackTimer.current = setTimeout(() => setDeliveryFeedback(null), 5_000);
  }

  async function handleAction(
    draftId: string,
    status: 'approved' | 'dismissed',
    content?: string,
  ): Promise<DeliveryResult | null> {
    const restored = drafts.find((d) => d.id === draftId) ?? null;
    const contactName = restored?.Contact?.name ?? null;

    setDrafts((prev) => prev.filter((d) => d.id !== draftId));

    const body: Record<string, unknown> = { status };
    if (content !== undefined) body.content = content;

    try {
      const res = await fetch(`/api/agent/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (restored) setDrafts((prev) => [restored, ...prev]);
        toast.error('Action failed — please try again.');
        return null;
      }

      const data = await res.json();
      if (status === 'approved' && data.deliveryResult) {
        showFeedback(contactName, data.deliveryResult as DeliveryResult);
        return data.deliveryResult as DeliveryResult;
      }
      return null;
    } catch {
      if (restored) setDrafts((prev) => [restored, ...prev]);
      toast.error('Network error — please try again.');
      return null;
    }
  }

  async function approveAll() {
    if (!drafts.length) return;
    setApprovingAll(true);
    try {
      const results = await Promise.allSettled(
        drafts.map((d) => fetch(`/api/agent/drafts/${d.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approved', content: d.content }),
        }).then((r) => { if (!r.ok) throw new Error(r.status.toString()); }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      if (failed > 0) {
        toast.error(`${succeeded} approved, ${failed} failed — please retry`);
      } else {
        toast.success(`All ${succeeded} drafts approved`);
      }
      void load();
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
        <Mail size={14} className="text-orange-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold">Awaiting Review</h2>
        {!loading && drafts.length > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white min-w-[20px] text-center">
            {drafts.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!loading && drafts.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={approveAll}
              disabled={approvingAll}
            >
              {approvingAll ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Approve all
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} className="h-7 w-7 p-0">
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {/* Delivery banner */}
      {deliveryFeedback && (
        <div className="px-5 py-3 border-b border-border/60">
          <DeliveryBanner feedback={deliveryFeedback} onClose={() => setDeliveryFeedback(null)} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="px-5 py-5 space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && drafts.length === 0 && (
        <div className="flex items-center gap-3.5 px-5 py-8">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-muted-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="text-xs text-muted-foreground mt-0.5">No drafts waiting — Chippi will surface new outreach here as it finds opportunities.</p>
          </div>
        </div>
      )}

      {/* Draft rows */}
      {!loading && drafts.length > 0 && (
        <div className="divide-y divide-border/40">
          {drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} slug={slug} onAction={handleAction} />
          ))}
        </div>
      )}
    </section>
  );
}
