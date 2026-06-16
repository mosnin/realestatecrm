/**
 * `/integrations`, the connect-your-stack story. Server component (exports
 * metadata). Same layout as /agents and /brokerages: a cinematic hero +
 * showcases in a forced-dark wrapper, then a light/dark-adaptive closing CTA.
 *
 * Grounded in the real apps Chippi connects to through Composio (inbox,
 * calendar, CRM, messaging, e-sign); no invented integrations.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import { IntegrationsShowcase } from '@/components/marketing/giga/integrations-showcase';
import {
  IntegrationsSetupShowcase,
  IntegrationsAutomationShowcase,
} from '@/components/marketing/giga/integrations-extra-showcases';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';

export const metadata = {
  title: 'Integrations · Chippi',
  description:
    'Connect the tools you already pay for. Chippi plugs into your inbox, calendar, CRM, messaging, and e-sign through Composio, then works inside them, no rip and replace.',
};

export default function IntegrationsPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="Integrations"
          labelIcon="Workflow"
          headline={
            <>
              Chippi works where
              <br className="hidden sm:block" /> you already work.
            </>
          }
          description="Connect your inbox, calendar, CRM, messaging, and e-sign in a couple of clicks. Chippi reads from and writes back to each one as it works, so nothing falls out of date."
          features={[
            { icon: 'Mail', title: 'Email and calendar', desc: 'Gmail, Outlook, Google Calendar, and Calendly.' },
            { icon: 'Users', title: 'Your CRM', desc: 'HubSpot, Salesforce, and Follow Up Boss, two-way.' },
            { icon: 'MessagesSquare', title: 'Messaging and e-sign', desc: 'WhatsApp, Twilio SMS, Slack, and DocuSign.' },
          ]}
          image="/marketing/integrations-hero.jpg"
        />
        <IntegrationsShowcase />
        <IntegrationsSetupShowcase />
        <IntegrationsAutomationShowcase />
        <PricingTeaser
          eyebrow="Pricing"
          headline={
            <>
              Every plan includes
              <br className="hidden sm:block" /> every integration.
            </>
          }
          plans={[
            {
              name: 'Solo',
              price: '$97',
              blurb: 'For the agent connecting their first tools.',
              features: ['1 seat', '3,000 workflow credits / mo', 'Every integration included'],
            },
            {
              name: 'Team',
              price: '$497',
              blurb: 'For the floor running on a shared stack.',
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
