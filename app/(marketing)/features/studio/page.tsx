/**
 * `/features/studio` — Studio (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-studio` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Studio — Chippi' };

export default function FeaturesStudioPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Studio'}
        title={'Make the content. Schedule the post.'}
        sub={'Generate listing copy, build a one-pager, schedule it to your channels. The agent edits — you approve.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Studio composer — generate → preview → schedule.'}
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
