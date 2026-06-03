/**
 * `/features/people` — People.
 *
 * Hero → three tick-tock sections (record, timeline, score) → quiet anchor → CTA.
 * Apple discipline: serif Times headlines via the primitives, hairline borders,
 * one primary CTA per page, lowercase verbs, no exclamation marks, no orange.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import {
  TimelineDiagram,
  LeadScoreDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'People — Chippi' };

export default function FeaturesPeoplePage() {
  return (
    <>
      <MarketingHero
        eyebrow="PEOPLE"
        title="Every contact, every detail, in one place."
        sub="Renters, buyers, sellers, vendors. Each is a record with a full timeline. Chippi keeps it current; you read it at a glance."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <TimelineDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        eyebrow="THE RECORD"
        title="Captured once. Kept current."
        sub="Names, numbers, budgets, neighborhoods, household, preferences. The record fills at intake and stays fresh as the deal moves."
        bullets={[
          'Structured fields at intake.',
          'Free-form notes alongside.',
          'Linked to every deal, every email, every tour.',
        ]}
        side="right"
      >
        <TimelineDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE TIMELINE"
        title="Every touch, in order."
        sub="Emails, calls, tours, drafts, replies — assembled chronologically. You scroll the relationship; you don't reconstruct it."
        bullets={[
          'Email and call threads unified.',
          'Chippi-authored actions tagged.',
          'Filter to a stage or a tool.',
        ]}
        side="left"
      >
        <TimelineDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE SCORE"
        title="Hot, warm, cold — at a glance."
        sub="Every contact gets scored against your active deals. Reason attached, in plain language."
        bullets={[
          'Multi-signal scoring.',
          'Plain-language reason.',
          'Updates as the deal moves.',
        ]}
        side="right"
      >
        <LeadScoreDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="People as people."
        sub="Not leads. Not entries. People you're building a business with."
        stacked
      />

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox; we'll bring the people."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
