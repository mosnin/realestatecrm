import { NextResponse } from 'next/server';
import { auth, createClerkClient } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clerkAdmin = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * PATCH /api/admin/users/[id]/profile
 *
 * Platform-admin edit of a realtor's identity (name and/or email). Clerk is the
 * source of truth for identity, so we update CLERK FIRST and only mirror the DB
 * once Clerk accepts — mirroring how the rest of the app treats Clerk as
 * authoritative for name/email (e.g. onboarding backfills name FROM Clerk).
 *
 *   name  → split into first/last for clerk.users.updateUser, mirrored to User.name
 *   email → create a verified+primary email on the Clerk user, then mirror User.email
 *
 * Email is the sensitive one: we create the new address as verified+primary in
 * Clerk (admin-initiated, so we skip the user verification round-trip), which is
 * the documented way to change a primary email via the Backend API. The DB is
 * only updated after Clerk succeeds, so the two never diverge.
 */
export async function PATCH(req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: { name?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const wantsName = body.name !== undefined;
  const wantsEmail = body.email !== undefined;
  if (!wantsName && !wantsEmail) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Normalize + validate inputs.
  let nextName: string | null = null;
  if (wantsName) {
    nextName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 200)
        : null;
  }
  let nextEmail: string | null = null;
  if (wantsEmail) {
    if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email.trim())) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    nextEmail = body.email.trim().toLowerCase().slice(0, 320);
  }

  // Resolve the target user.
  const { data: userRow, error: userErr } = await supabase
    .from('User')
    .select('id, clerkId, email, name')
    .eq('id', id)
    .maybeSingle();
  if (userErr) {
    console.error('[admin/users/profile] lookup failed', userErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const target = userRow as { id: string; clerkId: string; email: string; name: string | null };

  // If changing email, reject a collision with another existing user up front.
  if (nextEmail && nextEmail !== (target.email ?? '').toLowerCase()) {
    const { data: clash } = await supabase
      .from('User')
      .select('id')
      .eq('email', nextEmail)
      .neq('id', target.id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json({ error: 'Another account already uses that email.' }, { status: 409 });
    }
  }

  const dbUpdate: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};

  // ── Name → Clerk first, then DB mirror ───────────────────────────────────────
  if (wantsName && (nextName ?? '') !== (target.name ?? '')) {
    const parts = (nextName ?? '').split(/\s+/).filter(Boolean);
    const firstName = parts.length > 0 ? parts[0] : '';
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    try {
      await clerkAdmin.users.updateUser(target.clerkId, { firstName, lastName });
    } catch (err) {
      console.error('[admin/users/profile] Clerk name update failed', err);
      return NextResponse.json(
        { error: 'Could not update the name in Clerk. No change applied.' },
        { status: 502 },
      );
    }
    dbUpdate.name = nextName;
    changes.name = { from: target.name, to: nextName };
  }

  // ── Email → create verified+primary on Clerk, then DB mirror ─────────────────
  if (nextEmail && nextEmail !== (target.email ?? '').toLowerCase()) {
    try {
      const created = await clerkAdmin.emailAddresses.createEmailAddress({
        userId: target.clerkId,
        emailAddress: nextEmail,
        verified: true,
        primary: true,
      });
      // Ensure it's set as the primary (createEmailAddress primary:true handles
      // this, but make it explicit so a Clerk version that ignores the flag
      // still ends up correct).
      await clerkAdmin.users.updateUser(target.clerkId, {
        primaryEmailAddressID: created.id,
      });
    } catch (err) {
      console.error('[admin/users/profile] Clerk email update failed', err);
      return NextResponse.json(
        { error: 'Could not update the email in Clerk. The name change (if any) was applied.' },
        { status: 502 },
      );
    }
    dbUpdate.email = nextEmail;
    changes.email = { from: target.email, to: nextEmail };
  }

  if (Object.keys(dbUpdate).length === 0) {
    return NextResponse.json({ success: true, message: 'No changes — values already current.' });
  }

  const { error: updErr } = await supabase.from('User').update(dbUpdate).eq('id', target.id);
  if (updErr) {
    // Clerk already moved; surface loudly so the mismatch is corrected.
    console.error('[admin/users/profile] DB mirror failed after Clerk update', updErr);
    return NextResponse.json(
      { error: 'Identity updated in Clerk but the database mirror failed. Retry.' },
      { status: 500 },
    );
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'edit_user_profile',
    target: target.id,
    details: changes,
  });

  return NextResponse.json({ success: true, changes });
}
