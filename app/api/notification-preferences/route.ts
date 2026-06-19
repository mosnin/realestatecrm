import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { resolveEffectivePrefs, normalizeCadence } from '@/lib/notify-prefs';

/**
 * Per-member notification preference override.
 *
 * Notification prefs are space-level by default (SpaceSetting). In a brokerage,
 * a member who can see a space can't tune their own experience from those
 * shared toggles. This route is the per-(space, user) override layer: the
 * CALLING user sets their own channels / event types / digest cadence for the
 * given space, and the resolver (lib/notify-prefs) layers it over the space
 * default.
 *
 * The override is keyed by the caller's Clerk user id (the same `userId`
 * convention as NotificationState). A field omitted from the override means
 * "inherit the space default", so a member overrides only what they set.
 *
 * Access reuses requireSpaceOwner — the same gate the dashboard notification
 * routes use — which admits the space owner and brokerage owners/admins who
 * manage the space.
 */

interface ChannelsPatch {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}
interface EventTypesPatch {
  newLeads?: boolean;
  tourBookings?: boolean;
  newDeals?: boolean;
  followUps?: boolean;
}

/** Keep only known boolean keys so a client can't stuff arbitrary JSON. */
function sanitizeChannels(input: unknown): ChannelsPatch | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const src = input as Record<string, unknown>;
  const out: ChannelsPatch = {};
  for (const k of ['email', 'sms', 'push'] as const) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function sanitizeEventTypes(input: unknown): EventTypesPatch | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const src = input as Record<string, unknown>;
  const out: EventTypesPatch = {};
  for (const k of ['newLeads', 'tourBookings', 'newDeals', 'followUps'] as const) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * GET — the caller's EFFECTIVE prefs for the space (override merged over the
 * space default) plus the raw override row so a settings UI can show what the
 * member has explicitly set vs. inherited.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, space } = authResult;

  const [effective, overrideRes] = await Promise.all([
    resolveEffectivePrefs(space.id, userId),
    supabase
      .from('NotificationPreference')
      .select('channels, eventTypes, digestCadence')
      .eq('spaceId', space.id)
      .eq('userId', userId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    effective,
    override: overrideRes.data ?? null,
  });
}

/**
 * PATCH — upsert the caller's override for the space. Body fields are optional;
 * an omitted field is left untouched. To CLEAR an override field back to
 * inheriting the space default, pass null for it.
 *
 * Body: { slug, channels?, eventTypes?, digestCadence? }
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : null;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, space } = authResult;

  // Build only the fields the caller actually supplied. `null` explicitly
  // clears that override back to "inherit the space default".
  const update: Record<string, unknown> = {};
  if ('channels' in body) {
    update.channels = body.channels === null ? null : (sanitizeChannels(body.channels) ?? null);
  }
  if ('eventTypes' in body) {
    update.eventTypes = body.eventTypes === null ? null : (sanitizeEventTypes(body.eventTypes) ?? null);
  }
  if ('digestCadence' in body) {
    // null clears (inherit); otherwise normalize to a legal cadence.
    update.digestCadence = body.digestCadence === null ? null : normalizeCadence(body.digestCadence);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No preference fields supplied' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('NotificationPreference').upsert(
    {
      id: crypto.randomUUID(),
      spaceId: space.id,
      userId,
      ...update,
      updatedAt: nowIso,
    },
    { onConflict: 'spaceId,userId' },
  );
  if (error) {
    console.error('[PATCH /api/notification-preferences] upsert error:', error);
    return NextResponse.json({ error: "Couldn't save preferences — usually temporary." }, { status: 500 });
  }

  const effective = await resolveEffectivePrefs(space.id, userId);
  return NextResponse.json({ success: true, effective });
}
