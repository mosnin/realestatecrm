import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { formatPropertyAddress } from '@/lib/properties';
import { formatCurrency } from '@/lib/formatting';
import type { Property } from '@/lib/types';
import { PublicPageShell } from '@/components/public-page-shell';
import { FormUnavailable } from '@/components/form-unavailable';
import { PropertyStorefront } from './storefront';

/** viewport-fit=cover so the page draws under the iOS notch — one applicant-
 *  facing family with /p, /apply, /book. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Photos are stored as private object KEYs; sign a 24h URL on read. Legacy
 *  http(s) values pass through verbatim. Mirrors /book and /p. */
async function resolveStoredPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return await getSignedDownloadUrl(value, 60 * 60 * 24);
  } catch (err) {
    logger.warn('[p/[slug]/property] signed url failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) return { title: 'Listing — Chippi' };
  const { data: property } = await supabase
    .from('Property')
    .select('address, unitNumber, city, stateRegion')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!property) return { title: 'Listing — Chippi' };
  const addr = formatPropertyAddress(property as Property);
  return { title: addr, description: `Listing details for ${addr}.` };
}

export default async function PublicPropertyPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: propertyRow } = await supabase
    .from('Property')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!propertyRow) notFound();
  const property = propertyRow as Property;

  // Resolve branding + the realtor's public contact, same identity material as
  // /book and /p so the surfaces read as one family.
  const [{ data: settings }, { data: ownerData }, { data: profileRow }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('businessName, logoUrl, realtorPhotoUrl, intakeAccentColor, intakeDarkMode, phoneNumber, publicEmail')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase.from('User').select('name, avatar').eq('id', space.ownerId).maybeSingle(),
    supabase
      .from('ProfilePage')
      .select('profilePhotoUrl')
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  const businessName = settings?.businessName || space.name;
  const agentName = ownerData?.name || businessName;
  const logoUrl = settings?.logoUrl || null;

  // Sign all listing photos + the agent face in parallel. We deliberately do
  // NOT render the realtor's cover banner here — the listing's own gallery is
  // the focal element, and a second photo region above it would compete.
  const [photos, agentPhoto] = await Promise.all([
    Promise.all((Array.isArray(property.photos) ? property.photos : []).map((p) => resolveStoredPhoto(p))),
    resolveStoredPhoto(profileRow?.profilePhotoUrl ?? settings?.realtorPhotoUrl ?? ownerData?.avatar ?? null),
  ]);
  const signedPhotos = photos.filter((p): p is string => Boolean(p));

  // Gate on subscription status — pause only for explicitly failed billing.
  const subStatus = space.stripeSubscriptionStatus;
  const formPaused = subStatus === 'past_due' || subStatus === 'canceled' || subStatus === 'unpaid';
  if (formPaused) {
    return <FormUnavailable agentName={agentName} />;
  }
  // Hide the Chippi mark on paid tiers (white-label) — same rule as /book.
  const hidePoweredBy = subStatus === 'active' || subStatus === 'trialing';

  const accentColor = settings?.intakeAccentColor || '#ff964f';
  const addr = formatPropertyAddress(property);
  const priceLabel = property.listPrice != null ? formatCurrency(property.listPrice) : null;

  const customization = {
    accentColor,
    darkMode: settings?.intakeDarkMode || false,
  };

  return (
    <PublicPageShell
      logoUrl={logoUrl}
      businessName={businessName}
      agentName={agentName}
      agentPhone={settings?.phoneNumber || null}
      agentEmail={settings?.publicEmail || null}
      agentPhoto={agentPhoto}
      pageTitle={addr}
      trustLine={`Listing shared by ${agentName}.`}
      agentPresenceLabel="Listed by"
      hidePoweredBy={hidePoweredBy}
      customization={customization}
      profileHref={`/p/${slug}`}
    >
      <PropertyStorefront
        slug={slug}
        propertyId={property.id}
        address={addr}
        photos={signedPhotos}
        listingStatus={property.listingStatus}
        facts={{ beds: property.beds, baths: property.baths, squareFeet: property.squareFeet }}
        priceLabel={priceLabel}
        notes={property.notes}
        accentColor={accentColor}
      />
    </PublicPageShell>
  );
}
