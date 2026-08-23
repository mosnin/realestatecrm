/**
 * `/brokerages`, the floor story. Server component (exports metadata). The
 * cinematic hero + showcases live in a forced-dark wrapper; the closing CTA
 * stays light/dark-adaptive like the home page.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import {
  BrokerageRoutingShowcase,
  BrokerageFloorShowcase,
  BrokerageApprovalsShowcase,
} from '@/components/marketing/giga/brokerage-showcases';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';

export const metadata = {
  title: 'For brokerages · Chippi',
  description:
    'Convert more leads across the whole brokerage. Chippi routes each inquiry, prepares replies, books tours, and gives leaders a live action log.',
};

export default function BrokeragesPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="Brokerage view"
          labelIcon="Building2"
          headline={
            <>
              Convert more leads
              <br className="hidden sm:block" /> across the whole floor.
            </>
          }
          description="Give every agent a lead conversion teammate. Route each inquiry, keep the next move visible, and review every send from one workspace."
          features={[
            { icon: 'ArrowRightLeft', title: 'Route each lead on arrival', desc: 'Assign by territory and load. Keep the reason on the record.' },
            { icon: 'Users', title: 'See the chase across the floor', desc: 'View leads, drafts, follow-ups, and deals by agent.' },
            { icon: 'ShieldCheck', title: 'Control every send', desc: 'Set roles, choose approvals, and review the action log.' },
          ]}
          image="/marketing/brokerages-hero.jpg"
          variant="floor"
          mockupSrc="/marketing/hero/brokerage-dashboard.svg"
          mockupAlt="The Chippi brokerage dashboard — the floor, live"
        />
        <BrokerageRoutingShowcase />
        <BrokerageFloorShowcase />
        <BrokerageApprovalsShowcase />
        <PricingTeaser
          headline={
            <>
              Pricing that scales
              <br className="hidden sm:block" /> with your floor.
            </>
          }
          plans={[
            {
              name: 'Team',
              price: '$497',
              blurb: 'For the growing floor.',
              features: ['5 seats included', '24,000 workflow credits / mo', '+$79 per extra seat'],
            },
            {
              name: 'Team Plus',
              price: '$897',
              blurb: 'For the established brokerage.',
              features: ['10 seats included', '50,000 workflow credits / mo', '+$69 per extra seat'],
              featured: true,
            },
          ]}
        />
      </div>
      <CtaSection />
    </>
  );
}
