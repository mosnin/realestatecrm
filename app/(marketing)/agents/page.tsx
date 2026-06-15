/**
 * `/agents` — the solo-agent story, dark redesign (styled placeholder).
 *
 * The nav's "Agents" target. Hero + a three-up feature section in the
 * reference aesthetic; full content lands later. Copy is Chippi/real-estate:
 * the AI cowork that works an agent's book while they close.
 */

import { MessagesSquare, CalendarCheck, KanbanSquare } from 'lucide-react';
import { SubPageHero, SubPageFeatures } from '@/components/marketing/giga/sub-page';

export const metadata = {
  title: 'For agents · Chippi',
  description:
    'Chippi works your book while you close — reading the inbox, drafting replies in your voice, and booking tours against your real calendar. Nothing sends without your tap.',
};

const FEATURES = [
  {
    icon: MessagesSquare,
    title: 'Drafts in your voice',
    desc: 'Every reply written and waiting before you open the thread, the way you actually write. Edit it, send it, or skip it.',
  },
  {
    icon: KanbanSquare,
    title: 'Know who to call first',
    desc: 'Leads scored against your live deals and ranked by intent, so the next best move is always at the top of the list.',
  },
  {
    icon: CalendarCheck,
    title: 'Tours book themselves',
    desc: 'Approve a time and the calendar, the thread, and the deal all update — every action written down in plain language.',
  },
];

export default function AgentsPage() {
  return (
    <>
      <SubPageHero
        eyebrow="For agents"
        title="Your extra teammate in the field."
        titleTail="Working your book while you close."
        sub="Drafts in your voice, leads scored, tours booked — from your phone, between showings. Chippi handles the busywork so your hours go to closing."
        image="/marketing/product/realtors.jpg"
      />
      <SubPageFeatures
        eyebrow="The follow-up loop"
        title={
          <>
            Read, draft, book — on
            <br className="hidden sm:block" /> repeat, around the clock.
          </>
        }
        features={FEATURES}
      />
    </>
  );
}
