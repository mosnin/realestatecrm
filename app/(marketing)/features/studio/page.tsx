/**
 * `/features/studio` — Studio.
 *
 * Make the content, ship the content. Generate → edit → schedule.
 * Hero → create → edit → schedule → promise → CTA. Voice is lowercase
 * verbs and periods, no exclamation.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { MarketingScrollNarrative } from '@/components/marketing/marketing-scroll-narrative';
import {
  StudioDiagram,
  TemplateAdaptDiagram,
  CalendarBookingDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'Studio — Chippi' };

export default function FeaturesStudioPage() {
  return (
    <>
      <MarketingHero
        eyebrow="STUDIO"
        title="Make the content. Schedule the post."
        sub="Listing copy, one-pagers, social posts. Chippi generates; you approve; schedule to your channels."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <StudioDiagram aspect="video" />
      </MarketingHero>

      {/* The Studio workflow renders as a sequenced narrative — STEP 01
          (create), STEP 02 (edit), STEP 03 (schedule) — instead of the
          standard tick-tock. Studio is the most linear surface in Chippi
          and benefits from the numbered cadence. Audit recommendation:
          vary the rhythm so the marketing site doesn't read as nineteen
          identical pages. */}
      <MarketingScrollNarrative
        steps={[
          {
            eyebrow: 'CREATE',
            title: 'Generate. Preview. Approve.',
            sub: 'From a property record, Chippi drafts the listing copy, the email blast, and the social post. You edit; you approve; you schedule.',
            media: <StudioDiagram aspect="video" />,
          },
          {
            eyebrow: 'EDIT',
            title: 'The polished version, side-by-side.',
            sub: 'Generated copy on the left. Your edits on the right. Diff highlighted so you see exactly what changed.',
            media: <TemplateAdaptDiagram aspect="video" />,
          },
          {
            eyebrow: 'SCHEDULE',
            title: 'When to post. Where to post.',
            sub: "Schedule to Instagram, Facebook, LinkedIn, and your email list. Calendar view shows what's queued.",
            media: <CalendarBookingDiagram aspect="video" />,
          },
        ]}
      />

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Content that ships."
        sub="Drafts that don't sit in a Notes app for a week."
      />

      <MarketingCTA
        title="Make Studio work for you."
        sub="Connect your channels. Chippi takes it from there."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
