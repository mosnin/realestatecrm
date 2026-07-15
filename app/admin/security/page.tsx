import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { SecurityEventsClient, type SecurityEvent } from './security-client';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';

export const metadata = { title: 'Security events — Admin — Chippi' };

/**
 * Security events — the SOC2 review surface for privileged admin actions.
 *
 * Reads are allowed for any admin role (gated by the layout's requireAdmin +
 * this isPlatformAdmin check). We filter the AuditLog to ADMIN_ACTION rows —
 * every deletion, impersonation, refund, role change, DSAR export, broadcast,
 * DLQ replay, etc. flows through logAdminAction with action='ADMIN_ACTION' and
 * an `adminAction` metadata verb, so this is the one place to review who did
 * what, from where, and why.
 */
export default async function SecurityEventsPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const [logsRes, usersRes] = await Promise.all([
    supabase
      .from('AuditLog')
      .select('*')
      .eq('action', 'ADMIN_ACTION')
      .order('createdAt', { ascending: false })
      .limit(300),
    supabase.from('User').select('clerkId, name, email'),
  ]);

  const rows = (logsRes.data ?? []) as Array<{
    id: string;
    clerkId: string | null;
    actorId: string | null;
    ipAddress: string | null;
    action: string;
    resource: string;
    resourceId: string | null;
    spaceId: string | null;
    reason: string | null;
    confirmationText: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;

  const events: SecurityEvent[] = rows.map((r) => {
    const meta = r.metadata ?? {};
    const adminAction =
      typeof meta['adminAction'] === 'string' ? (meta['adminAction'] as string) : r.action;
    const reason =
      r.reason ?? (typeof meta['reason'] === 'string' ? (meta['reason'] as string) : null);
    return {
      id: r.id,
      clerkId: r.clerkId,
      actorId: r.actorId ?? null,
      ipAddress: r.ipAddress,
      adminAction,
      target: r.resourceId,
      reason,
      metadata: r.metadata,
      createdAt: r.createdAt,
    };
  });

  const userMap: Record<string, { name: string | null; email: string }> = {};
  for (const u of usersRes.data ?? []) {
    const user = u as { clerkId: string; name: string | null; email: string };
    userMap[user.clerkId] = { name: user.name, email: user.email };
  }

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        eyebrow="System."
        title="Security events"
        subtitle="Privileged admin actions, reviewable for SOC 2 (CC6.1 / CC7.3)."
      />
      <SecurityEventsClient events={events} userMap={userMap} />
    </div>
  );
}
