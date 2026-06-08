/**
 * `/` (home): Chippi homepage, rebuilt on the fortitudo "studio ASCII" design system.
 *
 * One scrolling experience in fortitudo's section vocabulary, carrying Chippi's
 * real-estate-CRM substance: meet the agent (ASCII hero with the rotating job
 * word) → the honest number strip (stats) → the work it handles (gradient
 * cards) → the flow (how it works) → the voices (testimonials) → why it exists
 * (about) → the ask (ASCII CTA). The shared fortitudo footer/nav come from the
 * route-group layout, so there's no per-page footer here.
 *
 * Auth users bounce straight to their workspace (unchanged auth wiring).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { HomeHero } from '@/components/marketing/fortitudo/home/hero';
import { StatsBand } from '@/components/marketing/fortitudo/home/stats-band';
import { CoreCards } from '@/components/marketing/fortitudo/home/core-cards';
import { AgentShowcase } from '@/components/marketing/fortitudo/home/agent-showcase';
import { HowItWorks } from '@/components/marketing/fortitudo/home/how-it-works';
import { Testimonials } from '@/components/marketing/fortitudo/home/testimonials';
import { About } from '@/components/marketing/fortitudo/home/about';
import { HomeCTA } from '@/components/marketing/fortitudo/home/cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div className="bg-background text-foreground">
      <HomeHero />
      <StatsBand />
      <CoreCards />
      <HowItWorks />
      <Testimonials />
      <About />
      <HomeCTA />
    </div>
  );
}
