'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ConfirmDialog } from '@/app/admin/components/confirm-dialog';

/**
 * Revoke (cancel) control for a single pending invitation. Wired to
 * PATCH /api/admin/invitations/[id] with { status: 'cancelled' }. Surfaces
 * errors inline via ConfirmDialog rather than the old blocking native
 * confirm() (which couldn't carry the danger tone or a pending state). There
 * is no resend endpoint, so resend is intentionally not offered here.
 */
export function RevokeInvitation({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const router = useRouter();

  async function revoke() {
    const res = await fetch(`/api/admin/invitations/${invitationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    return data.error || 'Couldn’t revoke invitation.';
  }

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-destructive hover:text-destructive h-7 px-2 gap-1"
        >
          <X size={12} />
          Revoke
        </Button>
      }
      title="Revoke invitation"
      description={
        <>
          Revoke the pending invitation to <strong>{email}</strong>? They will
          need a fresh invite to join.
        </>
      }
      confirmLabel="Revoke invitation"
      tone="danger"
      onConfirm={revoke}
    />
  );
}
