/**
 * `/features/calendar` — the workday surface.
 *
 * The one idea: open the week, see the work, let Chippi handle the booking.
 * Tours and showings come in from Google or Outlook, get color-coded, and
 * sync back out. The page walks the realtor through the week view, the
 * inline booking from a reply, the two-way sync, and the follow-up stack.
 */

import { Calendar, CalendarDays, CalendarClock, Video, Home, Plus } from 'lucide-react';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { MarketingIntegrations } from '@/components/marketing/marketing-integrations';

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

      <MarketingIntegrations
        eyebrow="THE SYNC"
        title="Connects to the calendars you already keep."
        sub="OAuth once. Two-way sync, realtime. Tours land in the calendar your phone already pings."
        integrations={[
          {
            name: 'Google Calendar',
            description: 'Read and write across primary and shared calendars.',
            icon: Calendar,
          },
          {
            name: 'Microsoft Calendar',
            description: 'Outlook.com and Microsoft 365 — both included.',
            icon: CalendarDays,
          },
          {
            name: 'iCloud Calendar',
            description: 'For the realtor running an Apple stack.',
            icon: CalendarClock,
            comingSoon: true,
          },
          {
            name: 'Zoom',
            description: 'Auto-attach a meeting link to every virtual tour.',
            icon: Video,
            comingSoon: true,
          },
          {
            name: 'ShowingTime',
            description: 'Showings booked through the MLS, surfaced here.',
            icon: Home,
            comingSoon: true,
          },
          {
            name: 'And many more',
            description: 'Composio underneath — hundreds of tools, one wire.',
            icon: Plus,
          },
        ]}
        learnMore={{ label: 'Connect your calendar', href: '/login/realtor?intent=signup' }}
      />

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
