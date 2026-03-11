'use client';

import { useActionState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { resetUserOnboardingAction, setUserRoleAction } from '@/app/actions';

type AdminUser = {
  id: string;
  clerkId: string;
  name: string | null;
  email: string;
  createdAt: string;
  onboardingCompletedAt: string | null;
  onboardingCurrentStep: number;
  role: 'admin' | 'member';
  workspaceSlug: string | null;
};

type ActionState = {
  error?: string;
  success?: string;
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function AdminDashboard({ users }: { users: AdminUser[] }) {
  const [roleState, roleAction, rolePending] = useActionState<ActionState, FormData>(
    setUserRoleAction,
    {}
  );
  const [resetState, resetAction, resetPending] = useActionState<ActionState, FormData>(
    resetUserOnboardingAction,
    {}
  );

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const onboardedCount = users.filter((u) => !!u.onboardingCompletedAt).length;
  const workspaceCount = users.filter((u) => !!u.workspaceSlug).length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage user access, onboarding lifecycle, and workspace ownership.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={users.length} />
        <StatCard label="Admins" value={adminCount} />
        <StatCard label="Onboarded users" value={onboardedCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Privileged operations are server-validated and require admin authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name || 'Unnamed user'}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.onboardingCompletedAt ? (
                      <Badge variant="secondary">Complete</Badge>
                    ) : (
                      <Badge variant="outline">Step {user.onboardingCurrentStep}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{user.workspaceSlug ?? '—'}</TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <form action={roleAction}>
                        <input type="hidden" name="targetClerkId" value={user.clerkId} />
                        <input
                          type="hidden"
                          name="role"
                          value={user.role === 'admin' ? 'member' : 'admin'}
                        />
                        <Button size="sm" variant="outline" type="submit" disabled={rolePending}>
                          {user.role === 'admin' ? 'Demote' : 'Promote'}
                        </Button>
                      </form>

                      <form action={resetAction}>
                        <input type="hidden" name="targetClerkId" value={user.clerkId} />
                        <Button size="sm" variant="outline" type="submit" disabled={resetPending}>
                          Reset onboarding
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap gap-3 text-sm">
            {roleState.error && <p className="text-destructive">{roleState.error}</p>}
            {roleState.success && <p className="text-emerald-600">{roleState.success}</p>}
            {resetState.error && <p className="text-destructive">{resetState.error}</p>}
            {resetState.success && <p className="text-emerald-600">{resetState.success}</p>}
            <span className="text-muted-foreground">Users with workspaces: {workspaceCount}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
