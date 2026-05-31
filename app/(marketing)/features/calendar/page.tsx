/**
 * `/features/calendar` — Calendar (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-calendar` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Calendar — Chippi' };

export default function FeaturesCalendarPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Calendar'}
        title={'Tours, showings, and follow-ups in one view.'}
        sub={'Pull from Google or Outlook; Chippi books tours straight from a reply and writes them back to your calendar.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Calendar view — week view with tour blocks and a Chippi-drafted invite.'}
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
