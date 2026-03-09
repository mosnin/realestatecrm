import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { scoreLeadApplication } from '@/lib/lead-scoring';
import type { LeadScoringResult } from '@/lib/lead-scoring';

function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subdomain,
      name,
      email,
      phone,
      budget,
      timeline,
      preferredAreas,
      notes,
    } = body ?? {};

    if (!subdomain || !name || !phone) {
      return NextResponse.json(
        { error: 'subdomain, name, and phone are required' },
        { status: 400 }
      );
    }

    const space = await getSpaceFromSubdomain(String(subdomain));
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    const safeName = String(name).trim();
    const safePhone = String(phone).trim();
    const normalizedPhone = normalizePhone(safePhone);

    // Prevent accidental duplicate submissions from rapid double-submit.
    // If we see the same name+phone for the same workspace within 2 minutes,
    // treat it as the same lead and return success without creating another row.
    const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const existingRecentLead = await db.contact.findFirst({
      where: {
        spaceId: space.id,
        name: safeName,
        tags: { has: 'application-link' },
        createdAt: { gte: duplicateCutoff }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingRecentLead) {
      const existingNormalizedPhone = normalizePhone(existingRecentLead.phone ?? '');
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

    const contact = await db.contact.create({
      data: {
        spaceId: space.id,
        name: safeName,
        email: email ? String(email) : null,
        phone: safePhone,
        budget: budget != null && budget !== '' ? Number.parseFloat(String(budget)) : null,
        preferences: preferredAreas ? String(preferredAreas) : null,
        notes: notes || timeline ? `Timeline: ${timeline ?? 'N/A'}\n${notes ?? ''}`.trim() : null,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['application-link', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
      },
    });

    console.info('[apply] submission persisted', { contactId: contact.id, spaceId: space.id });

    let scoring: LeadScoringResult = {
      scoringStatus: 'failed',
      leadScore: null,
      scoreLabel: 'unscored',
      scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
    };

    try {
      scoring = await scoreLeadApplication({
        contactId: contact.id,
        name: safeName,
        email: email ? String(email) : null,
        phone: safePhone,
        budget: budget != null && budget !== '' ? Number.parseFloat(String(budget)) : null,
        timeline: timeline ? String(timeline) : null,
        preferredAreas: preferredAreas ? String(preferredAreas) : null,
        notes: notes ? String(notes) : null,
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
      console.error('[apply] scoring persistence failed', { contactId: contact.id, error });
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
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
