/**
 * `/` (home) — the dark, cinematic marketing homepage (Giga redesign).
 *
 * Sections, in order:
 *   1. Hero — full-bleed real-estate photo, centered serif headline, white
 *      pill CTA, a bottom-left video/testimonial card, and a logo cloud.
 *   2. FeatureCarousel — the auto-advancing tabbed feature showcase with
 *      per-tab progress bars (the key interaction).
 *   3. Stats — the big-numbers band.
 *   4. Complexity — "built to handle complexity" three-column section.
 *   (The closing CTA + footer live in the marketing layout's SiteFooter.)
 *
 * The aesthetic matches the reference; the copy stays Chippi/real-estate.
 * Auth users are bounced to their workspace before any of this renders.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/giga/hero';
import { FeatureCarousel } from '@/components/marketing/giga/feature-carousel';
import { Stats } from '@/components/marketing/giga/stats';
import { Complexity } from '@/components/marketing/giga/complexity';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      <Hero />
      <FeatureCarousel />
      <Stats />
      <Complexity />
    </>
  );
}
