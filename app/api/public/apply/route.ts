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
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const { allowed } = await checkRateLimit(`apply:rl:${ip}`, 10, 3600);
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
  const fingerprint = applicationFingerprintKey(payload);
  const idempotencyKey = `apply:idempotency:${fingerprint}`;

  try {
    const space = await getSpaceFromSlug(payload.slug);
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
            scoringStatus: duplicate.scoringStatus,
            leadScore: duplicate.leadScore,
            scoreLabel: duplicate.scoreLabel,
            scoreSummary: duplicate.scoreSummary,
            scoreDetails: duplicate.scoreDetails,
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
        budget: payload.monthlyRent ?? payload.monthlyGrossIncome ?? null,
        preferences: payload.propertyAddress ?? null,
        address: payload.currentAddress ?? null,
        notes: noteParts.length > 0 ? noteParts.join('\n') : null,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['application-link', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
        sourceLabel: 'intake-form',
        applicationData,
        applicationRef,
        applicationStatus: 'received',
      })
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;

    console.info('[apply] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      slug: payload.slug,
    });

    // ── Defer AI scoring + email notification to after response ─────────────
    // This avoids the 5-15s AI scoring latency blocking the user's submission.
    void (async () => {
      let scoring: LeadScoringResult = {
        scoringStatus: 'failed',
        leadScore: null,
        scoreLabel: 'unscored',
        scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
        scoreDetails: null,
      };

      try {
        scoring = await scoreLeadApplication({
          contactId: contact.id,
          name: payload.legalName,
          email: payload.email ?? null,
          phone: payload.phone,
          budget: payload.monthlyRent ?? null,
          applicationData,
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

      // Email + SMS notification via unified dispatcher
      // (handles channel toggles, per-event toggles, owner lookup)
      try {
        await notifyNewLead({
          spaceId: space.id,
          contactId: contact.id,
          name: payload.legalName,
          phone: payload.phone,
          email: payload.email,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
          applicationData,
        });
      } catch (err) {
        console.error('[apply] notification failed', { contactId: contact.id, err });
      }
    })();

    // Return immediately — scoring happens in the background
    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        applicationRef,
        scoringStatus: 'pending',
        leadScore: null,
        scoreLabel: 'unscored',
        scoreSummary: null,
        scoreDetails: null,
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
