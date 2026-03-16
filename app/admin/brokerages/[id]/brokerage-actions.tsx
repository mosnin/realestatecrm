'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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

type BrokerageActionsProps = ToggleProps | RemoveMemberProps | RevokeInviteProps | DeleteProps;

export function BrokerageActions(props: BrokerageActionsProps) {
  const router = useRouter();

  if (props.action === 'toggle-status') {
    return <ToggleStatus {...props} onDone={() => router.refresh()} />;
  }
  if (props.action === 'remove-member') {
    return <RemoveMember {...props} onDone={() => router.refresh()} />;
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

  async function toggle() {
    const next = status === 'active' ? 'suspended' : 'active';
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/brokerages/${brokerageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        onDone();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="w-full text-xs justify-start"
    >
      {loading ? '…' : status === 'active' ? 'Suspend brokerage' : 'Reactivate brokerage'}
    </Button>
  );
}

function RemoveMember({
  membershipId,
  label,
  onDone,
}: RemoveMemberProps & { onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      await fetch(`/api/admin/memberships/${membershipId}`, { method: 'DELETE' });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={loading} className="text-xs text-destructive hover:text-destructive h-7 px-2">
          {loading ? '…' : 'Remove'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove member?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{label}</strong> from the brokerage and unlink their workspace. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RevokeInvite({
  invitationId,
  label,
  onDone,
}: RevokeInviteProps & { onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function revoke() {
    setLoading(true);
    try {
      await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={loading} className="text-xs text-destructive hover:text-destructive h-7 px-2">
          {loading ? '…' : 'Revoke'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            The invitation to <strong>{label}</strong> will be cancelled and can no longer be used to join.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={revoke} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteBrokerage({ brokerageId, brokerageName }: DeleteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function deleteBrokerage() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/brokerages/${brokerageId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/brokerages');
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          className="w-full text-xs justify-start border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {loading ? '…' : 'Delete brokerage'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{brokerageName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the brokerage, removes all memberships, and unlinks all member workspaces. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={deleteBrokerage}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
