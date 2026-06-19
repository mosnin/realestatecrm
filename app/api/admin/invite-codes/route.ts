import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { logAdminAction } from '@/lib/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { PLANS, type PlanId } from '@/lib/plans';
import {
  listInviteCodes,
  createInviteCode,
  setInviteCodeActive,
} from '@/lib/billing/invite-codes';

/**
 * Platform-admin invite-code management. A code grants a Space FREE access (comp)
 * at a chosen plan, bypassing Stripe — redeeming one simply grants the existing
 * complimentary-access mechanism (see lib/billing/invite-codes.ts). All handlers
 * are gated by requirePlatformAdmin(); a non-admin gets 403 and never learns a
 * code exists.
 *
 *   GET    — list codes (usesCount/maxUses, expiry, active, …)
 *   POST   — create a code (auto-generates the code string when omitted)
 *   PATCH  — flip a code's `active` flag (deactivate / reactivate)
 *   DELETE — deactivate a code (?id=) — a soft delete, so the redemption ledger
 *            and usesCount stay intact for audit; deactivation already refuses it.
 */

// Validate + normalize the create body. Mirrors the admin/announcements
// validateBody shape (typed ok/error result the handler maps to 200/400).
function parseCreateBody(
  body: unknown,
):
  | {
      ok: true;
      data: {
        code: string | undefined;
        plan: PlanId;
        maxUses: number | null;
        expiresAt: string | null;
        compDurationDays: number | null;
        note: string | null;
      };
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;

  // Optional explicit code (else auto-generated server-side). Keep it short +
  // sane; the lib normalizes (trim + lowercase) and the DB UNIQUE is the backstop.
  let code: string | undefined;
  if (b.code !== undefined && b.code !== null && String(b.code).trim() !== '') {
    code = String(b.code).trim();
    if (code.length < 4 || code.length > 64) {
      return { ok: false, error: 'code must be 4-64 characters' };
    }
  }

  // Plan must be a known PlanId; default to the $97 'solo' tier when omitted.
  const planRaw = b.plan === undefined || b.plan === null || b.plan === '' ? 'solo' : String(b.plan);
  if (!(planRaw in PLANS)) return { ok: false, error: 'Invalid plan' };
  const plan = planRaw as PlanId;

  // maxUses: null/omitted = unlimited; else a positive integer.
  let maxUses: number | null = null;
  if (b.maxUses !== undefined && b.maxUses !== null && b.maxUses !== '') {
    const n = Number(b.maxUses);
    if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) {
      return { ok: false, error: 'maxUses must be a positive integer ≤ 1,000,000, or omitted for unlimited' };
    }
    maxUses = n;
  }

  // expiresAt: null/omitted = no expiry; else a parseable future-ish timestamp.
  let expiresAt: string | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null && b.expiresAt !== '') {
    const d = new Date(String(b.expiresAt));
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'expiresAt is not a valid date' };
    expiresAt = d.toISOString();
  }

  // compDurationDays: null/omitted = indefinite comp; else a positive day count.
  let compDurationDays: number | null = null;
  if (b.compDurationDays !== undefined && b.compDurationDays !== null && b.compDurationDays !== '') {
    const n = Number(b.compDurationDays);
    if (!Number.isFinite(n) || n <= 0 || n > 3650) {
      return { ok: false, error: 'compDurationDays must be 1-3650, or omitted for an indefinite comp' };
    }
    compDurationDays = Math.floor(n);
  }

  const note = typeof b.note === 'string' ? b.note.slice(0, 500) : null;

  return { ok: true, data: { code, plan, maxUses, expiresAt, compDurationDays, note } };
}

/** GET /api/admin/invite-codes — list all codes (admin only). */
export async function GET() {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:read:${admin.clerkUserId}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const codes = await listInviteCodes();
    return NextResponse.json({ codes });
  } catch (err) {
    console.error('[admin/invite-codes] list failed', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

/** POST /api/admin/invite-codes — create a code. */
export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:${admin.clerkUserId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const v = parseCreateBody(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const result = await createInviteCode({ ...v.data, createdByClerkId: admin.clerkUserId });
  if (!result.ok) {
    if (result.error === 'duplicate') {
      return NextResponse.json({ error: 'That code already exists. Choose another.' }, { status: 409 });
    }
    if (result.error === 'invalid') {
      return NextResponse.json({ error: 'Invalid code or plan.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'invite_code_create',
    target: result.row.id,
    details: { code: result.row.code, plan: result.row.plan, maxUses: result.row.maxUses },
  });

  return NextResponse.json({ code: result.row });
}

/** PATCH /api/admin/invite-codes — body { id, active } to flip the active flag. */
export async function PATCH(req: Request) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:${admin.clerkUserId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active (boolean) required' }, { status: 400 });
  }

  const ok = await setInviteCodeActive(id, body.active);
  if (!ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  await logAdminAction({
    actor: admin.clerkUserId,
    action: body.active ? 'invite_code_reactivate' : 'invite_code_deactivate',
    target: id,
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/invite-codes?id=… — soft delete (deactivate). */
export async function DELETE(req: Request) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { allowed } = await checkRateLimit(`admin:${admin.clerkUserId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ok = await setInviteCodeActive(id, false);
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

  await logAdminAction({ actor: admin.clerkUserId, action: 'invite_code_deactivate', target: id });
  return NextResponse.json({ ok: true });
}
