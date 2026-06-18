/**
 * Account deletion — the destructive sweep, in one reviewed place.
 *
 * GDPR right to erasure / CCPA right to delete (Privacy Policy §11.1). This is
 * the only place in the codebase that hard-deletes a user's full footprint, so
 * it lives behind a single function with the table-by-table plan documented in
 * docs/DATA-DELETION.md. Read that doc before touching this.
 *
 * How the cascade works (this is load-bearing):
 *   - `Space.ownerId REFERENCES "User"(id) ON DELETE CASCADE`
 *   - almost every Space-scoped table is `REFERENCES "Space"(id) ON DELETE CASCADE`
 *   So deleting the single User row cascades to the Space row, which cascades
 *   to Contact, Deal, Property, Conversation, Message, Note, Tour, etc. We do
 *   not hand-roll a deletion order — Postgres enforces it via the FK graph.
 *
 * What does NOT cascade (and so is swept explicitly here, BEFORE the User
 * delete, while we still hold the spaceId):
 *   - `Attachment`     — has spaceId but no FK to Space
 *   - `TelemetryEvent` — has nullable spaceId, no FK to Space
 *   - Wasabi storage objects — Postgres can't cascade into object storage, so
 *     we enumerate the keys and best-effort delete the blobs before the row
 *     cascade fires (see deleteSpaceStorageObjects).
 *
 * What is intentionally retained (see docs/DATA-DELETION.md §retention):
 *   - Stripe customer/invoice records (held by Stripe; legal/financial retention)
 *   - CommissionLedger (brokerage-owned financial record, not space-owned)
 *   - SupportTicket / Property pool rows that ON DELETE SET NULL rather than cascade
 *
 * The feature flag (ACCOUNT_DELETION_HARD_DELETE) gates the irreversible DB
 * sweep. With it off, the route still deletes the Clerk user and records the
 * request, but leaves the workspace rows intact for the documented manual /
 * reviewed run. This is deliberate: we do not ship an untested cascade as
 * always-on. Flip it once owner has signed off on docs/DATA-DELETION.md.
 */

import { createClerkClient } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { deleteObjectsBestEffort } from '@/lib/storage';
import { logger } from '@/lib/logger';

export function hardDeleteEnabled(): boolean {
  return process.env.ACCOUNT_DELETION_HARD_DELETE === 'true';
}

/**
 * Collect every Wasabi object key owned by a space, across the four tables that
 * carry a storage reference, and best-effort delete the underlying blobs.
 *
 * GDPR erasure means the bytes, not just the DB rows. The cascade deletes the
 * rows (File/DealDocument/ContactDocument via Space FK; Attachment is swept
 * explicitly), but Postgres knows nothing about Wasabi — without this the
 * objects survive forever. So we enumerate the keys WHILE the rows still exist
 * (before the cascade fires) and drop the blobs.
 *
 * Best-effort by design: a Wasabi failure here must never abort the DB
 * deletion (the user's right to erasure of their data outranks orphan-cleanup),
 * and the nightly storage-gc cron sweeps anything we miss. We log failures.
 *
 * Storage columns per table (verified against the migrations):
 *   - Attachment.storagePath        (chat-attachments/…)
 *   - File.storageKey               (files/… and studio/… — studio media is File rows)
 *   - DealDocument.storagePath      (deal-documents/…)
 *   - ContactDocument.storageKey    (contact-documents/…)
 */
async function deleteSpaceStorageObjects(spaceId: string): Promise<void> {
  const keys: string[] = [];

  const collect = (
    rows: Array<Record<string, unknown>> | null,
    col: string,
  ): void => {
    for (const row of rows ?? []) {
      const v = row[col];
      if (typeof v === 'string' && v.length > 0) keys.push(v);
    }
  };

  // Attachment + File are space-scoped directly. DealDocument + ContactDocument
  // also carry spaceId, so a single spaceId filter reaches every blob.
  const [att, file, deal, contact] = await Promise.all([
    supabase.from('Attachment').select('storagePath').eq('spaceId', spaceId),
    supabase.from('File').select('storageKey').eq('spaceId', spaceId),
    supabase.from('DealDocument').select('storagePath').eq('spaceId', spaceId),
    supabase.from('ContactDocument').select('storageKey').eq('spaceId', spaceId),
  ]);

  collect(att.data as Array<Record<string, unknown>> | null, 'storagePath');
  collect(file.data as Array<Record<string, unknown>> | null, 'storageKey');
  collect(deal.data as Array<Record<string, unknown>> | null, 'storagePath');
  collect(contact.data as Array<Record<string, unknown>> | null, 'storageKey');

  if (keys.length === 0) return;

  const { ok, failed } = await deleteObjectsBestEffort(keys);
  if (failed.length > 0) {
    logger.error(
      '[account-deletion] storage blob delete had failures — orphans left for storage-gc',
      { spaceId, attempted: keys.length, ok, failed: failed.length },
    );
  }
}

/**
 * Returns a reason string if the space's owner cannot be hard-deleted yet, or
 * null if deletion is safe to proceed.
 *
 * The one structural blocker: `Brokerage.ownerId REFERENCES "User"(id) ON
 * DELETE RESTRICT`. A broker who owns a brokerage cannot have their User row
 * deleted until the brokerage is transferred or removed — Postgres will reject
 * the delete. We surface that as a clear message rather than letting the DB
 * throw an opaque FK error at the user.
 */
export async function checkDeletionBlockers(ownerId: string): Promise<string | null> {
  const { data: ownedBrokerages } = await supabase
    .from('Brokerage')
    .select('id, name')
    .eq('ownerId', ownerId);

  if (ownedBrokerages && ownedBrokerages.length > 0) {
    return 'you own a brokerage. transfer or close it before deleting your account, or contact help@usechippi.com.';
  }
  return null;
}

/**
 * The destructive sweep. Deletes the non-cascading tables explicitly, then
 * deletes the User row (which cascades to Space and everything under it).
 *
 * Gated by hardDeleteEnabled(). Callers MUST check that flag and surface the
 * scaffold path when it's off — this function will throw if called with the
 * flag disabled, as a second guard against an accidental purge.
 */
export async function hardDeleteSpaceAndUser(params: {
  userDbId: string;
  spaceId: string;
}): Promise<void> {
  if (!hardDeleteEnabled()) {
    throw new Error('hardDeleteSpaceAndUser called with ACCOUNT_DELETION_HARD_DELETE off');
  }

  const { userDbId, spaceId } = params;

  // 0. Storage blobs FIRST — enumerate object keys while the rows that
  //    reference them still exist, then best-effort delete the Wasabi
  //    objects. Must precede the row deletes below (and the User cascade),
  //    or the keys are gone before we can read them. Never throws.
  await deleteSpaceStorageObjects(spaceId);

  // 1. Non-cascading tables — must go first, while the spaceId still resolves.
  const { error: attErr } = await supabase.from('Attachment').delete().eq('spaceId', spaceId);
  if (attErr) throw new Error(`Attachment delete failed: ${attErr.message}`);

  const { error: telErr } = await supabase.from('TelemetryEvent').delete().eq('spaceId', spaceId);
  if (telErr) throw new Error(`TelemetryEvent delete failed: ${telErr.message}`);

  // 2. The User row — cascades to Space → all Space-scoped FK tables.
  const { error: userErr } = await supabase.from('User').delete().eq('id', userDbId);
  if (userErr) throw new Error(`User delete failed: ${userErr.message}`);
}

// ── Orchestrated deletion (shared by self-service + admin offboard) ──────────

/**
 * Outcome of performAccountDeletion. `ok:false` carries a `status` so the
 * caller can map it onto an HTTP response without re-deriving the reason.
 */
export type AccountDeletionResult =
  | { ok: true; hardDeleted: boolean; pendingDataDeletion: boolean }
  | { ok: false; status: number; error: string; loginRemoved?: boolean };

/**
 * The full delete flow for ONE account, factored out of the self-service route
 * so the platform-admin offboard route can reuse the exact same sequence
 * (structural-blocker check → delete the Clerk identity → gated DB hard-delete).
 *
 * This deliberately does NOT do auth, rate-limiting, the type-to-confirm check,
 * or audit logging — those are the caller's responsibility and differ between
 * self-service (confirm = workspace name, audit as the user) and admin (confirm
 * handled in the UI dialog, audit via logAdminAction as the admin). Keeping
 * those out here lets both routes own their own policy while sharing the one
 * destructive sequence that must never drift between the two surfaces.
 *
 * Honors ACCOUNT_DELETION_HARD_DELETE: with the flag off, the Clerk identity is
 * removed (the part that actually locks the person out) and the workspace rows
 * are left for the reviewed manual run — exactly as the self-service route does.
 */
export async function performAccountDeletion(params: {
  userDbId: string;
  clerkId: string;
  spaceId: string | null;
}): Promise<AccountDeletionResult> {
  const { userDbId, clerkId, spaceId } = params;

  // Structural blockers (e.g. owning a brokerage → User delete is RESTRICTed).
  const blocker = await checkDeletionBlockers(userDbId);
  if (blocker) {
    return { ok: false, status: 409, error: blocker };
  }

  // Delete the Clerk identity first — always safe and is the part that actually
  // locks the person out. If the DB sweep is gated off, the worst case is an
  // orphaned set of rows with no login, cleaned up by the reviewed run.
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  try {
    await clerkClient.users.deleteUser(clerkId);
  } catch (err) {
    console.error('[account-deletion] Clerk deleteUser failed', err);
    return {
      ok: false,
      status: 500,
      error: "couldn't delete the login. nothing was removed — try again.",
    };
  }

  // The destructive DB sweep — gated. Off by default until owner signs off on
  // docs/DATA-DELETION.md. When off (or when there's no workspace to sweep), we
  // stop here: login is gone, rows await the reviewed run.
  if (!hardDeleteEnabled() || !spaceId) {
    return { ok: true, hardDeleted: false, pendingDataDeletion: !!spaceId };
  }

  try {
    await hardDeleteSpaceAndUser({ userDbId, spaceId });
  } catch (err) {
    // Login is already gone; the DB sweep failed. Surface it loudly — this is
    // the case to page on, because the row state is now partial.
    console.error('[account-deletion] hard delete failed after Clerk delete', err);
    return {
      ok: false,
      status: 500,
      loginRemoved: true,
      error:
        'the login was removed but data deletion did not finish. contact help@usechippi.com.',
    };
  }

  return { ok: true, hardDeleted: true, pendingDataDeletion: false };
}
