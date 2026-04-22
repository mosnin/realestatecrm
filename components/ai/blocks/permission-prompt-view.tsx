'use client';

import { useState } from 'react';
import { Check, X, Pencil, ShieldCheck, Loader2, Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PermissionPromptData {
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  /**
   * Other mutating calls the model queued in the same batch. The prompt
   * itself only shows the current call — but the hook keeps this list so
   * a deny can immediately render cascade blocks for every skipped call,
   * matching what the server persists.
   */
  otherPendingCalls?: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
    summary: string;
  }>;
}

/**
 * Human-readable args preview. The JSON dump works for tools where the
 * realtor truly needs to see the shape (update_contact, create_deal), but
 * for send_email / send_sms — the tools where the ACTUAL content matters
 * most — JSON is noisy and the body field escapes newlines. Switch on the
 * tool name and render labeled fields for those.
 *
 * Returns `null` when there's no tool-specific renderer, so the caller
 * falls back to the generic JSON pre.
 */
function PrettyArgs({ prompt }: { prompt: PermissionPromptData }): React.ReactElement | null {
  const a = prompt.args as Record<string, unknown>;
  if (prompt.name === 'send_email') {
    const to = typeof a.toEmail === 'string' ? a.toEmail : typeof a.contactId === 'string' ? `contact ${a.contactId}` : '—';
    const subject = typeof a.subject === 'string' ? a.subject : '—';
    const body = typeof a.body === 'string' ? a.body : '';
    return (
      <div className="mt-2.5 space-y-1.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px]">
        <div><span className="text-muted-foreground font-medium">To:</span> {to}</div>
        <div><span className="text-muted-foreground font-medium">Subject:</span> {subject}</div>
        <div>
          <span className="text-muted-foreground font-medium">Body:</span>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-relaxed">
            {body.length > 400 ? `${body.slice(0, 400)}…` : body}
          </p>
        </div>
        {typeof a.replyTo === 'string' && a.replyTo && (
          <div><span className="text-muted-foreground font-medium">Reply-To:</span> {a.replyTo}</div>
        )}
      </div>
    );
  }
  if (prompt.name === 'send_sms') {
    const to = typeof a.toPhone === 'string' ? a.toPhone : typeof a.contactId === 'string' ? `contact ${a.contactId}` : '—';
    const body = typeof a.body === 'string' ? a.body : '';
    return (
      <div className="mt-2.5 space-y-1.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px]">
        <div><span className="text-muted-foreground font-medium">To:</span> {to}</div>
        <div>
          <span className="text-muted-foreground font-medium">Message:</span>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-relaxed">
            {body.length > 320 ? `${body.slice(0, 320)}…` : body}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

interface PermissionPromptViewProps {
  prompt: PermissionPromptData;
  /** Async approve — may return/throw; component shows a spinner until it settles. */
  onApprove: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  onDeny: (requestId: string) => Promise<void>;
  /**
   * Phase 4c — "Always allow <tool> for this chat". When provided, we render
   * a third button that trusts the tool for the remainder of this conversation
   * and then fires approve for the current call. Omit if auto-approval isn't
   * supported in the host context (e.g. an external embed).
   */
  onAlwaysAllow?: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  /** Disable when another approval is already processing (single-active rule). */
  busy?: boolean;
}

/**
 * The "user confirms before mutation" card. Renders the summary + the args
 * preview, with Approve / Deny buttons inline. Clicking the pencil opens an
 * editor so the user can tweak the JSON args before approving — the Phase 3d
 * edit-args path is already supported server-side.
 */
export function PermissionPromptView({
  prompt,
  onApprove,
  onDeny,
  onAlwaysAllow,
  busy,
}: PermissionPromptViewProps) {
  const [editing, setEditing] = useState(false);
  const [argsText, setArgsText] = useState(() => JSON.stringify(prompt.args, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny' | 'always'>(null);

  /** Shared pre-parse for the approve paths — keeps the JSON editor DRY. */
  function resolveEditedArgs(): { ok: true; edited?: Record<string, unknown> } | { ok: false } {
    if (!editing) return { ok: true };
    try {
      return { ok: true, edited: JSON.parse(argsText) as Record<string, unknown> };
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON. Fix before approving.');
      return { ok: false };
    }
  }

  async function doApprove() {
    setSubmitting('approve');
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onApprove(prompt.requestId, parsed.edited);
    } finally {
      setSubmitting(null);
    }
  }

  async function doDeny() {
    setSubmitting('deny');
    try {
      await onDeny(prompt.requestId);
    } finally {
      setSubmitting(null);
    }
  }

  async function doAlwaysAllow() {
    if (!onAlwaysAllow) return;
    setSubmitting('always');
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onAlwaysAllow(prompt.requestId, parsed.edited);
    } finally {
      setSubmitting(null);
    }
  }

  const disabled = busy || submitting !== null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-amber-700 dark:text-amber-400">
          <ShieldCheck size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-0.5">
            Approve before running
          </p>
          <p className="text-sm font-semibold text-foreground">{prompt.summary}</p>

          {/* Args preview / editor */}
          {editing ? (
            <div className="mt-2.5">
              <textarea
                value={argsText}
                onChange={(e) => {
                  setArgsText(e.target.value);
                  setParseError(null);
                }}
                rows={Math.min(10, Math.max(4, argsText.split('\n').length + 1))}
                className="w-full text-[11px] font-mono bg-background/80 border border-border rounded-md px-2.5 py-1.5 text-foreground outline-none focus:border-foreground transition-colors"
                spellCheck={false}
                disabled={disabled}
              />
              {parseError && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{parseError}</p>
              )}
            </div>
          ) : (
            (() => {
              // Prefer tool-specific pretty rendering for high-content tools
              // (send_email / send_sms); everything else still falls through
              // to the raw JSON so the power-user signal isn't lost.
              const pretty = PrettyArgs({ prompt });
              if (pretty) return pretty;
              return (
                <pre className="mt-2.5 text-[11px] bg-background/60 border border-border rounded-md px-2.5 py-1.5 font-mono text-foreground/80 overflow-x-auto">
                  {JSON.stringify(prompt.args, null, 2)}
                </pre>
              );
            })()
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doApprove}
              disabled={disabled}
              className={cn(
                'inline-flex items-center gap-1 rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-semibold transition-all',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting === 'approve' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              {editing ? 'Approve edited' : 'Approve'}
            </button>
            {onAlwaysAllow && (
              <button
                type="button"
                onClick={doAlwaysAllow}
                disabled={disabled}
                title={`Auto-approve ${prompt.name} for the rest of this chat`}
                className="inline-flex items-center gap-1 rounded-md border border-foreground/20 bg-background hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === 'always' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <InfinityIcon size={12} />
                )}
                Always allow
              </button>
            )}
            <button
              type="button"
              onClick={doDeny}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === 'deny' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              Deny
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={11} />
              {editing ? 'Cancel edit' : 'Edit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
