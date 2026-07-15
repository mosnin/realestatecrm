'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { ConfirmDialog } from '@/app/admin/components/confirm-dialog';
import { Pencil, ShieldCheck, ShieldOff, Trash2, UserCog, Building2 } from 'lucide-react';

export interface MembershipSummary {
  id: string;
  role: string;
  brokerageId: string;
  brokerageName: string;
}

interface AccountManagementProps {
  userId: string;
  email: string;
  name: string | null;
  platformRole: string;
  /** True when this row is the signed-in admin — disables self-destructive ops. */
  isSelf: boolean;
  memberships: MembershipSummary[];
}

const ROLE_LABEL: Record<string, string> = {
  broker_owner: 'Owner',
  broker_admin: 'Admin',
  realtor_member: 'Realtor',
};

export function AccountManagement({
  userId,
  email,
  name,
  platformRole: initialPlatformRole,
  isSelf,
  memberships,
}: AccountManagementProps) {
  const router = useRouter();

  // ── Profile edit ────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(name ?? '');
  const [editEmail, setEditEmail] = useState(email);
  const [editLoading, setEditLoading] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);

  // ── Platform role ─────────────────────────────────────────────────────────────
  const [platformRole, setPlatformRole] = useState(initialPlatformRole);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleResult, setRoleResult] = useState<string | null>(null);

  // ── Membership role ──────────────────────────────────────────────────────────
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberResult, setMemberResult] = useState<string | null>(null);

  // ── Delete ───────────────────────────────────────────────────────────────────
  // Deletion is a SOC2 step-up action: the ConfirmDialog collects a reason +
  // the typed target email and hands them to handleDelete for the request body.

  async function handleSaveProfile() {
    setEditLoading(true);
    setEditResult(null);
    const payload: Record<string, string> = {};
    if (editName.trim() !== (name ?? '')) payload.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== email.toLowerCase()) payload.email = editEmail.trim();
    if (Object.keys(payload).length === 0) {
      setEditResult('No changes to save.');
      setEditLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setEditResult('Saved.');
        setEditOpen(false);
        router.refresh();
      } else {
        setEditResult(data.error || 'Failed to save.');
      }
    } catch {
      setEditResult('Network error. Try again.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleSetPlatformRole(next: string) {
    setRoleLoading(true);
    setRoleResult(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformRole: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlatformRole(next);
        setRoleResult(next === 'admin' ? 'Promoted to platform admin.' : 'Demoted to user.');
        router.refresh();
      } else {
        setRoleResult(data.error || 'Failed to change role.');
      }
    } catch {
      setRoleResult('Network error. Try again.');
    } finally {
      setRoleLoading(false);
    }
  }

  async function handleSetMembershipRole(membershipId: string, role: string) {
    setMemberBusy(membershipId);
    setMemberResult(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, membershipRole: role }),
      });
      const data = await res.json();
      if (res.ok) {
        setMemberResult('Membership role updated.');
        router.refresh();
      } else {
        setMemberResult(data.error || 'Failed to update membership role.');
      }
    } catch {
      setMemberResult('Network error. Try again.');
    } finally {
      setMemberBusy(null);
    }
  }

  async function handleDelete(stepUp?: { reason: string; confirm: string }) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: stepUp?.reason, confirm: stepUp?.confirm }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/admin/users');
        router.refresh();
        return;
      }
      return data.error || 'Delete failed.';
    } catch {
      return 'Network error. Try again.';
    }
  }

  const isAdmin = platformRole === 'admin';

  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Account management
      </p>
      <Card>
        <CardContent className="px-5 py-4 space-y-4">
          {/* Edit profile */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Pencil size={13} />
                Profile (name &amp; email)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Edits identity in Clerk and the database. Email becomes the new
                verified primary.
              </p>
            </div>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 flex-shrink-0">
                  <Pencil size={13} />
                  Edit profile
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>
                    Update the name and email for this account. Changes sync to
                    Clerk (the source of truth for identity).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editLoading}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={editLoading}>
                    {editLoading ? 'Saving...' : 'Save changes'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {editResult && <p className="text-xs text-muted-foreground">{editResult}</p>}

          <div className="border-t border-border" />

          {/* Platform role */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <UserCog size={13} />
                Platform role
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current: <span className="font-medium">{isAdmin ? 'Platform admin' : 'User'}</span>
                {isSelf && ' — this is your own account.'}
              </p>
            </div>
            {isAdmin ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetPlatformRole('user')}
                disabled={roleLoading || isSelf}
                title={isSelf ? 'You cannot remove your own admin access.' : undefined}
                className="text-xs gap-1.5 flex-shrink-0"
              >
                <ShieldOff size={13} />
                {roleLoading ? 'Working...' : 'Demote to user'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetPlatformRole('admin')}
                disabled={roleLoading}
                className="text-xs gap-1.5 flex-shrink-0"
              >
                <ShieldCheck size={13} />
                {roleLoading ? 'Working...' : 'Make platform admin'}
              </Button>
            )}
          </div>
          {roleResult && <p className="text-xs text-muted-foreground">{roleResult}</p>}

          {/* Brokerage memberships */}
          {memberships.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 size={13} />
                  Brokerage roles
                </p>
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {memberships.map((m) => {
                    const isOwner = m.role === 'broker_owner';
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{m.brokerageName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {ROLE_LABEL[m.role] ?? m.role}
                          </p>
                        </div>
                        {isOwner ? (
                          <span className="text-[11px] text-muted-foreground">Owner — transfer to change</span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleSetMembershipRole(m.id, e.target.value)}
                            disabled={memberBusy === m.id}
                            className="text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="broker_admin">Admin</option>
                            <option value="realtor_member">Realtor</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
                {memberResult && <p className="text-xs text-muted-foreground">{memberResult}</p>}
              </div>
            </>
          )}

          <div className="border-t border-border" />

          {/* Delete / offboard */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5 text-destructive">
                <Trash2 size={13} />
                Delete account
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently removes the Clerk login and (when hard-delete is on)
                the entire workspace. This is not suspension — it cannot be undone.
              </p>
            </div>
            <ConfirmDialog
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSelf || isAdmin}
                  title={
                    isSelf
                      ? 'You cannot delete your own account here.'
                      : isAdmin
                        ? 'Demote this platform admin before deleting.'
                        : undefined
                  }
                  className="text-xs gap-1.5 flex-shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={13} />
                  Delete account
                </Button>
              }
              title="Delete account"
              description={
                <>
                  This permanently deletes <strong>{email}</strong> — the Clerk
                  login and, when hard-delete is enabled, all of their workspace
                  data. This cannot be undone.
                </>
              }
              confirmLabel="Permanently delete"
              tone="danger"
              stepUp={{
                confirmationPhrase: email,
                confirmationLabel: 'Type the email to confirm deletion',
              }}
              onConfirm={handleDelete}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
