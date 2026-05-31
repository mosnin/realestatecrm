/**
 * `/features/files` — Files (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-files` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Files — Chippi' };

export default function FeaturesFilesPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Files'}
        title={'A file room for the deal.'}
        sub={'Documents, photos, contracts, signed PDFs — organized per-deal, searchable, with version history.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Files browser — folder list left, file grid right.'}
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
