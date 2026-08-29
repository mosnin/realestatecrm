import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { sendDraft, type DeliveryResult } from '@/lib/delivery';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { normalizedLevenshtein } from '@/lib/draft-feedback';
import { claimPendingAgentDraft, markClaimedDraftSent } from '@/lib/agent/claim-pending-draft';

/**
 * Batch-approve pending agent drafts in one tap.
 *
 * Mirrors the auth + space-scoping shape of the single-draft PATCH endpoint
 * (`/api/agent/drafts/[id]`). Per-draft failure does NOT fail the batch —
 * the realtor batch-approves 5, four succeed, one returns its error, and the
 * UI surfaces per-item status from the `results[]` payload.
 *
 * Body: { draftIds: string[], edits?: { [draftId: string]: string } }
 * Returns: { results: [{ draftId, ok, error?, status?, deliveryResult? }] }
 *
 * Edited content: the realtor can tweak a draft in the inbox before batch-
 * approving. The optional `edits` map carries per-draft edited text; when an
 * entry is present we send the edited text and label the row
 * 'edited_and_approved' (mirrors the single-draft PATCH route). Drafts without
 * an edit fall back to the stored content and label 'approved'. Without this,
 * batch-approve silently shipped the un-edited stored draft.
 *
 * Server-side scoping: every draftId is verified to belong to the realtor's
 * space AND status='pending'. A compromised client passing ids from another
 * space gets per-item not_found, never an accidental cross-space send.
 *
 * Rate limit: 100 batch-approves per hour per space — one chat session might
 * batch 30-50 drafts; 100 covers the heaviest realtor.
 */

const MAX_BATCH_SIZE = 50;

interface BatchResult {
  draftId: string;
  ok: boolean;
  error?: string;
  status?: 'sent' | 'approved';
  deliveryResult?: DeliveryResult;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await checkRateLimit(`agent-drafts-batch-approve:${space.id}`, 100, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many batch approvals. Try again later.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const draftIds = (body as { draftIds?: unknown })?.draftIds;
  if (!Array.isArray(draftIds) || draftIds.length === 0) {
    return NextResponse.json(
      { error: 'draftIds must be a non-empty array' },
      { status: 400 },
    );
  }
  if (draftIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Cannot batch more than ${MAX_BATCH_SIZE} drafts at once` },
      { status: 400 },
    );
  }
  if (!draftIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json(
      { error: 'draftIds must be an array of non-empty strings' },
      { status: 400 },
    );
  }
  // De-dupe to avoid double-sending if the client passes the same id twice.
  const uniqueIds = Array.from(new Set(draftIds as string[]));

  // Optional per-draft edited content. Validate the map shape up-front so a
  // malformed `edits` fails the whole request (cheap, before any send) rather
  // than per-item. Values must be non-empty strings; anything else is rejected.
  const editsRaw = (body as { edits?: unknown })?.edits;
  const edits = new Map<string, string>();
  if (editsRaw !== undefined && editsRaw !== null) {
    if (typeof editsRaw !== 'object' || Array.isArray(editsRaw)) {
      return NextResponse.json(
        { error: 'edits must be an object mapping draftId to content' },
        { status: 400 },
      );
    }
    for (const [key, value] of Object.entries(editsRaw as Record<string, unknown>)) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return NextResponse.json(
          { error: `edits["${key}"] must be a non-empty string` },
          { status: 400 },
        );
      }
      edits.set(key, value.trim());
    }
  }

  const results: BatchResult[] = [];

  for (const draftId of uniqueIds) {
    try {
      // Verify the draft belongs to this space AND is still pending. The
      // single-draft PATCH route does exactly this check; we repeat it
      // per-item so a stale draftId in the batch fails alone, not the batch.
      const { data: existing, error: fetchError } = await tenantTable(supabase, 'AgentDraft', { spaceId: space.id })
        .select('id, status, contactId, channel, subject, content')
        .eq('id', draftId)
        .maybeSingle();

      if (fetchError || !existing) {
        results.push({ draftId, ok: false, error: 'not_found' });
        continue;
      }

      if (existing.status !== 'pending') {
        results.push({ draftId, ok: false, error: `already_${existing.status}` });
        continue;
      }

      // Fetch contact info needed for delivery (email / phone). Same shape
      // as the single PATCH route — fall back to a neutral name when the
      // draft isn't linked to a contact (e.g. an internal note).
      let contact = { name: 'Contact', email: null as string | null, phone: null as string | null };
      if (existing.contactId) {
        const { data: contactRow } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
          .select('name, email, phone')
          .eq('id', existing.contactId)
          .maybeSingle();
        if (contactRow) contact = contactRow;
      }

      // Use the realtor's edited text when supplied, falling back to the
      // stored draft. The edit was validated (non-empty string) up-front.
      const finalContent: string = edits.get(draftId) ?? existing.content;

      // Server-side edit labelling — same whitespace-normalized comparison the
      // single PATCH route uses. A no-op edit (whitespace only) is NOT recorded
      // as 'edited_and_approved'.
      const serverEditDistance = normalizedLevenshtein(existing.content, finalContent);
      const contentChanged = serverEditDistance > 0;

      const claimPatch: Record<string, unknown> = {
        status: 'approved',
        feedback_action: contentChanged ? 'edited_and_approved' : 'approved',
        edit_distance: contentChanged ? serverEditDistance : 0,
      };
      if (contentChanged) claimPatch.content = finalContent;

      const claimed = await claimPendingAgentDraft(space.id, draftId, claimPatch);
      if (!claimed) {
        results.push({ draftId, ok: false, error: 'already_claimed' });
        continue;
      }

      const deliveryResult: DeliveryResult = await sendDraft(
        { channel: existing.channel, subject: existing.subject, content: finalContent },
        contact,
        space.name,
        { spaceId: space.id, userId },
      );

      // sent=true → flip claimed 'approved' to 'sent'. sent=false keeps
      // 'approved' (human reviewed, delivery unconfigured/failed).
      const finalStatus: 'sent' | 'approved' = deliveryResult.sent ? 'sent' : 'approved';
      if (deliveryResult.sent) {
        await markClaimedDraftSent(space.id, draftId);
      }

      void audit({
        actorClerkId: userId,
        action: 'UPDATE',
        resource: 'AgentDraft',
        resourceId: draftId,
        spaceId: space.id,
        metadata: {
          newStatus: finalStatus,
          contactId: existing.contactId,
          channel: existing.channel,
          contentEdited: contentChanged,
          deliverySent: deliveryResult.sent,
          deliveryError: deliveryResult.error,
          batch: true,
        },
      });

      results.push({
        draftId,
        ok: true,
        status: finalStatus,
        deliveryResult,
      });
    } catch (err) {
      logger.warn('[batch-approve] per-draft error', { draftId, spaceId: space.id }, err as Error);
      results.push({ draftId, ok: false, error: (err as Error).message ?? 'unknown_error' });
    }
  }

  return NextResponse.json({ results });
}
