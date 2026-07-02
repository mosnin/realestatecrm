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
import { HowItWorksCircuit } from '@/components/marketing/giga/how-it-works-circuit';

export const metadata = {
  title: 'Meet Chippi',
  description:
    'Chippi is the AI teammate that works your whole book: reading every lead, drafting in your voice, booking tours against your real calendar, and keeping the deal current. Nothing sends without your approval.',
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
              Not another tool.
              <br className="hidden sm:block" /> A teammate.
            </>
          }
          description="Chippi lives inside your CRM and works the hours between closings: reading, drafting, booking, and logging. You get the decisions, not the busywork."
          features={[
            { icon: 'Inbox', title: 'Reads every lead', desc: 'Every inbound read the moment it lands, history in context.' },
            { icon: 'MessagesSquare', title: 'Drafts in your voice', desc: 'A reply waiting before you open the thread.' },
            { icon: 'CalendarCheck', title: 'Books the tour', desc: 'Times proposed against your real availability.' },
          ]}
          image="/marketing/chippi-hero.jpg"
          variant="chippi"
          mockupSrc="/marketing/hero/chippi-dashboard.svg"
          mockupAlt="The Chippi workspace — Chippi at work on the book"
        />
        <ChippiReadsShowcase />
        <ChippiDecidesShowcase />
        <ChippiActsShowcase />
        <HowItWorksCircuit />
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
