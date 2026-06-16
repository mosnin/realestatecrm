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
    'Chippi works your book while you close: reading the inbox, drafting replies in your voice, and booking tours against your real calendar. Nothing sends without your tap.',
};

export default function AgentsPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="Real Estate OS"
          labelIcon="LayoutGrid"
          headline={
            <>
              Your whole book, worked
              <br className="hidden sm:block" /> while you close.
            </>
          }
          description="Chippi reads every lead, drafts in your voice, books the tour, and keeps the deal current, so your hours go to closing, not admin."
          features={[
            { icon: 'MessagesSquare', title: 'Drafts in your voice', desc: 'Every reply written and waiting before you open the thread.' },
            { icon: 'KanbanSquare', title: 'Know who to call first', desc: 'Leads scored against your live pipeline and ranked by intent.' },
            { icon: 'CalendarCheck', title: 'Tours book themselves', desc: 'Approve a time; the calendar, thread, and deal all update.' },
          ]}
          image="/marketing/agents-hero.jpg"
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
