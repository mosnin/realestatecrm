'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    await fetch('/api/clients/auth/logout', { method: 'POST' });
    router.push('/clients/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} strokeWidth={1.75} />}
    </button>
  );
}
