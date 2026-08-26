'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SpaceInviteAcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const res = await fetch(`/api/workspaces/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const data = (await res.json()) as { slug?: string; error?: string };
      if (!res.ok || !data.slug) {
        setError(data.error ?? 'Could not accept the invitation.');
        return;
      }
      router.push(`/s/${data.slug}`);
    } catch {
      setError("Couldn't reach the server — usually temporary.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void accept()}
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Joining…' : 'Join workspace'}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
