import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/broker/leads/export
 * Export all leads across the brokerage as a CSV download.
 * Auth: broker_owner / broker_admin only.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  // ── Fetch all member user IDs ──────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId, User!BrokerageMembership_userId_fkey(id, name, email)')
    .eq('brokerageId', brokerage.id);

  const members = (memberships ?? []) as Array<{
    userId: string;
    User: { id: string; name: string | null; email: string } | null;
  }>;
  const memberUserIds = members.map((m) => m.userId);

  if (memberUserIds.length === 0) {
    const csv = 'Name,Email,Phone,Lead Type,Budget,Score,Score Label,Status,Property Address,Notes,Move-in Date,Employment,Income,Assigned To,Created At\n';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  // ── Get spaces owned by members ─────────────────────────────────────────
  const { data: spaces } = await supabase
    .from('Space')
    .select('id, ownerId')
    .in('ownerId', memberUserIds);

  const spaceIds = (spaces ?? []).map((s) => s.id);
  if (spaceIds.length === 0) {
    const csv = 'Name,Email,Phone,Lead Type,Budget,Score,Score Label,Status,Property Address,Notes,Move-in Date,Employment,Income,Assigned To,Created At\n';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  // Build lookup: spaceId -> member name
  const spaceToMember: Record<string, string> = {};
  for (const sp of spaces ?? []) {
    const member = members.find((m) => m.userId === sp.ownerId);
    spaceToMember[sp.id] = member?.User?.name ?? member?.User?.email ?? 'Unknown';
  }

  // ── Fetch all contacts from member spaces ──────────────────────────────
  const { data: contacts, error } = await supabase
    .from('Contact')
    .select(
      'name, email, phone, "leadType", budget, "leadScore", "scoreLabel", "scoringStatus", address, notes, "applicationData", "spaceId", "createdAt"',
    )
    .in('spaceId', spaceIds)
    .order('createdAt', { ascending: false })
    .limit(10000);

  if (error) {
    console.error('[broker/leads/export] query error', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }

  const rows = contacts ?? [];

  // ── Build CSV ──────────────────────────────────────────────────────────
  const headers = [
    'Name',
    'Email',
    'Phone',
    'Lead Type',
    'Budget',
    'Score',
    'Score Label',
    'Status',
    'Property Address',
    'Notes',
    'Move-in Date',
    'Employment',
    'Income',
    'Assigned To',
    'Created At',
  ];

  const csvRows = rows.map((c: Record<string, unknown>) => {
    const appData = (c.applicationData ?? {}) as Record<string, unknown>;
    const moveIn = appData.moveInDate ?? appData.move_in_date ?? '';
    const employment = appData.employment ?? appData.employmentStatus ?? '';
    const income = appData.income ?? appData.monthlyIncome ?? appData.annualIncome ?? '';

    return [
      csvEscape(String(c.name ?? '')),
      csvEscape(String(c.email ?? '')),
      csvEscape(String(c.phone ?? '')),
      csvEscape(String(c.leadType ?? '')),
      csvEscape(String(c.budget ?? '')),
      csvEscape(String(c.leadScore ?? '')),
      csvEscape(String(c.scoreLabel ?? '')),
      csvEscape(String(c.scoringStatus ?? '')),
      csvEscape(String(c.address ?? '')),
      csvEscape(String(c.notes ?? '')),
      csvEscape(String(moveIn)),
      csvEscape(String(employment)),
      csvEscape(String(income)),
      csvEscape(spaceToMember[c.spaceId as string] ?? ''),
      csvEscape(c.createdAt ? new Date(c.createdAt as string).toISOString() : ''),
    ].join(',');
  });

  const csv = [headers.join(','), ...csvRows].join('\n');
  const filename = `${brokerage.name.replace(/[^a-zA-Z0-9]/g, '_')}_leads_export_${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(val: string): string {
  let safe = val;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `\t${safe}`;
  }
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe !== val) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
