'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BODY_MUTED } from '@/lib/typography';

type Member = {
  id: string;
  userId: string;
  role: string;
  name: string | null;
  email: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

export function WorkspacePeopleSection({
  slug,
  canInvite,
}: {
  slug: string;
  canInvite: boolean;
}) {
  const [owner, setOwner] = useState<{ name: string | null; email: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    fetch(`/api/workspaces/invite?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setOwner(data.owner ?? null);
        setMembers(data.members ?? []);
        setInvites(data.invitations ?? []);
      })
      .catch(() => {});
  }, [slug]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setInviteUrl('');
    try {
      const res = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      });
      const data = (await res.json()) as { error?: string; inviteUrl?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not send the invite.');
        return;
      }
      setInviteUrl(data.inviteUrl ?? '');
      setEmail('');
      setInvites((prev) => [
        { id: data.inviteUrl ?? email, email: email.trim().toLowerCase(), role: 'member', expiresAt: '' },
        ...prev,
      ]);
    } catch {
      setError("Couldn't reach the server — usually temporary.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <p className={BODY_MUTED}>
        People who work in this business. Adding someone is a paid-plan feature.
      </p>
      <ul className="space-y-1.5 text-sm">
        {owner && (
          <li className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="truncate">{owner.name || owner.email}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Owner</span>
          </li>
        )}
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="truncate">{m.name || m.email}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.role}</span>
          </li>
        ))}
      </ul>
      {canInvite ? (
        <form onSubmit={(e) => void invite(e)} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            className="h-10 flex-1 rounded-lg border border-border/70 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? 'Inviting…' : 'Invite'}
          </button>
        </form>
      ) : (
        <p className={BODY_MUTED}>
          Upgrade to a paid plan to invite people into this workspace.{' '}
          <Link href="/subscribe" className="underline underline-offset-4">
            See plans
          </Link>
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {inviteUrl && (
        <p className="text-xs text-muted-foreground break-all">
          Invite sent. Link: {inviteUrl}
        </p>
      )}
      {invites.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {invites.length} pending {invites.length === 1 ? 'invite' : 'invites'}.
        </p>
      )}
    </section>
  );
}
