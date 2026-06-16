/**
 * `/` (home) — the dark, cinematic marketing homepage ("Giga" redesign).
 *
 * Sections, in order:
 *   1. Hero — full-bleed real-estate photo, centered serif headline, white pill
 *      CTA, a bottom-left video/testimonial card, and a marquee logo cloud.
 *   2. Stats — the big-numbers band right under the hero.
 *   3. AgentCanvas — THE feature section: one animated component (scenic photo
 *      background with a product-UI card composited over it) whose stepped list
 *      auto-advances with progress bars and swaps the card per step.
 *   4. Complexity — the brokerage-floor closer.
 *
 * Every child here is a self-contained client component that takes NO props, so
 * nothing crosses the server→client boundary (this page is a Server Component;
 * it `auth()`s and bounces signed-in users to their workspace first).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/giga/hero';
import { Stats } from '@/components/marketing/giga/stats';
import { AgentCanvas } from '@/components/marketing/giga/agent-canvas';
import { RealtorShowcase } from '@/components/marketing/giga/realtor-showcase';
import { BrokerageShowcase } from '@/components/marketing/giga/brokerage-showcase';
import { Complexity } from '@/components/marketing/giga/complexity';
import { ResearchSection } from '@/components/marketing/giga/research';
import { CtaSection } from '@/components/marketing/giga/cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      {/* Cinematic sections stay dark in both themes (reference-style). */}
      <div className="dark bg-[#0a0a0a] text-white">
        <Hero />
        <Stats />
        <AgentCanvas />
        <RealtorShowcase />
        <BrokerageShowcase />
        <Complexity />
      </div>
      {/* Light/dark-adaptive closing sections */}
      <ResearchSection />
      <CtaSection />
    </>
  );
}
