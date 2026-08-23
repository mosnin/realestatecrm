/**
 * `/chippi`, the flagship "Meet Chippi" page. Server component (exports
 * metadata). Same cinematic layout as the rest of the redesign: a sub-hero +
 * the three core showcases (the OS, the agent dashboard, the brokerage
 * dashboard) in a forced-dark wrapper, a compact pricing teaser, then the
 * light/dark-adaptive closing CTA.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import {
  ChippiReadsShowcase,
  ChippiDecidesShowcase,
  ChippiActsShowcase,
} from '@/components/marketing/giga/chippi-showcases';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';

export const metadata = {
  title: 'Meet Chippi',
  description:
    'Meet the AI lead conversion teammate for real estate. Chippi reads every inquiry, ranks intent, drafts replies, books tours, and keeps the CRM current.',
};

export default function MeetChippiPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="Meet Chippi"
          labelIcon="LayoutGrid"
          headline={
            <>
              One teammate from
              <br className="hidden sm:block" /> inquiry to booked tour.
            </>
          }
          description="Chippi works across your inbox, calendar, and CRM. It reads, ranks, drafts, books, and logs the next move. You decide what may send."
          features={[
            { icon: 'Inbox', title: 'Reads every inquiry', desc: 'New leads arrive with their history and next move in context.' },
            { icon: 'MessagesSquare', title: 'Drafts in your voice', desc: 'Send through your own connected inbox when you are ready.' },
            { icon: 'CalendarCheck', title: 'Books the tour', desc: 'Times come from your real availability, not a separate calendar.' },
          ]}
          image="/marketing/chippi-hero.jpg"
          variant="chippi"
          mockupSrc="/marketing/hero/chippi-dashboard.svg"
          mockupAlt="The Chippi workspace — Chippi at work on the book"
        />
        <ChippiReadsShowcase />
        <ChippiDecidesShowcase />
        <ChippiActsShowcase />
        <PricingTeaser
          headline={
            <>
              One teammate.
              <br className="hidden sm:block" /> From a desk to a floor.
            </>
          }
          plans={[
            {
              name: 'Solo',
              price: '$97',
              blurb: 'For the agent putting Chippi on their book.',
              features: ['1 seat', '3,000 workflow credits / mo', 'Every Chippi feature'],
            },
            {
              name: 'Team',
              price: '$497',
              blurb: 'For the brokerage running the whole floor on Chippi.',
              features: ['5 seats included', '24,000 workflow credits / mo', '+$79 per extra seat'],
              featured: true,
            },
          ]}
        />
      </div>
      <CtaSection />
    </>
  );
}
