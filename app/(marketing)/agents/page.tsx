/**
 * `/agents`, the solo-agent story. Server component (exports metadata). The
 * cinematic hero + showcases live in a forced-dark wrapper (they're built for a
 * dark canvas); the closing CTA stays light/dark-adaptive like the home page.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import { AgentInboxShowcase, AgentPipelineShowcase } from '@/components/marketing/giga/agents-showcases';
import { ContentShowcase } from '@/components/marketing/giga/content-showcase';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';

export const metadata = {
  title: 'For agents · Chippi',
  description:
    'Turn more real estate inquiries into booked tours without living in your inbox. Chippi reads, ranks, drafts, books, and keeps your CRM current.',
};

export default function AgentsPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="For individual agents"
          labelIcon="LayoutGrid"
          headline={
            <>
              Turn more inquiries into booked tours.
              <br className="hidden sm:block" /> Keep your day for clients.
            </>
          }
          description="Chippi reads every inquiry and ranks who is ready. It drafts in your voice, books from your calendar, and keeps the CRM current."
          features={[
            { icon: 'MessagesSquare', title: 'Never miss the first move', desc: 'Every new inquiry is read and a reply is prepared in your voice.' },
            { icon: 'KanbanSquare', title: 'Call the right lead next', desc: 'Chippi ranks intent and shows the reasons behind each score.' },
            { icon: 'CalendarCheck', title: 'End calendar ping pong', desc: 'Tours book from your real availability and update the deal.' },
          ]}
          image="/marketing/agents-hero.jpg"
          variant="inbox"
          mockupSrc="/marketing/hero/agents-dashboard.svg"
          mockupAlt="The Chippi agent dashboard — inbox, pipeline, and tours"
        />
        <AgentInboxShowcase />
        <ContentShowcase />
        <AgentPipelineShowcase />
        <PricingTeaser
          headline={
            <>
              Simple pricing,
              <br className="hidden sm:block" /> built for one agent.
            </>
          }
          plans={[
            {
              name: 'Solo',
              price: '$97',
              blurb: 'For the agent getting started with Chippi.',
              features: ['1 seat', '3,000 workflow credits / mo', 'Every Chippi feature'],
            },
            {
              name: 'Pro Performer',
              price: '$197',
              blurb: 'For the producer running at full speed.',
              features: ['1 seat', '8,000 workflow credits / mo', 'Priority support'],
              featured: true,
            },
          ]}
        />
      </div>
      <CtaSection />
    </>
  );
}
