/**
 * GET   /api/profile-page — the realtor's public-page config (defaults if unset).
 * PATCH /api/profile-page — update enabled / headline / section toggles / links.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const SELECT = 'enabled, headline, showIntake, showTours, showProperties, customLinks';

const DEFAULTS = {
  enabled: true,
  headline: null as string | null,
  showIntake: true,
  showTours: true,
  showProperties: true,
  customLinks: [] as Array<{ id: string; label: string; url: string }>,
};

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await supabase
    .from('ProfilePage')
    .select(SELECT)
    .eq('spaceId', space.id)
    .maybeSingle();

  return NextResponse.json({ ...DEFAULTS, ...(data ?? {}) });
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  for (const key of ['enabled', 'showIntake', 'showTours', 'showProperties'] as const) {
    if (typeof body[key] === 'boolean') patch[key] = body[key];
  }
  if (body.headline === null || typeof body.headline === 'string') {
    patch.headline =
      typeof body.headline === 'string' ? body.headline.trim().slice(0, 200) || null : null;
  }
  if (Array.isArray(body.customLinks)) {
    // Sanitize to [{ id, label, url, thumbnail }] — cap 20, http(s) URLs only.
    // thumbnail is optional and only kept when it's itself an http(s) URL.
    patch.customLinks = (body.customLinks as unknown[])
      .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object')
      .slice(0, 20)
      .map((l) => ({
        id: typeof l.id === 'string' && l.id ? l.id : crypto.randomUUID(),
        label: typeof l.label === 'string' ? l.label.trim().slice(0, 80) : '',
        url: typeof l.url === 'string' ? l.url.trim().slice(0, 500) : '',
        thumbnail:
          typeof l.thumbnail === 'string' && /^https?:\/\//i.test(l.thumbnail.trim())
            ? l.thumbnail.trim().slice(0, 500)
            : '',
      }))
      .filter((l) => l.label && /^https?:\/\//i.test(l.url));
  }

  const { data, error } = await supabase
    .from('ProfilePage')
    .upsert({ spaceId: space.id, ...patch }, { onConflict: 'spaceId' })
    .select(SELECT)
    .single();

  if (error) {
    logger.error('[profile-page] update failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json(data);
}
