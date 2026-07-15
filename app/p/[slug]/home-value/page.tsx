/**
 * Public "What's my home worth?" seller lead-magnet — /p/[slug]/home-value.
 *
 * Top-of-funnel surface that turns a realtor's public page into a lead source:
 * a homeowner enters their address, gets a REAL estimated value range from our
 * CMA engine, and in exchange is captured as a seller lead (POST to
 * /api/public/home-value/[slug], which fires the existing Instant First Touch).
 *
 * No auth — resolves the Space by slug exactly like /p/[slug]/page.tsx. The
 * form + result live in the <HomeValueClient/> island; this server component
 * only resolves branding.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { HomeValueClient } from './home-value-client';

export const revalidate = 60;

export default async function HomeValuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('businessName, intakeAccentColor, intakeDarkMode')
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase.from('User').select('name').eq('id', space.ownerId).maybeSingle(),
  ]);

  const businessName = settings?.businessName || space.name;
  const agentName = owner?.name || businessName;
  const darkMode = settings?.intakeDarkMode === true;

  return (
    <HomeValueClient
      slug={slug}
      businessName={businessName}
      agentName={agentName}
      darkMode={darkMode}
    />
  );
}
