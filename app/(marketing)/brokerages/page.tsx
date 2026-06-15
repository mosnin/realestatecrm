/**
 * `/brokerages` — the floor story, dark redesign (styled placeholder).
 *
 * The nav's "Brokerages" target. Hero + a three-up feature section in the
 * reference aesthetic; full content lands later. Copy is Chippi/real-estate:
 * one AI cowork for the whole floor — leads routed, performance visible,
 * every send approval-first.
 */

import { SubPageHero, SubPageFeatures, type SubFeature } from '@/components/marketing/giga/sub-page';

export const metadata = {
  title: 'For brokerages · Chippi',
  description:
    'Give every agent on the floor a Chippi — leads routed to the right agent, approval-first drafts, and a live floor view with role-based controls and an audit log.',
};

const FEATURES: SubFeature[] = [
  {
    icon: 'ArrowRightLeft',
    title: 'Routing on arrival',
    desc: 'Auto-assign by territory and load, or hand-pick the agent and write the brief. Every assignment is logged with the reason.',
  },
  {
    icon: 'Users',
    title: 'The floor on one screen',
    desc: 'Deals active, drafts pending, follow-ups due — per agent, read live from the work itself, not a status meeting.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Role-based control',
    desc: 'Three roles, no permissions maze. Chippi drafts; every send goes through the agent, and the audit log keeps it honest.',
  },
];

export default function BrokeragesPage() {
  return (
    <>
      <SubPageHero
        eyebrow="For brokerages"
        title="One agent for the whole floor."
        titleTail="A Chippi behind every desk."
        sub="Leads routed, performance visible, bottlenecks surfaced — every agent gets a teammate, and you get a live view of the floor without another status meeting."
        image="/marketing/product/brokerages.jpg"
      />
      <SubPageFeatures
        eyebrow="Built for the floor"
        title={
          <>
            Scale from one desk to
            <br className="hidden sm:block" /> hundreds, without the maze.
          </>
        }
        features={FEATURES}
      />
    </>
  );
}
