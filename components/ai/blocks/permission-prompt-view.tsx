'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  X,
  Pencil,
  Loader2,
  Infinity as InfinityIcon,
  Clock,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolApproval, type ToolApprovalStatus } from '@/components/ai/agent-status';
import { permissionArgFields, permissionPromptTitle } from '@/lib/ai-tools/permission-copy';

/** SMS one-segment budget (GSM-7). Long-form is 153/segment after the first. */
const SMS_SOFT_LIMIT = 160;

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
  /** Specialist pause while the parent turn is still streaming. */
  inline?: boolean;
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
      <div className="mt-2.5 space-y-1.5 bg-transparent py-1 text-[12px]">
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
      <div className="mt-2.5 space-y-1.5 bg-transparent py-1 text-[12px]">
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
  const fields = permissionArgFields(prompt.name, prompt.args);
  if (fields.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-1.5 bg-transparent py-1 text-[12px]">
      {fields.map((field) => (
        <div key={field.label}>
          <span className="font-medium text-muted-foreground">{field.label}:</span>{' '}
          <span className="whitespace-pre-wrap text-foreground/90">{field.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Inline send card for send_email / send_sms. The realtor edits in place
 * — no JSON, no pencil. Send fires the existing confirmation pipeline with the
 * edited subject/body, which routes to Resend (email) or Telnyx (SMS) on
 * the server side. Read-only recipient (To:) — recipient selection happens
 * upstream in the Chippi conversation, not in this card.
 */
function InlineComposeCard({
  kind,
  args,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  disabled,
}: {
  kind: 'email' | 'sms';
  args: Record<string, unknown>;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  disabled?: boolean;
}) {
  const to =
    kind === 'email'
      ? typeof args.toEmail === 'string'
        ? args.toEmail
        : typeof args.contactId === 'string'
          ? `Contact ${String(args.contactId).slice(0, 8)}`
          : '—'
      : typeof args.toPhone === 'string'
        ? args.toPhone
        : typeof args.contactId === 'string'
          ? `Contact ${String(args.contactId).slice(0, 8)}`
          : '—';

  const smsLen = body.length;
  const smsOver = smsLen > SMS_SOFT_LIMIT;
  const smsSegments = smsLen === 0 ? 0 : Math.ceil(Math.max(smsLen, 1) / SMS_SOFT_LIMIT);

  return (
    <div className="mt-2.5 overflow-hidden border-y border-border/40 bg-transparent">
      {/* To row — read-only */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/60 text-[12px] text-muted-foreground">
        {kind === 'email' ? (
          <Mail size={11} className="flex-shrink-0 text-muted-foreground/70" aria-hidden />
        ) : (
          <MessageSquare size={11} className="flex-shrink-0 text-muted-foreground/70" aria-hidden />
        )}
        <span className="font-medium">To:</span>
        <span className="truncate text-foreground/80">{to}</span>
      </div>

      {/* Subject row (email only) — editable */}
      {kind === 'email' && (
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={disabled}
          placeholder="Subject"
          className="w-full px-2.5 py-2 text-[13px] font-medium bg-transparent border-b border-border/60 text-foreground outline-none focus:border-foreground/40 transition-colors placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
      )}

      {/* Body — editable, auto-grow with a max height to keep the prompt compact */}
      <textarea
        value={body}
        onChange={(e) => {
          onBodyChange(e.target.value);
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 280)}px`;
        }}
        disabled={disabled}
        rows={kind === 'email' ? 6 : 3}
        placeholder={kind === 'email' ? 'Body…' : 'Message…'}
        className="w-full px-2.5 py-2 text-[13px] bg-transparent text-foreground outline-none resize-none leading-relaxed placeholder:text-muted-foreground/50 disabled:opacity-60 max-h-[280px]"
      />

      {/* Char counter for SMS */}
      {kind === 'sms' && (
        <div className="flex items-center justify-end gap-2 px-2.5 pb-1.5 text-[11px] tabular-nums text-muted-foreground/70">
          <span className={cn(smsOver && 'text-amber-600 dark:text-amber-400')}>
            {smsLen} / {SMS_SOFT_LIMIT}
            {smsSegments > 1 && (
              <>
                {' '}· {smsSegments} segments
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
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
 * The Chat-mode "user confirms before mutation" card. Work mode executes
 * requested actions directly and does not render this surface. The card renders
 * a summary + args preview, with Run / Cancel buttons inline. Clicking the pencil
 * opens an editor so the user can tweak the JSON args before confirming — the Phase 3d
 * edit-args path is already supported server-side.
 */
export function PermissionPromptView({
  prompt,
  onApprove,
  onDeny,
  onAlwaysAllow,
  busy,
}: PermissionPromptViewProps) {
  const isSendEmail = prompt.name === 'send_email';
  const isSendSms = prompt.name === 'send_sms';
  const isSendTool = isSendEmail || isSendSms;
  const requiresExactApproval = prompt.name === 'apply_workbook_transformation';

  const [editing, setEditing] = useState(false);
  const [argsText, setArgsText] = useState(() => {
    try { return JSON.stringify(prompt.args, null, 2); } catch { return '{}'; }
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny' | 'always'>(null);

  // A card instance can be reused for the next paused call. Never carry an
  // editable JSON state into an exact workbook approval.
  useEffect(() => {
    setEditing(false);
    setParseError(null);
    setSubmitError(null);
    try { setArgsText(JSON.stringify(prompt.args, null, 2)); } catch { setArgsText('{}'); }
  }, [prompt.requestId, prompt.args]);

  // Inline compose state for send_email / send_sms. The draft fields are
  // editable in place — no JSON-pencil step — and ride through to the
  // server as `editedArgs` on Send. Initial values come from the prompt's
  // args (what Chippi composed). Reset when the prompt id changes so a
  // second queued send doesn't show the previous draft.
  const initialCompose = useMemo(() => {
    const a = prompt.args as Record<string, unknown>;
    return {
      subject: typeof a.subject === 'string' ? a.subject : '',
      body: typeof a.body === 'string' ? a.body : '',
    };
  }, [prompt.args]);
  const [compose, setCompose] = useState(initialCompose);
  useEffect(() => {
    setCompose(initialCompose);
  }, [prompt.requestId, initialCompose]);

  const composeDirty =
    compose.subject !== initialCompose.subject || compose.body !== initialCompose.body;
  const composeEmpty = compose.body.trim().length === 0;

  /** Shared pre-parse for the approve paths — keeps the JSON editor DRY. */
  function resolveEditedArgs(): { ok: true; edited?: Record<string, unknown> } | { ok: false } {
    if (requiresExactApproval) return { ok: true };
    // Send tools: merge the inline compose state into the original args.
    // Even when not dirty we send the explicit values so the server's
    // schema is satisfied regardless of editor history.
    if (isSendTool) {
      const merged: Record<string, unknown> = { ...prompt.args, body: compose.body };
      if (isSendEmail) merged.subject = compose.subject;
      return { ok: true, edited: composeDirty ? merged : undefined };
    }
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
    setSubmitError(null);
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onApprove(prompt.requestId, parsed.edited);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Approval failed. Try again.');
    } finally {
      setSubmitting(null);
    }
  }

  async function doDeny() {
    setSubmitting('deny');
    setSubmitError(null);
    try {
      await onDeny(prompt.requestId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Denial failed. Try again.');
    } finally {
      setSubmitting(null);
    }
  }

  async function doAlwaysAllow() {
    if (!onAlwaysAllow) return;
    setSubmitting('always');
    setSubmitError(null);
    try {
      const parsed = resolveEditedArgs();
      if (!parsed.ok) {
        setSubmitting(null);
        return;
      }
      await onAlwaysAllow(prompt.requestId, parsed.edited);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Approval failed. Try again.');
    } finally {
      setSubmitting(null);
    }
  }

  const disabled = busy || submitting !== null;
  const approvalStatus: ToolApprovalStatus = submitting
    ? 'approving'
    : submitError
      ? 'error'
      : 'pending';

  const details = isSendTool ? (
    <InlineComposeCard
      kind={isSendEmail ? 'email' : 'sms'}
      args={prompt.args as Record<string, unknown>}
      subject={compose.subject}
      body={compose.body}
      onSubjectChange={(value) => setCompose((previous) => ({ ...previous, subject: value }))}
      onBodyChange={(value) => setCompose((previous) => ({ ...previous, body: value }))}
      disabled={disabled}
    />
  ) : editing && !requiresExactApproval ? (
    <div>
      <textarea
        value={argsText}
        onChange={(event) => {
          setArgsText(event.target.value);
          setParseError(null);
        }}
        rows={Math.min(10, Math.max(4, argsText.split('\n').length + 1))}
        className="w-full rounded-lg border border-border bg-transparent px-2.5 py-2 font-mono text-[11px] text-foreground outline-none transition-colors focus:border-foreground"
        spellCheck={false}
        disabled={disabled}
      />
      {parseError ? (
        <p role="alert" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
          {parseError}
        </p>
      ) : null}
    </div>
  ) : (
    PrettyArgs({ prompt }) ?? (
      <p className="border-y border-border/40 bg-transparent py-2 text-[12px] leading-relaxed text-foreground/85">
        {prompt.summary}
      </p>
    )
  );

  return (
    <ToolApproval
      tool={prompt.name}
      title={permissionPromptTitle(prompt.name, prompt.summary)}
      description={prompt.summary}
      status={approvalStatus}
      defaultOpen
      actions={
        <>
          <button
            type="button"
            onClick={doApprove}
            disabled={disabled || (isSendTool && composeEmpty)}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background transition-opacity',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting === 'approve' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isSendTool ? (
              <Send size={12} />
            ) : (
              <Check size={12} />
            )}
            {isSendTool ? 'Allow and send' : editing ? 'Allow edited' : 'Allow once'}
          </button>
          {onAlwaysAllow && !requiresExactApproval ? (
            <button
              type="button"
              onClick={doAlwaysAllow}
              disabled={disabled}
              title={`Allow ${prompt.name} for the rest of this chat`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === 'always' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <InfinityIcon size={12} />
              )}
              Always allow
            </button>
          ) : null}
          <button
            type="button"
            onClick={doDeny}
            disabled={disabled}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === 'deny' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            {isSendTool ? 'Deny' : "Don't"}
          </button>
          {!isSendTool && !requiresExactApproval ? (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              disabled={disabled}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={11} />
              {editing ? 'Cancel edit' : 'Edit details'}
            </button>
          ) : null}
        </>
      }
    >
      {details}
      {(prompt.otherPendingCalls?.length ?? 0) > 0 ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Also queued in this run ({prompt.otherPendingCalls!.length})
          </p>
          <div className="space-y-1">
            {prompt.otherPendingCalls!.map((call) => (
              <div key={call.callId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={10} className="shrink-0" />
                <span>{call.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {submitError ? (
        <p role="alert" className="mt-3 text-[11px] text-rose-600 dark:text-rose-400">
          {submitError}
        </p>
      ) : null}
    </ToolApproval>
  );
}
