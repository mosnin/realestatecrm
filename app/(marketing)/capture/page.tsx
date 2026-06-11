/**
 * `/capture` — every way a lead enters Chippi (intake forms, property pages,
 * tour links, your public bio), then the provided task-loop section showing
 * what happens to each captured lead, then the ask.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FeatureGrid, DarkStatBand } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import FeatureSection from '@/components/ui/feature-section';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Capture leads · Chippi',
  description:
    'Intake forms, property pages, tour links, and your public bio — every door leads into Chippi, where each lead is scored, drafted, and followed up automatically.',
};

const DOORS = [
  {
    kicker: 'Forms',
    title: 'Intake, anywhere',
    body: 'Branded forms you drop anywhere — every submission lands in Chippi scored, with the first reply already drafted.',
  },
  {
    kicker: 'Property pages',
    title: 'Listings that capture',
    body: 'Every listing gets a public page with "ask about this home" built in. Questions become scored leads tied to the property.',
  },
  {
    kicker: 'Tour links',
    title: 'Bookings become leads',
    body: 'Share a booking link; buyers pick a time that works. The tour lands on your calendar and the lead lands in your book.',
  },
  {
    kicker: 'Your bio',
    title: 'One link in every profile',
    body: 'Your listings, your booking link, your contact form — all feeding Chippi.',
  },
];

export default function CapturePage() {
  return (
    <>
      <PageHero
        eyebrow="Capture leads"
        title="Every door leads to Chippi."
        sub="Forms, property pages, tour links, your bio — wherever a lead finds you, they land in one place, scored and worked from the first second."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See your public bio', href: '/bio' }}
      />

      {/* The four doors */}
      <section className="bg-background px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <FeatureGrid items={DOORS} columns={4} />
        </div>
      </section>

      {/* The loop — provided animated feature section */}
      <section className="border-y border-border/60 bg-muted/10">
        <FeatureSection />
      </section>

      <DarkStatBand
        eyebrow="The outcome"
        title="Every door, one pipeline."
        stats={[
          { value: '4+', label: 'capture channels' },
          { value: '2 min', label: 'to first reply' },
          { value: '0', label: 'missed leads' },
        ]}
      />

      {/* Closing CTA */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Open every door tonight.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Your forms, property pages, and bio link are live in minutes — and Chippi
            works every lead that walks through.
          </p>
          <div className="mt-8">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
