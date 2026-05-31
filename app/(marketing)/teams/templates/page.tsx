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
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

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
        <MarketingMediaSlot
          aspect="video"
          description="Template library — broker writes a template; Chippi adapts it for a specific lead in the next clip."
        />
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
        <MarketingMediaSlot
          aspect="square"
          description="Template library list with category sidebar."
        />
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
        <MarketingMediaSlot
          aspect="wide"
          description="Side-by-side: template skeleton on left, Chippi-adapted draft on right, the realtor approves with one tap."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="COMPLIANCE"
        title="Locked for the moments that matter."
        sub="Some replies have legal language. Lock the template; the realtors can fill the blanks but can't break the spine."
        bullets={[
          'Lock-and-fill mode for sensitive sends.',
          'Edit log per template.',
          'Required-fields enforcement.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="A locked template — fields highlighted as fillable, spine grayed."
        />
      </MarketingSection>

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
