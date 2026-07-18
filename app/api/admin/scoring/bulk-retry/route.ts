import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import { getFormConfigs } from '@/lib/form-builder';
import { formConfigSchema, type IntakeFormConfig } from '@/lib/form-config-schema';

// How many contacts to rescore per call (hard cap prevents timeout on Vercel).
const BATCH_LIMIT = 50;

// Every Contact read/write below is gated by requireAdmin() above. The
// candidate query is an intentional platform-wide sweep whenever the caller
// doesn't narrow it to one spaceId; the per-row updates write back to a
// Contact this handler already resolved via that same candidate query
// (post-fetch identification, not a fresh unscoped lookup).
const CROSS_TENANT_REASON =
  'admin cross-tenant: platform-wide bulk rescoring sweep (spaceId param optional)';
const POST_FETCH_WRITE_REASON =
  'admin cross-tenant: writing scoring result back to a Contact already resolved by the candidate query above';

/**
 * POST /api/admin/scoring/bulk-retry
 *
 * Rescores contacts that were scored under the broken deterministic blend
 * (typically leadScore <= 30 and scoreLabel 'cold' despite good answers).
 *
 * Body params (all optional):
 *   dryRun       boolean  — list matches without rescoring (default false)
 *   limit        number   — max contacts to rescore (default 50, max 50)
 *   maxScore     number   — only rescore contacts with leadScore <= this (default 30)
 *   leadType     string   — 'rental' | 'buyer' | omit for both
 *   spaceId      string   — restrict to one space
 *
 * Response:
 *   { total, rescored, failed, skipped, results: [...] }
 */
export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine — use all defaults
  }

  const dryRun = body.dryRun === true;
  const limit = Math.min(typeof body.limit === 'number' ? body.limit : BATCH_LIMIT, BATCH_LIMIT);
  const maxScore = typeof body.maxScore === 'number' ? body.maxScore : 30;
  const leadType =
    body.leadType === 'rental' || body.leadType === 'buyer' ? body.leadType : undefined;
  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : undefined;

  // Fetch candidates: scored contacts below the threshold.
  let query = supabase
    .from('Contact')
    .select(
      'id, spaceId, name, email, leadType, formLeadType, applicationData, formConfigSnapshot, scoringStatus, leadScore, scoreLabel, Space(id, brokerageId)',
    )
    .eq('scoringStatus', 'scored')
    .lte('leadScore', maxScore)
    .order('updatedAt', { ascending: false })
    .limit(limit);

  if (leadType) query = query.eq('formLeadType', leadType);
  if (spaceId) {
    query = query.eq('spaceId', spaceId);
  } else {
    query = unscoped(query, CROSS_TENANT_REASON);
  }

  const { data: candidates, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: 'Failed to fetch candidates', detail: fetchErr.message }, { status: 500 });
  }

  const contacts = (candidates ?? []) as unknown as Array<{
    id: string;
    spaceId: string;
    name: string;
    email: string | null;
    leadType: 'rental' | 'buyer';
    formLeadType: 'rental' | 'buyer' | null;
    applicationData: Record<string, unknown> | null;
    formConfigSnapshot: IntakeFormConfig | null;
    scoringStatus: string;
    leadScore: number | null;
    scoreLabel: string | null;
    Space: { id: string; brokerageId: string | null } | null;
  }>;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      total: contacts.length,
      candidates: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        leadScore: c.leadScore,
        scoreLabel: c.scoreLabel,
        leadType: c.formLeadType ?? c.leadType,
      })),
    });
  }

  // Rescore each contact sequentially to respect LLM rate limits.
  const results: Array<{ id: string; name: string; before: number | null; after: number | null; label: string | null; status: string }> = [];
  let rescored = 0;
  let failed = 0;

  // Cache form configs by spaceId+leadType to avoid redundant fetches.
  const configCache = new Map<string, IntakeFormConfig | null>();

  for (const contact of contacts) {
    const resolvedLeadType: 'rental' | 'buyer' = contact.formLeadType ?? contact.leadType ?? 'rental';

    // Mark pending
    await unscoped(supabase.from('Contact'), POST_FETCH_WRITE_REASON)
      .update({ scoringStatus: 'pending', updatedAt: new Date().toISOString() })
      .eq('id', contact.id);

    // Resolve form config
    let formConfig: IntakeFormConfig | null = null;
    if (contact.formConfigSnapshot) {
      const parsed = formConfigSchema.safeParse(contact.formConfigSnapshot);
      if (parsed.success) formConfig = parsed.data;
    }
    if (!formConfig && contact.Space) {
      const cacheKey = `${contact.spaceId}:${resolvedLeadType}`;
      if (configCache.has(cacheKey)) {
        formConfig = configCache.get(cacheKey) ?? null;
      } else {
        try {
          const dual = await getFormConfigs(contact.spaceId, contact.Space.brokerageId);
          formConfig = resolvedLeadType === 'buyer' ? dual.buyer : dual.rental;
          configCache.set(cacheKey, formConfig);
        } catch {
          configCache.set(cacheKey, null);
        }
      }
    }

    const applicationData = (contact.applicationData ?? {}) as Record<string, string | string[] | number | boolean>;

    try {
      const scoring = await scoreLeadApplicationDynamic({
        contactId: contact.id,
        formConfig,
        answers: applicationData,
        leadType: resolvedLeadType,
      });

      await unscoped(supabase.from('Contact'), POST_FETCH_WRITE_REASON)
        .update({
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          scoreDetails: scoring.scoreDetails,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contact.id);

      results.push({
        id: contact.id,
        name: contact.name,
        before: contact.leadScore,
        after: scoring.leadScore,
        label: scoring.scoreLabel,
        status: 'rescored',
      });
      rescored++;
    } catch (err) {
      await unscoped(supabase.from('Contact'), POST_FETCH_WRITE_REASON)
        .update({ scoringStatus: 'failed', updatedAt: new Date().toISOString() })
        .eq('id', contact.id);

      results.push({
        id: contact.id,
        name: contact.name,
        before: contact.leadScore,
        after: null,
        label: null,
        status: `failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      failed++;
    }
  }

  await logAdminAction({
    actor: admin.userId,
    action: 'bulk_rescore',
    details: { total: contacts.length, rescored, failed, maxScore, leadType, spaceId },
  });

  return NextResponse.json({
    total: contacts.length,
    rescored,
    failed,
    skipped: 0,
    results,
  });
}
