import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceFromSlug } from '@/lib/space';
import { scoreLeadApplication } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import type { Contact } from '@/lib/types';
import {
  applicationFingerprintKey,
  buildApplicationData,
  normalizePhone,
  publicApplicationSchema,
} from '@/lib/public-application';
import { notifyNewLead } from '@/lib/notify';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  console.log('[APPLY-DEBUG] 1. Route handler entered');
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const { allowed } = await checkRateLimit(`apply:rl:${ip}`, 10, 3600);
  console.log('[APPLY-DEBUG] 2. Rate limit passed');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch (error) {
    console.warn('[apply] invalid JSON body', { error });
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = publicApplicationSchema.safeParse(requestBody);
  if (!parsed.success) {
    console.warn('[apply] validation failed', {
      issues: parsed.error.issues,
    });
    return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
  }

  const payload = parsed.data;
  console.log('[APPLY-DEBUG] 3. Body parsed, slug:', payload.slug);
  const fingerprint = applicationFingerprintKey(payload);
  const idempotencyKey = `apply:idempotency:${fingerprint}`;

  try {
    const space = await getSpaceFromSlug(payload.slug);
    console.log('[APPLY-DEBUG] 4. Space found:', space?.id);
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    // First line of defense against duplicate creates from retries/double-click.
    let idempotencyLockAcquired = false;
    try {
      const lockResult = await redis.set(idempotencyKey, '1', { nx: true, ex: 120 });
      idempotencyLockAcquired = lockResult === 'OK';
    } catch (error) {
      console.warn('[apply] idempotency lock unavailable; using DB fallback', { error, spaceId: space.id });
    }

    // Expanded window: 5 minutes (was 2 minutes)
    const duplicateCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingRecentLeads, error: dupError } = await supabase
      .from('Contact')
      .select('id, phone, email, scoringStatus, leadScore, scoreLabel, scoreSummary, scoreDetails')
      .eq('spaceId', space.id)
      .eq('name', payload.legalName)
      .contains('tags', ['application-link'])
      .gte('createdAt', duplicateCutoff)
      .order('createdAt', { ascending: false })
      .limit(5);
    if (dupError) throw dupError;

    if (existingRecentLeads?.length) {
      const normalizedPhone = normalizePhone(payload.phone);
      const normalizedEmail = (payload.email ?? '').trim().toLowerCase();

      const duplicate = (existingRecentLeads as Contact[]).find((lead) => {
        const phoneMatch =
          normalizePhone(lead.phone ?? '') !== '' &&
          normalizePhone(lead.phone ?? '') === normalizedPhone;
        const emailMatch =
          normalizedEmail !== '' &&
          (lead.email ?? '').trim().toLowerCase() === normalizedEmail;
        return phoneMatch || emailMatch;
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: true,
            id: duplicate.id,
            applicationRef,
          },
          { status: 200 }
        );
      }
    }

    if (!idempotencyLockAcquired) {
      console.info('[apply] proceeding without distributed lock', {
        spaceId: space.id,
        slug: payload.slug,
        fingerprint,
      });
    }

    // Fetch privacy policy URL from space settings for consent snapshot
    let spacePrivacyPolicyUrl: string | null = null;
    try {
      const { data: spaceSetting } = await supabase
        .from('SpaceSetting')
        .select('privacyPolicyUrl')
        .eq('spaceId', space.id)
        .maybeSingle();
      spacePrivacyPolicyUrl = spaceSetting?.privacyPolicyUrl ?? null;
    } catch (err) {
      console.warn('[apply] failed to fetch space privacy policy URL', { spaceId: space.id, err });
    }

    // Build structured application data
    const applicationData = buildApplicationData(payload);

    // Build notes for backwards compat with existing lead cards
    const noteParts: string[] = [];
    if (payload.targetMoveInDate) noteParts.push(`Timeline: ${payload.targetMoveInDate}`);
    if (payload.propertyAddress) noteParts.push(`Property: ${payload.propertyAddress}`);
    if (payload.employmentStatus) noteParts.push(`Employment: ${payload.employmentStatus}`);
    if (payload.monthlyGrossIncome != null) noteParts.push(`Income: $${payload.monthlyGrossIncome}/mo`);
    if (payload.additionalNotes) noteParts.push(payload.additionalNotes);

    // Generate a unique application reference for the status page
    const applicationRef = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    const { data: contacts, error: insertError } = await supabase
      .from('Contact')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        name: payload.legalName,
        email: payload.email ?? null,
        phone: payload.phone,
        budget: payload.leadType === 'buyer'
          ? (payload.buyerBudget ?? payload.monthlyGrossIncome ?? null)
          : (payload.monthlyRent ?? payload.monthlyGrossIncome ?? null),
        preferences: payload.propertyAddress ?? null,
        address: payload.currentAddress ?? null,
        notes: noteParts.length > 0 ? noteParts.join('\n') : null,
        type: 'QUALIFICATION',
        properties: [],
        leadType: payload.leadType ?? 'rental',
        tags: ['application-link', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
        sourceLabel: 'intake-form',
        applicationData,
        applicationRef,
        applicationStatus: 'received',
        consentGiven: payload.privacyConsent === true ? true : payload.privacyConsent === false ? false : null,
        consentTimestamp: payload.privacyConsent === true ? new Date().toISOString() : null,
        consentIp: payload.privacyConsent === true ? ip : null,
        consentPrivacyPolicyUrl: payload.privacyConsent === true ? spacePrivacyPolicyUrl : null,
      })
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;
    console.log('[APPLY-DEBUG] 5. Contact created:', contact?.id);

    console.info('[apply] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      slug: payload.slug,
    });

    // ── AI scoring + notification (both awaited before response) ───────────
    // On Vercel serverless the function is killed after the response is sent,
    // so all important work must complete before we return.
    let scoring: LeadScoringResult = {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
      scoreDetails: null,
    };

    console.log('[APPLY-DEBUG] 6. Starting scoring');
    try {
      scoring = await scoreLeadApplication({
        contactId: contact.id,
        name: payload.legalName,
        email: payload.email ?? null,
        phone: payload.phone,
        budget: (payload.leadType === 'buyer')
          ? (payload.buyerBudget ?? null)
          : (payload.monthlyRent ?? null),
        applicationData,
        leadType: payload.leadType ?? 'rental',
      });

      const { error: scoreUpdateError } = await supabase
        .from('Contact')
        .update({
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          scoreDetails: scoring.scoreDetails,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', contact.id);
      if (scoreUpdateError) {
        console.error('[apply] scoring update failed', { contactId: contact.id, scoreUpdateError });
      } else {
        console.info('[apply] scoring persisted', {
          contactId: contact.id,
          scoringStatus: scoring.scoringStatus,
          scoreLabel: scoring.scoreLabel,
        });
      }
    } catch (error) {
      console.error('[apply] scoring failed', { contactId: contact.id, error });
      try {
        await supabase
          .from('Contact')
          .update({
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id);
      } catch (fallbackErr) {
        console.error('[apply] fallback scoring state failed', { contactId: contact.id, fallbackErr });
      }
    }

    console.log('[APPLY-DEBUG] 7. Scoring complete:', scoring?.scoringStatus);

    // Send notification with scoring results included
    try {
      console.log('[apply] Sending notification for contact:', contact.id, 'spaceId:', space.id);
      console.log('[APPLY-DEBUG] 8. About to call notifyNewLead');
      await notifyNewLead({
        spaceId: space.id,
        contactId: contact.id,
        name: payload.legalName,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        leadScore: scoring.leadScore,
        scoreLabel: scoring.scoreLabel,
        scoreSummary: scoring.scoreSummary,
        applicationData,
      });
      console.log('[APPLY-DEBUG] 9. notifyNewLead returned');
      console.log('[apply] Notification dispatched');
    } catch (notifyErr) {
      console.error('[apply] Notification failed:', notifyErr);
    }

    console.log('[APPLY-DEBUG] 10. Returning response');
    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        applicationRef,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[apply] unhandled submission failure', {
      slug: parsed.data.slug,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
