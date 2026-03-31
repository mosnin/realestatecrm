import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceByOwnerId } from '@/lib/space';
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
import { z } from 'zod';

/**
 * Brokerage-specific intake schema.
 * Same as the regular application schema but uses `brokerageId` instead of `slug`.
 */
const brokerageApplicationSchema = publicApplicationSchema
  .omit({ slug: true })
  .extend({
    brokerageId: z.string().uuid('Invalid brokerage ID'),
  });

export async function POST(req: NextRequest) {
  // ── IP-based rate limiting (10 submissions / IP / hour) ──────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const { allowed } = await checkRateLimit(`apply-brokerage:rl:${ip}`, 10, 3600);
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
    console.warn('[apply/brokerage] invalid JSON body', { error });
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = brokerageApplicationSchema.safeParse(requestBody);
  if (!parsed.success) {
    console.warn('[apply/brokerage] validation failed', {
      issues: parsed.error.issues,
    });
    return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
  }

  const payload = parsed.data;

  // Build a fingerprint key using brokerageId instead of slug
  const fingerprint = applicationFingerprintKey({
    ...payload,
    slug: `brokerage:${payload.brokerageId}`,
  });
  const idempotencyKey = `apply-brokerage:idempotency:${fingerprint}`;

  try {
    // ── Look up the Brokerage ──────────────────────────────────────────────
    const { data: brokerage, error: brokerageError } = await supabase
      .from('Brokerage')
      .select('id, name, ownerId, status')
      .eq('id', payload.brokerageId)
      .maybeSingle();
    if (brokerageError) throw brokerageError;
    if (!brokerage) {
      return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });
    }
    if (brokerage.status !== 'active') {
      return NextResponse.json({ error: 'Brokerage is not accepting applications' }, { status: 403 });
    }

    // ── Find the broker owner's Space ──────────────────────────────────────
    // The brokerage.ownerId is the DB User.id of the broker_owner.
    const space = await getSpaceByOwnerId(brokerage.ownerId);
    if (!space) {
      console.error('[apply/brokerage] broker owner has no space', {
        brokerageId: brokerage.id,
        ownerId: brokerage.ownerId,
      });
      return NextResponse.json({ error: 'Brokerage configuration error' }, { status: 500 });
    }

    // ── Idempotency lock ───────────────────────────────────────────────────
    let idempotencyLockAcquired = false;
    try {
      const lockResult = await redis.set(idempotencyKey, '1', { nx: true, ex: 120 });
      idempotencyLockAcquired = lockResult === 'OK';
    } catch (error) {
      console.warn('[apply/brokerage] idempotency lock unavailable; using DB fallback', {
        error,
        spaceId: space.id,
      });
    }

    // ── Duplicate detection (5-minute window) ──────────────────────────────
    const duplicateCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingRecentLeads, error: dupError } = await supabase
      .from('Contact')
      .select('id, phone, email, scoringStatus, leadScore, scoreLabel, scoreSummary, scoreDetails')
      .eq('spaceId', space.id)
      .eq('name', payload.legalName)
      .contains('tags', ['brokerage-lead'])
      .gte('createdAt', duplicateCutoff)
      .order('createdAt', { ascending: false })
      .limit(5);
    if (dupError) throw dupError;

    if (existingRecentLeads?.length) {
      const normalizedPhone = normalizePhone(payload.phone ?? '');
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
          { status: 200 },
        );
      }
    }

    if (!idempotencyLockAcquired) {
      console.info('[apply/brokerage] proceeding without distributed lock', {
        spaceId: space.id,
        brokerageId: payload.brokerageId,
        fingerprint,
      });
    }

    // ── Build application data ─────────────────────────────────────────────
    const applicationData = buildApplicationData({
      ...payload,
      slug: `brokerage:${payload.brokerageId}`,
    });

    const noteParts: string[] = [];
    if (payload.targetMoveInDate) noteParts.push(`Timeline: ${payload.targetMoveInDate}`);
    if (payload.propertyAddress) noteParts.push(`Property: ${payload.propertyAddress}`);
    if (payload.employmentStatus) noteParts.push(`Employment: ${payload.employmentStatus}`);
    if (payload.monthlyGrossIncome != null) noteParts.push(`Income: $${payload.monthlyGrossIncome}/mo`);
    if (payload.additionalNotes) noteParts.push(payload.additionalNotes);

    const applicationRef = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    // ── Create Contact in the broker's space ───────────────────────────────
    const { data: contacts, error: insertError } = await supabase
      .from('Contact')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        name: payload.legalName,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        budget: payload.monthlyRent ?? payload.monthlyGrossIncome ?? null,
        preferences: payload.propertyAddress ?? null,
        address: payload.currentAddress ?? null,
        notes: noteParts.length > 0 ? noteParts.join('\n') : null,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['brokerage-lead', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
        sourceLabel: 'brokerage-intake',
        applicationData: {
          ...applicationData,
          brokerageId: brokerage.id,
          brokerageName: brokerage.name,
        },
        applicationRef,
        applicationStatus: 'received',
      })
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;

    console.info('[apply/brokerage] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      brokerageId: brokerage.id,
    });

    // ── Defer AI scoring + notification to after response ──────────────────
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
          phone: payload.phone ?? null,
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
          console.error('[apply/brokerage] scoring update failed', {
            contactId: contact.id,
            scoreUpdateError,
          });
        } else {
          console.info('[apply/brokerage] scoring persisted', {
            contactId: contact.id,
            scoringStatus: scoring.scoringStatus,
            scoreLabel: scoring.scoreLabel,
          });
        }
      } catch (error) {
        console.error('[apply/brokerage] scoring failed', { contactId: contact.id, error });
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
          console.error('[apply/brokerage] fallback scoring state failed', {
            contactId: contact.id,
            fallbackErr,
          });
        }
      }

      // Notify the broker owner
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
        console.error('[apply/brokerage] notification failed', { contactId: contact.id, err });
      }
    })();

    // Return immediately
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
      { status: 201 },
    );
  } catch (error) {
    console.error('[apply/brokerage] unhandled submission failure', {
      brokerageId: parsed.data.brokerageId,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
