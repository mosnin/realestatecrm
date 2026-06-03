/**
 * `/` — Chippi homepage (v2 rebuild).
 *
 * A single scrolling experience, told the way Apple tells a product: meet the
 * agent (hero) → quiet proof (logos) → the work it handles (core cards) → the
 * first ask (CTA) → the rest of the workspace (deep features) → the numbers
 * (stats) → the voices (testimonials) → the payoff where the realtor's whole
 * world wires into Chippi (connect diagram) → thinking (blog) → arrival
 * (footer). Bold-sans, light-canvas, motion throughout.
 *
 * Auth users bounce straight to their workspace. The bespoke <HomeFooter>
 * replaces the shared marketing footer here (which returns null on `/`).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { HomeHero } from '@/components/marketing/home/home-hero';
import { LogoMarquee } from '@/components/marketing/home/logo-marquee';
import { CoreCards } from '@/components/marketing/home/core-cards';
import { TryFreeCTA } from '@/components/marketing/home/try-free-cta';
import { DeepFeatures } from '@/components/marketing/home/deep-features';
import { StatsBand } from '@/components/marketing/home/stats-band';
import { TestimonialMarquee } from '@/components/marketing/home/testimonial-marquee';
import { IntegrationsBeam } from '@/components/marketing/home/integrations-beam';
import { BlogTeaser } from '@/components/marketing/home/blog-teaser';
import { HomeFooter } from '@/components/marketing/home/home-footer';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div className="bg-muted text-foreground">
      <HomeHero />
      <LogoMarquee />
      <CoreCards />
      <TryFreeCTA />
      <DeepFeatures />
      <StatsBand />
      <TestimonialMarquee />
      <IntegrationsBeam />
      <BlogTeaser />
      <HomeFooter />
    </div>
  );
}
