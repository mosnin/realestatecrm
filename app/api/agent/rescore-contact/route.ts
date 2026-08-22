/**
 * POST /api/agent/rescore-contact
 *
 * Internal endpoint — called by the Modal agent to trigger a fresh AI
 * lead score for a contact. Secured with AGENT_INTERNAL_SECRET.
 *
 * Reuses the exact same scoring logic as the UI rescore button to ensure
 * consistency between human-triggered and agent-triggered rescores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import { assertCanSpend, chargeWorkflow, CreditsExhaustedError, SubscriptionDelinquentError } from '@/lib/billing/meter';
import type { Contact, IntakeFormConfig } from '@/lib/types';
import { tenantTable } from '@/lib/tenant-db';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

export async function POST(req: NextRequest) {
  // Fail loudly on missing secret — misconfiguration should be caught immediately
  if (!AGENT_INTERNAL_SECRET) {
    console.error('[agent/rescore-contact] AGENT_INTERNAL_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { contactId, spaceId } = body;

  if (!contactId || !spaceId) {
    return NextResponse.json({ error: 'contactId and spaceId required' }, { status: 400 });
  }

  const { data: rows, error: fetchError } = await tenantTable(supabase, 'Contact', { spaceId })
    .select('*')
    .eq('id', contactId);

  if (fetchError || !rows?.length) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const contact = (rows as Contact[])[0];

  // Skip contacts with no scoreable data
  if (!contact.applicationData && !contact.formConfigSnapshot) {
    return NextResponse.json({ skipped: true, reason: 'No application data to score' });
  }

  // Skip if already pending
  if (contact.scoringStatus === 'pending') {
    return NextResponse.json({ skipped: true, reason: 'Already scoring' });
  }

  // Meter the AI work — this autonomous path runs the SAME scoreLeadApplicationDynamic
  // as the metered UI rescore button, so it must charge the same 'lead_score' credit.
  // Without this the highest-volume scoring path (Chippi auto-rescores on triggers +
  // sweeps) ran completely free. No-op unless CREDITS_ENFORCED.
  try {
    await assertCanSpend(spaceId, 'lead_score');
  } catch (err) {
    if (err instanceof SubscriptionDelinquentError) {
      return NextResponse.json({ skipped: true, reason: 'Subscription inactive' }, { status: 402 });
    }
    if (err instanceof CreditsExhaustedError) {
      return NextResponse.json({ skipped: true, reason: 'Out of credits' }, { status: 402 });
    }
    throw err;
  }

  // Every write below is double-scoped by (id, spaceId). The SELECT above
  // already proved this contact lives in this spaceId, but a future code
  // path that drops the SELECT can't reach across tenants if the writes
  // themselves are also scoped. Treat the bearer secret as proving "this
  // caller is Modal" — never as proving "this payload's spaceId is what
  // Modal was originally authorized for."
  await tenantTable(supabase, 'Contact', { spaceId })
    .update({ scoringStatus: 'pending' })
    .eq('id', contactId);

  const formConfig = (contact as Record<string, unknown>).formConfigSnapshot as IntakeFormConfig | null ?? null;
  const resolvedLeadType = contact.leadType || (contact as Record<string, unknown>).formLeadType as string || 'rental';

  const applicationData = contact.applicationData as Record<string, unknown> | null;

  try {
    const result = await scoreLeadApplicationDynamic({
      contactId,
      formConfig,
      answers: applicationData
        ? (applicationData as Record<string, string | string[] | number | boolean>)
        : undefined,
      leadType: resolvedLeadType as 'rental' | 'buyer',
    });

    await tenantTable(supabase, 'Contact', { spaceId })
      .update({
        scoringStatus: result.scoringStatus,
        leadScore: result.leadScore,
        scoreLabel: result.scoreLabel,
        scoreSummary: result.scoreSummary,
        scoreDetails: result.scoreDetails,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', contactId);

    // Charge only after a successful score (best-effort; never blocks the result).
    await chargeWorkflow(spaceId, 'lead_score');

    return NextResponse.json({ success: true, score: result.leadScore, label: result.scoreLabel });
  } catch {
    await tenantTable(supabase, 'Contact', { spaceId })
      .update({ scoringStatus: 'failed', updatedAt: new Date().toISOString() })
      .eq('id', contactId);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
