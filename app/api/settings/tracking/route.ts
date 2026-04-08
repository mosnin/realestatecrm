import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import type { TrackingPixels } from '@/lib/types';

// Pixel ID fields must be alphanumeric + hyphens only (prevent XSS via ID injection)
const PIXEL_ID_REGEX = /^[a-zA-Z0-9\-_]+$/;

const PIXEL_ID_FIELDS: (keyof TrackingPixels)[] = [
  'facebookPixelId',
  'tiktokPixelId',
  'googleAnalyticsId',
  'googleAdsId',
  'twitterPixelId',
  'linkedinPartnerId',
  'snapchatPixelId',
];

function validatePixelId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!PIXEL_ID_REGEX.test(trimmed)) return null;
  // Cap length at 100 characters
  return trimmed.slice(0, 100);
}

/**
 * Sanitize custom head script:
 * - Strip script tags that reference non-HTTPS sources
 * - Cap at 10KB
 */
function sanitizeCustomScript(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Cap at 10KB
  const capped = trimmed.slice(0, 10_000);
  // Remove script src= attributes that reference non-HTTPS URLs
  const sanitized = capped.replace(
    /src\s*=\s*["']http:\/\/[^"']*["']/gi,
    'src=""',
  );
  return sanitized;
}

async function resolveSpaceFromSlug(slug: string, clerkUserId: string) {
  // Get our DB user
  const { data: user, error: userError } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .maybeSingle();
  if (userError || !user) return null;

  // Get space and verify ownership
  const { data: space, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug')
    .eq('slug', slug)
    .eq('ownerId', user.id)
    .maybeSingle();
  if (spaceError || !space) return null;

  return space;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const space = await resolveSpaceFromSlug(slug, userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: settings, error } = await supabase
    .from('SpaceSetting')
    .select('trackingPixels')
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    console.error('[api/settings/tracking] GET error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  return NextResponse.json({
    trackingPixels: settings?.trackingPixels ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : null;
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const space = await resolveSpaceFromSlug(slug, userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate and build trackingPixels JSONB
  const pixels = body.trackingPixels as Record<string, unknown> | undefined;
  if (!pixels || typeof pixels !== 'object') {
    return NextResponse.json({ error: 'Missing trackingPixels object' }, { status: 400 });
  }

  const validationErrors: string[] = [];
  const sanitized: TrackingPixels = {};

  for (const field of PIXEL_ID_FIELDS) {
    const raw = pixels[field];
    if (raw !== undefined && raw !== null && raw !== '') {
      const clean = validatePixelId(raw);
      if (clean === null) {
        validationErrors.push(`${field}: must be alphanumeric (letters, numbers, hyphens, underscores only)`);
      } else {
        (sanitized as Record<string, string>)[field] = clean;
      }
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: validationErrors }, { status: 400 });
  }

  // Handle custom head script
  const customScript = sanitizeCustomScript(pixels.customHeadScript);
  if (customScript) {
    sanitized.customHeadScript = customScript;
  }

  const { error: updateError } = await supabase
    .from('SpaceSetting')
    .update({ trackingPixels: sanitized })
    .eq('spaceId', space.id);

  if (updateError) {
    console.error('[api/settings/tracking] PUT error:', updateError);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trackingPixels: sanitized });
}
