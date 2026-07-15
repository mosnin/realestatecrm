'use client';

/**
 * ConfirmDialog — the admin console's confirmation modal, replacing the
 * native `window.confirm()` calls that were scattered across the destructive
 * admin flows (revoke invite, remove member, reverse credit, revoke comp,
 * delete brokerage). A blocking OS-chrome `confirm()` is the antithesis of the
 * rest of the surface: it can't carry a danger color, an icon, an async
 * pending state, or inline error text, and it looks nothing like the polished
 * `Dialog` used everywhere else.
 *
 * This wraps the shared Dialog primitive so confirmation feels like one
 * system. It owns its own busy + error state so callers just provide an async
 * `onConfirm` that throws (or returns a string) on failure.
 *
 * NOTE: there is a separate `components/ui/confirm-dialog.tsx` primitive, but
 * it is a *controlled* dialog (caller owns open state) + `useConfirm` hook,
 * takes a string-only description, and surfaces no danger glyph / inline error.
 * The admin destructive flows are trigger-driven with rich descriptions
 * (e.g. <strong>{email}</strong>) and need inline error text, so this wrapper
 * is intentional rather than a duplicate. The shared primitive can't be
 * extended here without editing a `components/ui/*` file.
 *
 * Usage — trigger-driven (most call sites):
 *   <ConfirmDialog
 *     trigger={<Button variant="ghost" size="sm">Revoke</Button>}
 *     title="Revoke invitation"
 *     description={<>Revoke the pending invite to <strong>{email}</strong>?</>}
 *     confirmLabel="Revoke"
 *     tone="danger"
 *     onConfirm={async () => { await doRevoke(); }}
 *   />
 */

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * SOC2 step-up: when set, the dialog requires the admin to type a reason
 * (≥10 chars, captured into the audit trail) AND retype an exact confirmation
 * phrase before the confirm button enables. The server routes enforce the same
 * (lib/admin-stepup.ts); this is the collection UI. onConfirm receives the
 * collected { reason, confirm } so the caller can put them in the request body.
 */
export interface StepUp {
  /** The exact string the admin must retype (e.g. the target email, or 'SEND'). */
  confirmationPhrase: string;
  /** Short label above the confirmation input, e.g. "Type the email to confirm". */
  confirmationLabel?: string;
}

interface ConfirmDialogProps {
  /** The element that opens the dialog (a Button). */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button destructive + shows a warning glyph. */
  tone?: 'danger' | 'default';
  /** Enable reason + typed-confirmation capture (SOC2 step-up). */
  stepUp?: StepUp;
  /**
   * Runs on confirm. Throw an Error (or return a string) to surface an inline
   * error and keep the dialog open; resolve cleanly to close it. When `stepUp`
   * is set, receives the collected { reason, confirm } to include in the body.
   */
  onConfirm: (stepUp?: { reason: string; confirm: string }) => Promise<void | string> | void | string;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  stepUp,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const reasonOk = !stepUp || reason.trim().length >= 10;
  const confirmOk = !stepUp || confirmText === stepUp.confirmationPhrase;
  const stepUpOk = reasonOk && confirmOk;

  function reset() {
    setError(null);
    setReason('');
    setConfirmText('');
  }

  async function handleConfirm() {
    if (!stepUpOk) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onConfirm(
        stepUp ? { reason: reason.trim(), confirm: confirmText } : undefined,
      );
      if (typeof result === 'string' && result) {
        setError(result);
        return;
      }
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === 'danger' && (
              <AlertTriangle
                size={16}
                className="text-destructive flex-shrink-0"
                strokeWidth={2}
              />
            )}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {stepUp && (
          <div className="flex flex-col gap-3 py-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground/80">
                Reason (recorded in the audit log)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this action necessary?"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              {reason.length > 0 && !reasonOk && (
                <span className="text-[11px] text-muted-foreground">At least 10 characters.</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground/80">
                {stepUp.confirmationLabel ?? `Type "${stepUp.confirmationPhrase}" to confirm`}
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive px-1" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={loading || !stepUpOk}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
