/**
 * `/agents`, the solo-agent story. Server component (exports metadata); the
 * SubHero is a client component, so its icons are passed by registry name to
 * stay on the right side of the server→client boundary.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';

export const metadata = {
  title: 'For agents · Chippi',
  description:
    'Chippi works your book while you close, reading the inbox, drafting replies in your voice, and booking tours against your real calendar. Nothing sends without your tap.',
};

export default function AgentsPage() {
  return (
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
      workflow="New buyer lead"
    />
  );
}
