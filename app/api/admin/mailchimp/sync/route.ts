/**
 * POST /api/admin/mailchimp/sync
 *
 * One-shot backfill that mirrors EXISTING Chippi users into the Mailchimp
 * audience. New signups flow in automatically via the Clerk user.created
 * webhook; this endpoint catches everyone who pre-dates that.
 *
 * Admin-only. Idempotent (each member is a PUT upsert), so it is safe to run
 * repeatedly and to resume after a partial run.
 *
 * Body (all optional):
 *   { dryRun?: boolean, limit?: number, status?: 'subscribed'|'transactional' }
 *
 * GET returns a readiness probe: whether Mailchimp is configured, which
 * audience would be used, and how many users would sync.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  mailchimpConfigured,
  resolveAudienceId,
  upsertMember,
  splitName,
  type MemberStatus,
} from '@/lib/mailchimp';

export const maxDuration = 60;

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
}

export async function GET() {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  void admin;

  if (!mailchimpConfigured()) {
    return NextResponse.json({
      configured: false,
      hint: 'Set MAILCHIMP_API_KEY (e.g. "abc123-us21") in the environment.',
    });
  }

  const { id, audiences } = await resolveAudienceId();
  const { count } = await supabase
    .from('User')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null);

  return NextResponse.json({
    configured: true,
    audienceId: id,
    audiences: id ? undefined : audiences,
    needsAudienceId: !id,
    eligibleUsers: count ?? null,
  });
}

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!mailchimpConfigured()) {
    return NextResponse.json(
      { error: 'Mailchimp not configured. Set MAILCHIMP_API_KEY in the environment.' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean;
    limit?: number;
    status?: MemberStatus;
  };
  const dryRun = body.dryRun === true;
  const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 5000);
  const statusIfNew: MemberStatus = body.status === 'transactional' ? 'transactional' : 'subscribed';

  // Resolve the destination audience up front — fail loudly with the list of
  // available audiences rather than silently writing nowhere.
  const { id: audienceId, audiences } = await resolveAudienceId();
  if (!audienceId) {
    return NextResponse.json(
      {
        error:
          'Could not resolve a Mailchimp audience. Set MAILCHIMP_AUDIENCE_ID to one of the ids below.',
        audiences,
      },
      { status: 400 },
    );
  }

  // Pull users with an email. Most installs are well under 5k users, so a
  // single page is fine; the limit is a guard, not pagination.
  const { data, error } = await supabase
    .from('User')
    .select('id, email, name')
    .not('email', 'is', null)
    .limit(limit);

  if (error) {
    logger.error('[mailchimp/sync] user query failed', undefined, error);
    return NextResponse.json({ error: 'Failed to read users' }, { status: 500 });
  }

  const users = (data ?? []) as UserRow[];

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      audienceId,
      wouldSync: users.length,
      sample: users.slice(0, 5).map((u) => u.email),
    });
  }

  let synced = 0;
  let failed = 0;
  const errors: { email: string; error?: string }[] = [];

  // Sequential to stay well under Mailchimp's rate limits (10 concurrent).
  for (const u of users) {
    if (!u.email) continue;
    const { firstName, lastName } = splitName(u.name);
    const res = await upsertMember({
      email: u.email,
      firstName,
      lastName,
      audienceId,
      status: statusIfNew,
      tags: ['chippi-user', 'backfill'],
    });
    if (res.ok) {
      synced += 1;
    } else {
      failed += 1;
      if (errors.length < 25) errors.push({ email: u.email, error: res.error });
    }
  }

  void logAdminAction({
    actor: admin.userId,
    action: 'mailchimp_backfill',
    details: { audienceId, total: users.length, synced, failed, statusIfNew },
  });

  return NextResponse.json({
    ok: true,
    audienceId,
    total: users.length,
    synced,
    failed,
    errors,
  });
}
