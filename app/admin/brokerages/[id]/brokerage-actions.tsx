'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';

// ── Toggle suspend/reactivate ────────────────────────────────────────────────

interface ToggleProps {
  action: 'toggle-status';
  brokerageId: string;
  currentStatus: string;
}

// ── Remove a member ──────────────────────────────────────────────────────────

interface RemoveMemberProps {
  action: 'remove-member';
  membershipId: string;
  label: string;
}

// ── Change a member's role ───────────────────────────────────────────────────

interface ChangeMemberRoleProps {
  action: 'change-member-role';
  membershipId: string;
  currentRole: string;
}

// ── Invite / add a member to the brokerage ───────────────────────────────────

interface InviteMemberProps {
  action: 'invite-member';
  brokerageId: string;
}

// ── Revoke an invitation ─────────────────────────────────────────────────────

interface RevokeInviteProps {
  action: 'revoke-invite';
  invitationId: string;
  label: string;
}

// ── Delete the brokerage entirely ────────────────────────────────────────────

interface DeleteProps {
  action: 'delete';
  brokerageId: string;
  brokerageName: string;
}

type BrokerageActionsProps =
  | ToggleProps
  | RemoveMemberProps
  | ChangeMemberRoleProps
  | InviteMemberProps
  | RevokeInviteProps
  | DeleteProps;

export function BrokerageActions(props: BrokerageActionsProps) {
  const router = useRouter();

  if (props.action === 'toggle-status') {
    return <ToggleStatus {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'remove-member') {
    return <RemoveMember {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'change-member-role') {
    return <ChangeMemberRole {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'invite-member') {
    return <InviteMember {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'revoke-invite') {
    return <RevokeInvite {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'delete') {
    return <DeleteBrokerage {...props} />;
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleStatus({
  brokerageId,
  currentStatus,
  onDone,
}: ToggleProps & { onDone: () => void }) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = status === 'active' ? 'suspended' : 'active';
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/brokerages/${brokerageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        onDone();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Couldn’t update status. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Button
        variant="outline"
        size="sm"
        onClick={toggle}
        disabled={loading}
        className="w-full text-xs justify-start"
      >
        {loading ? '…' : status === 'active' ? 'Suspend brokerage' : 'Reactivate brokerage'}
      </Button>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function RemoveMember({
  membershipId,
  label,
  onDone,
}: RemoveMemberProps & { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Remove ${label} from this brokerage?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/memberships/${membershipId}`, { method: 'DELETE' });
      if (res.ok) {
        onDone();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Couldn’t remove member.');
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
        onClick={remove}
        disabled={loading}
        className="text-xs text-destructive hover:text-destructive h-7 px-2"
      >
        {loading ? '…' : 'Remove'}
      </Button>
      {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function ChangeMemberRole({
  membershipId,
  currentRole,
  onDone,
}: ChangeMemberRoleProps & { onDone: () => void }) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    if (next === role) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/memberships/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      if (res.ok) {
        setRole(next);
        onDone();
      } else {
        const data = await res.json().catch(() => ({}));
        // Keep the select reflecting the unchanged role on failure.
        setError(data.error || 'Couldn’t change role.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <select
        value={role}
        onChange={(e) => change(e.target.value)}
        disabled={loading}
        aria-label="Member role"
        className="text-[11px] rounded-md border border-border bg-card px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="broker_admin">Admin</option>
        <option value="realtor_member">Realtor</option>
      </select>
      {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function InviteMember({
  brokerageId,
  onDone,
}: InviteMemberProps & { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('realtor_member');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerageId, email: email.trim(), role }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.added ? 'Member added.' : data.duplicate ? 'Invite already pending — re-sent.' : 'Invitation sent.');
        setEmail('');
        setOpen(false);
        onDone();
      } else {
        setResult(data.error || 'Failed to invite.');
      }
    } catch {
      setResult('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <UserPlus size={13} />
            Invite member
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Add an existing user directly, or email an invitation to someone new.
              Subject to the brokerage&apos;s seat limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full text-sm rounded-md border border-border bg-card px-2 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="realtor_member">Realtor</option>
                <option value="broker_admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading || !email.trim()}>
              {loading ? 'Sending...' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {result && <p className="text-xs text-muted-foreground mt-1">{result}</p>}
    </>
  );
}

function RevokeInvite({
  invitationId,
  label,
  onDone,
}: RevokeInviteProps & { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!confirm(`Revoke invitation to ${label}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        onDone();
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
        className="text-xs text-destructive hover:text-destructive h-7 px-2"
      >
        {loading ? '…' : 'Revoke'}
      </Button>
      {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function DeleteBrokerage({ brokerageId, brokerageName }: DeleteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteBrokerage() {
    if (
      !confirm(
        `Delete "${brokerageName}"?\n\nThis permanently removes all memberships and unlinks workspaces. This cannot be undone.`
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/brokerages/${brokerageId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/brokerages');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Couldn’t delete brokerage.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Button
        variant="outline"
        size="sm"
        onClick={deleteBrokerage}
        disabled={loading}
        className="w-full text-xs justify-start border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {loading ? '…' : 'Delete brokerage'}
      </Button>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
