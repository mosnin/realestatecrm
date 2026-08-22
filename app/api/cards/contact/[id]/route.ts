import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { normalizeSlug } from '@/lib/intake';
import { tenantTable } from '@/lib/tenant-db';

/**
 * GET /api/cards/contact/[id]?slug=<workspace-slug>
 *
 * Lightweight card payload for the inline expandable contact card in the
 * Chippi chat. Returns only what the card renders — no dead weight.
 *
 * Auth: Clerk session. The space is ALWAYS resolved from the authenticated
 * caller (getSpaceForUser) — never from the `?slug=` query param. Slugs are
 * public (they appear in /apply/, /book/, /p/ URLs), so trusting a
 * caller-supplied slug to pick the space let any authenticated realtor read
 * another tenant's contact PII by passing a victim's slug. The query is now
 * scoped to the CALLER's own space, so a cross-tenant `id` simply 404s.
 *
 * The `slug` param is retained for backwards-compatible URLs but is only
 * used as a defensive cross-check: if present and it does not resolve to the
 * caller's own space, we 404 (same response as a missing row — no existence
 * leak).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug');

  // Authoritative space = the caller's own space. Resolved from the
  // authenticated userId, NOT from the attacker-controllable slug.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Defensive cross-check: a slug, if supplied, must match the caller's own
  // workspace. Compare normalized values against the caller's own (already
  // normalized) slug — no extra space lookup, and a foreign slug never
  // selects a foreign space.
  if (slug && normalizeSlug(slug) !== space.slug) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: contact, error: contactError } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
    .select(
      'id, name, email, phone, tags, leadType, leadScore, scoreLabel, budget, followUpAt, notes, updatedAt, createdAt',
    )
    .eq('id', id)
    .maybeSingle();

  if (contactError) {
    console.error('[cards/contact/GET] query error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch the last 3 activity records for this contact
  const { data: activityRows } = await tenantTable(supabase, 'ContactActivity', { spaceId: space.id })
    .select('id, type, content, createdAt')
    .eq('contactId', id)
    .order('createdAt', { ascending: false })
    .limit(5);

  // notes in Contact is a single string; surface as a single note item when present
  const notes =
    contact.notes
      ? [{ id: 'inline', content: contact.notes as string, createdAt: contact.updatedAt ?? contact.createdAt }]
      : [];

  const recentActivity = (activityRows ?? []).map((a: { id: string; type: string; content: string | null; createdAt: string }) => ({
    type: a.type,
    summary: a.content ?? a.type,
    createdAt: a.createdAt,
  }));

  return NextResponse.json({
    data: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags ?? [],
      leadType: contact.leadType ?? null,
      leadScore: contact.leadScore ?? null,
      scoreLabel: contact.scoreLabel ?? null,
      budget: contact.budget ?? null,
      followUpAt: contact.followUpAt ?? null,
      notes,
      recentActivity,
    },
  });
}
