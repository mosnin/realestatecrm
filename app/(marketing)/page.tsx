/**
 * `/` (home): Chippi homepage on the calm site system.
 *
 * An editorial scroll that says the idea once and shows the product:
 *   promise (hero + workspace shot) → integrations → the loop as alternating
 *   feature rows → a scroll-cinematic morning (pinned, scroll-as-clock) → the
 *   breadth (bento) → an honest metrics band → the enterprise-trust band → the
 *   belief → the ask.
 *
 * Image placeholders (hero, feature rows, studio) are labeled slots for real
 * screenshots. Auth users bounce straight to their workspace (unchanged).
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

  // One arc, no repeats: promise (video hero) → the stack it joins (logos) →
  // the loop, shown (feature rows) → a whole morning (pinned stage) → the
  // breadth (feature carousel) → voices + integrations (ruixen) → built for
  // the enterprise floor → results (case studies) → the ask (marquee CTA).
  // Bento, Metrics, and Trust were cut: each repeated a stronger section.
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

      {/* Voices + the stack — rounded card section */}
      <Section tone="card">
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
