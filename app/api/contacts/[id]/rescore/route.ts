import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { scoreLeadApplicationDynamic } from '@/lib/lead-scoring';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertCanSpend, chargeWorkflow, CreditsExhaustedError, SubscriptionDelinquentError } from '@/lib/billing/meter';
import type { Contact, IntakeFormConfig } from '@/lib/types';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Rate limit: max 10 rescore requests per user per hour
  const { allowed } = await checkRateLimit(`rescore:${userId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many rescore requests. Try again in a bit.' }, { status: 429 });
  }

  const { id } = await params;

  // Get space first, then query contact scoped to that space to prevent
  // cross-tenant information disclosure.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Credit gate (no-op unless CREDITS_ENFORCED). Refuse up front when the
  // account can't afford a lead score; charged on success below.
  try {
    await assertCanSpend(space.id, 'lead_score');
  } catch (err) {
    if (err instanceof SubscriptionDelinquentError) {
      return NextResponse.json(
        { error: 'Your subscription is inactive. Update your payment method or resubscribe.' },
        { status: 402 },
      );
    }
    if (err instanceof CreditsExhaustedError) {
      return NextResponse.json(
        { error: 'Out of credits. Buy a top-up or upgrade your plan.' },
        { status: 402 },
      );
    }
    throw err;
  }

  const { data: rows, error: fetchError } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .select('*')
    .eq('id', id);
  if (fetchError) {
    console.error('[rescore] Fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
  const contactRows = (rows ?? []) as Contact[];
  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];

  // Mark as pending while scoring
  await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .update({ scoringStatus: 'pending' })
    .eq('id', id);

  // Score against the form-config snapshot stored on the contact at submission.
  const formConfig: IntakeFormConfig | null =
    (contact as Record<string, unknown>).formConfigSnapshot as IntakeFormConfig | null ?? null;

  const resolvedLeadType = contact.leadType || (contact as any).formLeadType || 'rental';

  const applicationData = contact.applicationData as Record<string, unknown> | null;

  let result;
  try {
    result = await scoreLeadApplicationDynamic({
      contactId: id,
      formConfig,
      answers: applicationData
        ? (applicationData as Record<string, string | string[] | number | boolean>)
        : undefined,
      leadType: resolvedLeadType as 'rental' | 'buyer',
    });
  } catch (scoringErr) {
    // Reset status to 'failed' so the contact is not stuck in 'pending'
    await tenantTable(supabase, 'Contact', { spaceId: space.id })
      .update({ scoringStatus: 'failed', updatedAt: new Date().toISOString() })
      .eq('id', id);
    console.error('[rescore] Scoring failed:', scoringErr);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }

  const { error: updateError } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .update({
      scoringStatus: result.scoringStatus,
      leadScore: result.leadScore,
      scoreLabel: result.scoreLabel,
      scoreSummary: result.scoreSummary,
      scoreDetails: result.scoreDetails,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[rescore] Update error:', updateError);
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  await chargeWorkflow(space.id, 'lead_score', { userId });
  return NextResponse.json(result);
}
