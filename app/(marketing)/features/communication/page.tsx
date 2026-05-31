/**
 * `/features/communication` — Communication (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-communication` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Communication — Chippi' };

export default function FeaturesCommunicationPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Communication'}
        title={'Your inbox, in here.'}
        sub={'Read and reply in Chippi. Threads, stars, attachments — everything Gmail does, with Chippi drafting the reply you were going to type anyway.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Inbox + read view — thread list left, message right, Chippi draft card open.'}
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
