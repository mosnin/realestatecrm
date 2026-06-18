'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

/**
 * Revoke (cancel) control for a single pending invitation. Wired to
 * PATCH /api/admin/invitations/[id] with { status: 'cancelled' }. Surfaces
 * errors inline on failure rather than silently no-op'ing. There is no resend
 * endpoint, so resend is intentionally not offered here.
 */
export function RevokeInvitation({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!confirm(`Revoke the pending invitation to ${email}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Couldn’t revoke invitation.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={revoke}
        disabled={loading}
        className="text-xs text-destructive hover:text-destructive h-7 px-2 gap-1"
      >
        <X size={12} />
        {loading ? '…' : 'Revoke'}
      </Button>
      {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}
