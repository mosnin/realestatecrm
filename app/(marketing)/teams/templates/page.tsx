/**
 * `/teams/templates` — Shared templates (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams-templates` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Templates — Chippi' };

export default function TeamsTemplatesPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Shared templates'}
        title={'Write the reply once.'}
        sub={'Approved templates the whole team can reach for. Chippi adapts them per-lead so every send feels written, not stamped.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Template library — list of named templates with preview snippets.'}
        />
      </MarketingHero>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
