/**
 * `/demo` — book a demo.
 *
 * One focal element: the scheduler. A brokerage or team evaluating Chippi
 * lands here, reads one sentence about what they'll see, and books a time.
 * No second ask competing — just a quiet "start now" line under the calendar.
 *
 * Bold-canvas shell: PageHero opener, then the DemoBooking scheduler in a
 * white soft-shadow card. Swapping in the real scheduler is ONE line: paste
 * the Calendly inline-embed URL into CALENDLY_URL in
 * `components/marketing/demo/demo-booking.tsx`. Empty → a calm placeholder.
 */

import { PageHero } from '@/components/marketing/site/page-hero';
import { DemoBooking } from '@/components/marketing/demo/demo-booking';

export const metadata = { title: 'Book a demo · Chippi' };

export default function DemoPage() {
  return (
    <>
      <PageHero
        eyebrow="See it live"
        title="See Chippi run your floor."
        sub="For brokerages and teams sizing up Chippi. Pick a time and we’ll walk your floor through it live — the inbox, the drafts, the deals it keeps current — then answer how it fits your book."
      />
      <DemoBooking />
    </>
  );
}
