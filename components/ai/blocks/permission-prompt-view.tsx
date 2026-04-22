'use client';

import { useState } from 'react';
import { Check, X, Pencil, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PermissionPromptData {
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
}

interface PermissionPromptViewProps {
  prompt: PermissionPromptData;
  /** Async approve — may return/throw; component shows a spinner until it settles. */
  onApprove: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
  onDeny: (requestId: string) => Promise<void>;
  /** Disable when another approval is already processing (single-active rule). */
  busy?: boolean;
}

/**
 * The "user confirms before mutation" card. Renders the summary + the args
 * preview, with Approve / Deny buttons inline. Clicking the pencil opens an
 * editor so the user can tweak the JSON args before approving — the Phase 3d
 * edit-args path is already supported server-side.
 */
export function PermissionPromptView({ prompt, onApprove, onDeny, busy }: PermissionPromptViewProps) {
  const [editing, setEditing] = useState(false);
  const [argsText, setArgsText] = useState(() => JSON.stringify(prompt.args, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny'>(null);

  async function doApprove() {
    setSubmitting('approve');
    try {
      let edited: Record<string, unknown> | undefined = undefined;
      if (editing) {
        try {
          edited = JSON.parse(argsText) as Record<string, unknown>;
        } catch (err) {
          setParseError(
            err instanceof Error ? err.message : 'Invalid JSON. Fix before approving.',
          );
          setSubmitting(null);
          return;
        }
      }
      await onApprove(prompt.requestId, edited);
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
            <pre className="mt-2.5 text-[11px] bg-background/60 border border-border rounded-md px-2.5 py-1.5 font-mono text-foreground/80 overflow-x-auto">
              {JSON.stringify(prompt.args, null, 2)}
            </pre>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
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
