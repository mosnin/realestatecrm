/**
 * POST /api/public/home-value/[slug] — the public "What's my home worth?"
 * seller lead-magnet endpoint.
 *
 * A homeowner on a realtor's public page (/p/[slug]/home-value) submits their
 * address + contact info. We:
 *   1. Resolve the ONE space from the slug (public, no auth — same resolution
 *      as /p/[slug] and /api/public/apply). The slug is the ONLY tenant
 *      selector; a body-supplied spaceId is never trusted.
 *   2. Rate-limit strictly by IP+slug (public, unauthenticated surface).
 *   3. Validate the address + lead fields.
 *   4. Run the REAL CMA engine (lib/cma buildCma → RentCast-backed) for an
 *      honest value range. No data → honest "couldn't estimate" response with
 *      NO fabricated number (product non-negotiable #5).
 *   5. Capture the homeowner as a SELLER Contact scoped to THIS space's
 *      spaceId, then fire the existing Instant First Touch best-effort — the
 *      same lead-capture contract as /api/public/apply.
 *
 * Tenant scoping (product non-negotiable #3): the Contact insert carries
 * `spaceId: space.id` derived solely from the resolved slug. buildCma is
 * likewise scoped by `spaceId`, so CRM comps never cross tenants.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { buildCma } from '@/lib/cma';
import { fireFirstTouch } from '@/lib/leads/first-touch';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { toHomeValueEstimate, type HomeValueResponse } from '@/lib/leads/home-value';

/** Strict limit for this public, unauthenticated valuation endpoint. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // per hour

/**
 * Input schema. The address is the CMA subject and is required; the email is
 * required because the whole point is capturing a reachable seller lead. Beds/
 * baths/sqft are optional but sharpen the RentCast match when supplied.
 */
const bodySchema = z.object({
  address: z.string().trim().min(5).max(200),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  stateRegion: z.string().trim().max(120).optional().or(z.literal('')),
  name: z.string().trim().max(160).optional().or(z.literal('')),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  beds: z.coerce.number().min(0).max(50).optional(),
  baths: z.coerce.number().min(0).max(50).optional(),
  squareFeet: z.coerce.number().min(0).max(1_000_000).optional(),
  propertyType: z.string().trim().max(60).optional().or(z.literal('')),
});

function nonEmpty(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;

  // ── Strict IP+slug rate limit (public, unauthenticated) ──────────────────
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(
    `home-value:rl:${slug}:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a bit.' },
      { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) } },
    );
  }

  // Reject oversized payloads before parsing.
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 100_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch (error) {
    logger.warn('[home-value] invalid JSON body', { slug }, error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please enter a valid address and email.',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ── Resolve the ONE tenant from the slug (never from the body) ────────────
  const space = await getSpaceFromSlug(slug);
  if (!space) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    // ── Real valuation via the shared CMA engine, scoped to this space. ─────
    // buildCma never throws on a RentCast miss — it degrades and labels the
    // data source honestly. The mapper below surfaces a number ONLY when the
    // payload can defend one.
    const cma = await buildCma({
      spaceId: space.id,
      subjectFields: {
        address: input.address,
        city: nonEmpty(input.city),
        stateRegion: nonEmpty(input.stateRegion),
        beds: input.beds ?? null,
        baths: input.baths ?? null,
        squareFeet: input.squareFeet ?? null,
        propertyType: nonEmpty(input.propertyType),
      },
      signal: req.signal,
    });
    const estimate = toHomeValueEstimate(cma);

    // ── Capture the SELLER Contact, scoped to THIS space. ───────────────────
    // The `.eq('spaceId', space.id)` boundary lives in the insert payload:
    // spaceId comes solely from the slug-resolved space, never the body.
    // `source` is the structured enum (this is a public web form on the
    // realtor's page); `sourceLabel` carries the free-form sub-channel so
    // analytics + the first-touch card can show where the lead came from.
    const contactId = crypto.randomUUID();
    const leadName = nonEmpty(input.name);
    const { data: inserted, error: insertError } = await supabase
      .from('Contact')
      .insert({
        id: contactId,
        spaceId: space.id,
        name: leadName ?? 'Home value lead',
        email: input.email.trim().toLowerCase(),
        phone: nonEmpty(input.phone),
        leadType: 'seller',
        formLeadType: 'seller',
        address: input.address,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['new-lead', 'home-value'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
        source: 'web_form',
        sourceLabel: 'home_value_tool',
        sourceDetail: input.address,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      logger.error('[home-value] contact insert failed', { spaceId: space.id }, insertError);
      return NextResponse.json({ error: 'Could not save your request. Try again.' }, { status: 500 });
    }
    const savedId = (inserted as { id: string }).id;

    logger.info('[home-value] seller lead captured', {
      spaceId: space.id,
      contactId: savedId,
      hasEstimate: estimate.hasEstimate,
      dataSource: estimate.dataSource,
    });

    // ── Instant First Touch (fire-and-forget) ───────────────────────────────
    // Same contract as /api/public/apply: fireFirstTouch never throws and
    // registers its own after() keep-alive, so zero latency is added and the
    // work survives the response returning. The try/catch is belt-and-braces.
    try {
      void fireFirstTouch({ spaceId: space.id, contactId: savedId });
    } catch (e) {
      logger.error('[home-value] first-touch dispatch failed (non-fatal)', { contactId: savedId }, e);
    }

    const body: HomeValueResponse = {
      captured: true,
      estimate,
      address: input.address,
    };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    logger.error('[home-value] unhandled failure', { slug, spaceId: space.id }, error);
    return NextResponse.json({ error: 'Server hiccup — usually temporary.' }, { status: 500 });
  }
}
