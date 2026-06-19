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

interface ConfirmDialogProps {
  /** The element that opens the dialog (a Button). */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button destructive + shows a warning glyph. */
  tone?: 'danger' | 'default';
  /**
   * Runs on confirm. Throw an Error (or return a string) to surface an inline
   * error and keep the dialog open; resolve cleanly to close it.
   */
  onConfirm: () => Promise<void | string> | void | string;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (typeof result === 'string' && result) {
        setError(result);
        return;
      }
      setOpen(false);
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
            disabled={loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
