/**
 * `/brokerages` — the floor story. Server component (exports metadata); the
 * SubHero is a client component, so its icons are passed by registry name.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';

export const metadata = {
  title: 'For brokerages · Chippi',
  description:
    'Give every agent on the floor a Chippi — leads routed to the right agent, approval-first drafts, and a live floor view with role-based controls and an audit log.',
};

export default function BrokeragesPage() {
  return (
    <SubHero
      label="Brokerage Dashboard"
      labelIcon="Building2"
      headline={
        <>
          One agent behind
          <br className="hidden sm:block" /> every desk on the floor.
        </>
      }
      description="Give every agent a Chippi — leads routed, performance visible, and every send approval-first, from a solo desk to hundreds of agents."
      features={[
        { icon: 'ArrowRightLeft', title: 'Routing on arrival', desc: 'Leads auto-assigned by territory and load, logged with the reason.' },
        { icon: 'Users', title: 'The floor, live', desc: 'Deals, drafts, and follow-ups per agent in real time.' },
        { icon: 'ShieldCheck', title: 'Approval-first', desc: 'Every send reviewed, every action on the audit log.' },
      ]}
      workflow="Seller inquiry"
    />
  );
}
