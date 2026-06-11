/**
 * `/` (home): the Chippi homepage on the shared marketing system.
 *
 * One arc, no repeats — each beat earns its place and none restates another:
 *   promise (video hero) → the stack it joins (logos) → the loop, shown
 *   (feature rows) → a whole morning (pinned stage) → the breadth (gallery
 *   card) → voices + integrations (ruixen card) → built for the enterprise
 *   floor → results (case-studies card) → the ask (marquee CTA).
 *
 * Cards (rounded surfaces) break the lower half; the live product panels carry
 * the proof. Auth users bounce straight to their workspace (unchanged).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { Logos3 } from '@/components/ui/logos3';
import { Features } from '@/components/marketing/site/home/features';
import { MorningStage } from '@/components/marketing/site/home/morning-stage';
import GalleryHoverCarousel from '@/components/ui/gallery-hover-carousel';
import RuixenSection from '@/components/ui/ruixen-feature-section';
import { Enterprise } from '@/components/marketing/site/home/enterprise';
import Casestudies from '@/components/ui/case-studies';
import CTAWithVerticalMarquee from '@/components/ui/cta-with-text-marquee';
import { Section, SectionHeader } from '@/components/marketing/site/section';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div className="bg-background text-foreground">
      <Hero />
      <Logos3 />
      <Features />
      <MorningStage />

      {/* The breadth — rounded card section */}
      <Section tone="card">
        <SectionHeader
          eyebrow="The whole job"
          title="Everything Chippi runs for you."
          sub="Hover a card to see what each piece does — then open it on its own page."
        />
        <div className="mt-10">
          <GalleryHoverCarousel heading="" />
        </div>
      </Section>

      {/* Voices + the stack — tint card for rhythm against the paper cards */}
      <Section tone="tint">
        <SectionHeader
          eyebrow="In their words"
          title="One agent, the whole job."
          sub="Realtors and brokers describe the same thing: the busywork runs itself."
        />
        <div className="mt-6">
          <RuixenSection />
        </div>
      </Section>

      <Enterprise />

      {/* Results — rounded card section */}
      <Section tone="card">
        <SectionHeader
          align="center"
          eyebrow="Real workflows"
          title="Run by Chippi, end to end."
          sub="From the solo realtor's inbox to the brokerage floor — proven by the product's own panels."
        />
        <div className="mt-6">
          <Casestudies />
        </div>
      </Section>

      <CTAWithVerticalMarquee />
    </div>
  );
}
