import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getSpaceFromSlug } from '@/lib/space';
import { scoreLeadApplication } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';
import {
  applicationFingerprintKey,
  normalizePhone,
  publicApplicationSchema,
} from '@/lib/public-application';

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
    // If Redis is unavailable we continue and rely on DB duplicate check below.
    let idempotencyLockAcquired = false;
    try {
      const lockResult = await redis.set(idempotencyKey, '1', { nx: true, ex: 120 });
      idempotencyLockAcquired = lockResult === 'OK';
    } catch (error) {
      console.warn('[apply] idempotency lock unavailable; using DB fallback', { error, spaceId: space.id });
    }

    const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const existingRecentLead = await db.contact.findFirst({
      where: {
        spaceId: space.id,
        name: payload.name,
        tags: { has: 'application-link' },
        createdAt: { gte: duplicateCutoff }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingRecentLead) {
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

    const contact = await db.contact.create({
      data: {
        spaceId: space.id,
        name: payload.name,
        email: payload.email ?? null,
        phone: payload.phone,
        budget: payload.budget ?? null,
        preferences: payload.preferredAreas ?? null,
        notes: payload.notes || payload.timeline ? `Timeline: ${payload.timeline ?? 'N/A'}\n${payload.notes ?? ''}`.trim() : null,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['application-link', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
      },
    });

    console.info('[apply] submission persisted', {
      contactId: contact.id,
      spaceId: space.id,
      slug: payload.slug,
    });

    let scoring: LeadScoringResult = {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
    };

    try {
      scoring = await scoreLeadApplication({
        contactId: contact.id,
        name: payload.name,
        email: payload.email ?? null,
        phone: payload.phone,
        budget: payload.budget ?? null,
        timeline: payload.timeline ?? null,
        preferredAreas: payload.preferredAreas ?? null,
        notes: payload.notes ?? null,
      });

      await db.contact.update({
        where: { id: contact.id },
        data: {
          scoringStatus: scoring.scoringStatus,
          leadScore: scoring.leadScore,
          scoreLabel: scoring.scoreLabel,
          scoreSummary: scoring.scoreSummary,
        },
      });

      console.info('[apply] scoring state persisted', {
        contactId: contact.id,
        scoringStatus: scoring.scoringStatus,
        scoreLabel: scoring.scoreLabel,
      });
    } catch (error) {
      console.error('[apply] scoring persistence failed', {
        contactId: contact.id,
        error,
      });
      await db.contact
        .update({
          where: { id: contact.id },
          data: {
            scoringStatus: 'failed',
            leadScore: null,
            scoreLabel: 'unscored',
            scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
          }
        })
        .catch((fallbackErr: unknown) =>
          console.error('[apply] failed to persist fallback scoring state', {
            contactId: contact.id,
            fallbackErr
          })
        );
    }

    return NextResponse.json(
      {
        success: true,
        id: contact.id,
        scoringStatus: scoring.scoringStatus,
        leadScore: scoring.leadScore,
        scoreLabel: scoring.scoreLabel,
        scoreSummary: scoring.scoreSummary,
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
