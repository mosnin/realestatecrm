/**
 * Public realtor page — the "link in bio" surface at /p/[slug].
 *
 * No auth (same pattern as /apply/[slug] and /book/[slug]): resolve the
 * Space by slug, read branding from SpaceSetting, the page config from
 * ProfilePage, and — when enabled — the space's active listings. The
 * render lives in <PublicProfile/>.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { PublicProfile, type PublicProperty } from '@/components/profile-page/public-profile';

/** Cover photo & realtor photo are stored as object KEYS in our buckets
 *  (the bucket isn't anonymously readable). Sign a 24h URL for render —
 *  the page revalidates every 60s so freshness is fine. Legacy values
 *  that start with `http(s)://` are URLs already; pass through verbatim.
 */
async function resolveStoredPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value; // legacy URL, render as-is
  try {
    return await getSignedDownloadUrl(value, 60 * 60 * 24);
  } catch (err) {
    logger.warn('[p/[slug]] signed url failed', {
      keyPreview: value.slice(0, 60),
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Try Clerk's stored imageUrl as a last-resort fallback for the realtor's
 *  face. Returns null on any failure — the page just falls through to the
 *  generic avatar. Server-side fetch by clerkId; no auth required for
 *  reading another user's public profile fields.
 */
async function clerkImageUrlFor(clerkId: string | null | undefined): Promise<string | null> {
  if (!clerkId) return null;
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const user = await client.users.getUser(clerkId);
    return user?.imageUrl || null;
  } catch (err) {
    logger.warn('[p/[slug]] clerk lookup failed', {
      clerkIdPreview: clerkId.slice(0, 12),
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const revalidate = 60;

interface ProfileConfig {
  enabled: boolean;
  headline: string | null;
  showIntake: boolean;
  showTours: boolean;
  showProperties: boolean;
  customLinks: Array<{ id: string; label: string; url: string; thumbnail?: string }>;
  videos: Array<{ id: string; url: string; title?: string }>;
  coverPhotoUrl: string | null;
}

const DEFAULT_CONFIG: ProfileConfig = {
  enabled: true,
  headline: null,
  showIntake: true,
  showTours: true,
  showProperties: true,
  customLinks: [],
  videos: [],
  coverPhotoUrl: null,
};

export default async function PublicRealtorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settings }, { data: owner }, { data: profileRow }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select(
        'businessName, logoUrl, realtorPhotoUrl, bio, socialLinks, intakeAccentColor, intakeDarkMode',
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
    // clerkId added so we can fall back to the realtor's Clerk imageUrl when
    // neither realtorPhotoUrl nor avatar is set (covers the common case
    // where the realtor uploaded a photo to Clerk but never to Settings).
    supabase.from('User').select('name, avatar, clerkId').eq('id', space.ownerId).maybeSingle(),
    supabase
      .from('ProfilePage')
      .select(
        'enabled, headline, showIntake, showTours, showProperties, customLinks, videos, coverPhotoUrl',
      )
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  // No row yet = sensible defaults (the page works before the realtor edits
  // it). enabled === false means they've explicitly unpublished it.
  const cfg: ProfileConfig = { ...DEFAULT_CONFIG, ...((profileRow ?? {}) as Partial<ProfileConfig>) };
  if (cfg.enabled === false) notFound();

  let properties: PublicProperty[] = [];
  if (cfg.showProperties) {
    const { data } = await supabase
      .from('Property')
      .select('id, address, city, stateRegion, listPrice, photos, listingUrl')
      .eq('spaceId', space.id)
      .eq('listingStatus', 'active')
      .order('updatedAt', { ascending: false })
      .limit(6);
    properties = ((data ?? []) as PublicProperty[]);
  }

  const subStatus = space.stripeSubscriptionStatus;
  const hidePoweredBy = subStatus === 'active' || subStatus === 'trialing';

  const businessName = settings?.businessName || space.name;

  // Resolve photo URLs in parallel — cover + realtor + Clerk-fallback.
  // Each resolveStoredPhoto signs a 24h URL when the value is a storage
  // key; passes through if it's already a URL. clerkImageUrlFor only fires
  // if we have no other photo to fall back to.
  const [coverPhotoUrl, realtorPhotoFromStorage] = await Promise.all([
    resolveStoredPhoto(cfg.coverPhotoUrl),
    resolveStoredPhoto(settings?.realtorPhotoUrl ?? owner?.avatar ?? null),
  ]);
  const agentPhoto =
    realtorPhotoFromStorage ??
    (await clerkImageUrlFor((owner as { clerkId?: string | null } | null)?.clerkId));

  return (
    <PublicProfile
      slug={slug}
      businessName={businessName}
      logoUrl={settings?.logoUrl || null}
      agentName={owner?.name || businessName}
      agentPhoto={agentPhoto}
      bio={settings?.bio || null}
      headline={cfg.headline}
      socialLinks={(settings?.socialLinks as Record<string, string> | null) ?? null}
      accentColor={(settings?.intakeAccentColor as string | null) || '#ff964f'}
      darkMode={settings?.intakeDarkMode === true}
      showIntake={cfg.showIntake !== false}
      showTours={cfg.showTours !== false}
      customLinks={Array.isArray(cfg.customLinks) ? cfg.customLinks : []}
      videos={Array.isArray(cfg.videos) ? cfg.videos : []}
      coverPhotoUrl={coverPhotoUrl}
      properties={properties}
      hidePoweredBy={hidePoweredBy}
    />
  );
}
