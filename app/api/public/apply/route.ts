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
import { sendNewLeadNotification } from '@/lib/email';

export async function POST(req: NextRequest) {
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

    const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existingRecentLeads, error: dupError } = await supabase
      .from('Contact')
      .select('*')
      .eq('spaceId', space.id)
      .eq('name', payload.legalName)
      .contains('tags', ['application-link'])
      .gte('createdAt', duplicateCutoff)
      .order('createdAt', { ascending: false })
      .limit(1);
    if (dupError) throw dupError;

    if (existingRecentLeads?.length) {
      const existingRecentLead = existingRecentLeads[0] as Contact;
      const existingNormalizedPhone = normalizePhone(existingRecentLead.phone ?? '');
      const normalizedPhone = normalizePhone(payload.phone);
      if (existingNormalizedPhone && existingNormalizedPhone === normalizedPhone) {
        return NextResponse.json(
          {
            success: true,
            id: existingRecentLead.id,
            scoringStatus: existingRecentLead.scoringStatus,
            leadScore: existingRecentLead.leadScore,
            scoreLabel: existingRecentLead.scoreLabel,
            scoreSummary: existingRecentLead.scoreSummary,
            scoreDetails: existingRecentLead.scoreDetails,
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
        applicationData,
      })
      .select();
    if (insertError) throw insertError;
    const contact = contacts![0] as Contact;

    console.info('[apply] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      slug: payload.slug,
    });

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
      if (scoreUpdateError) throw scoreUpdateError;

      console.info('[apply] scoring persisted', {
        contactId: contact.id,
        scoringStatus: scoring.scoringStatus,
        scoreLabel: scoring.scoreLabel,
      });
    } catch (error) {
      console.error('[apply] scoring persistence failed', {
        contactId: contact.id,
        error,
      });
      try {
        const { error: fallbackUpdateError } = await supabase
          .from('Contact')
          .update({
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', contact.id);
        if (fallbackUpdateError) throw fallbackUpdateError;
      } catch (fallbackErr: unknown) {
        console.error('[apply] failed to persist fallback scoring state', {
          contactId: contact.id,
          fallbackErr,
        });
      }
    }

    // ── Non-blocking email notification ──────────────────────────────────────
    void (async () => {
      try {
        const [{ data: settingsRow }, { data: ownerRow }] = await Promise.all([
          supabase.from('SpaceSetting').select('notifications').eq('spaceId', space.id).maybeSingle(),
          supabase.from('User').select('email').eq('id', space.ownerId).maybeSingle(),
        ]);
        if (settingsRow?.notifications && ownerRow?.email) {
          await sendNewLeadNotification({
            toEmail: ownerRow.email,
            spaceName: space.name,
            spaceSlug: space.slug,
            contactId: contact.id,
            name: payload.legalName,
            phone: payload.phone,
            email: payload.email,
            leadScore: scoring.leadScore,
            scoreLabel: scoring.scoreLabel,
            scoreSummary: scoring.scoreSummary,
            applicationData,
          });
        }
      } catch (err) {
        console.error('[apply] email notification failed', { contactId: contact.id, err });
      }
    })();

    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        scoringStatus: scoring.scoringStatus,
        leadScore: scoring.leadScore,
        scoreLabel: scoring.scoreLabel,
        scoreSummary: scoring.scoreSummary,
        scoreDetails: scoring.scoreDetails,
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
