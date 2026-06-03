/**
 * `/teams/templates` — Shared templates.
 *
 * The broker writes it once; the floor reaches for it. Chippi adapts every
 * send to the lead and the realtor's voice so a template never lands as a
 * stamp. Hero → 3 tick-tock sections → quiet anchor → CTA. Hairline borders,
 * one primary CTA, no brand orange — the system holds because the rules hold.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TemplateAdaptDiagram } from '@/components/marketing/diagrams';

export const metadata = { title: 'Templates — Chippi for teams' };

export default function TeamsTemplatesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES · TEMPLATES"
        title="Write the reply once."
        sub="Approved templates the whole team reaches for. Chippi adapts them per-lead so every send feels written, not stamped."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      >
        <TemplateAdaptDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="THE LIBRARY"
        title="Named, tagged, searchable."
        sub="Templates for first-touch, for tour follow-up, for offer drafting, for the no-thank-you. The broker writes it once; the floor reaches for it."
        bullets={[
          'Categories the broker defines.',
          'Search and favorites.',
          'Version history per template.',
        ]}
      >
        <TemplateAdaptDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="ADAPTATION"
        title="Chippi makes it sound like you."
        sub="The template is the skeleton. Chippi fills in the lead's name, the property, the tone — adapted to the realtor's actual voice."
        bullets={[
          'Per-realtor voice training.',
          'Auto-fill from lead context.',
          'Diff preview before send.',
        ]}
      >
        <TemplateAdaptDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="COMPLIANCE"
        title="Locked for the moments that matter."
        sub="Some replies have legal language. Lock the template; the realtors can fill the blanks but can't break the spine."
        bullets={[
          'Lock-and-fill mode for sensitive sends.',
          'Edit log per template.',
          'Required-fields enforcement.',
        ]}
      />

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Less typing. Less risk."
        sub="A floor that writes the same way is a floor whose brand is consistent. Without making the realtors feel like robots."
      />

      <MarketingCTA
        title="Get your templates in one place."
        sub="Talk to us. Migration starts with what you already wrote."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
