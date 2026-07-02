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
    'Give every agent on the floor a Chippi: leads routed to the right agent, replies in each agent\u2019s voice, and a live floor view with role-based controls and an audit log.',
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
              One agent behind
              <br className="hidden sm:block" /> every desk on the floor.
            </>
          }
          description="Give every agent a Chippi: leads routed, performance visible, and every send on the record, from a solo desk to hundreds of agents."
          features={[
            { icon: 'ArrowRightLeft', title: 'Routing on arrival', desc: 'Leads auto-assigned by territory and load, logged with the reason.' },
            { icon: 'Users', title: 'The floor, live', desc: 'Deals, drafts, and follow-ups per agent in real time.' },
            { icon: 'ShieldCheck', title: 'Accountable', desc: 'Every send named, every action on the audit log.' },
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
