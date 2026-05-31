/**
 * `/features/calendar` — the workday surface.
 *
 * The one idea: open the week, see the work, let Chippi handle the booking.
 * Tours and showings come in from Google or Outlook, get color-coded, and
 * sync back out. The page walks the realtor through the week view, the
 * inline booking from a reply, the two-way sync, and the follow-up stack.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Calendar — Chippi' };

export default function FeaturesCalendarPage() {
  return (
    <>
      <MarketingHero
        eyebrow="CALENDAR"
        title="Tours, showings, and follow-ups — one view."
        sub="Pull from Google or Outlook. Chippi books tours straight from a reply and writes them back to your calendar."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Calendar week view — tour blocks already placed, Chippi-drafted invite arrives."
        />
      </MarketingHero>

      <MarketingSection
        eyebrow="THE WEEK"
        title="A calendar that knows it's a workday."
        sub="Week, day, agenda. Tours and showings get their own color; the rest reads quiet."
        bullets={[
          'Week / day / agenda views.',
          'Tours and showings color-coded.',
          'Open hours per realtor.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Week view — calmly laid out blocks, tour blocks distinct from focus blocks."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE TOUR"
        title="Booked from the reply."
        sub="Reply with a time. Chippi books it, sends confirmations, and writes it to the deal record. No tab-switching."
        bullets={[
          'Inline booking from email.',
          'Confirmations to all parties.',
          'Activity logged on the deal.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Inline tour booking from the composer."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE SYNC"
        title="Both directions, always."
        sub="Anything Chippi adds shows up in your Google or Outlook calendar. Anything you add there shows up here."
        bullets={[
          'Google + Outlook OAuth.',
          'Two-way realtime sync.',
          'Conflicts surfaced, not buried.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Sync diagram — Chippi calendar ↔ Google calendar."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE FOLLOW-UP"
        title="Doesn't forget."
        sub="Chippi sets follow-ups when the deal asks for them. You see them stacked next to your tours."
        bullets={[
          'Auto follow-ups from agent context.',
          'Snooze and reschedule one-tap.',
          'Surface what to look at next.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Follow-up cards row — each with deal context and quick-action row."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="The calendar is the workday."
        sub="Open the week. See the work. Let Chippi handle the booking."
        stacked
      />

      <MarketingCTA
        title="Get the calendar working for you."
        sub="Connect Google or Outlook. Chippi takes it from there."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
