/**
 * BreadthBand, the "more than the inbox" beat: breadth should read as an
 * lead conversion teammate, not another inbox. Four capabilities tied to real
 * tool in the live registry (lib/ai-tools/tools), framed honestly:
 *
 * - Deep work: delegate_task spawns a focused sub-agent run with live
 *   progress (delegate-task.ts).
 * - Tours: check_availability + propose_tour_times + schedule_tour book
 *   against the realtor's real calendar (and reschedule / cancel).
 * - Pipeline: find_stuck_deals + find_quiet_hot_persons + find_overdue_
 *   followups + pipeline_summary surface what's slipping.
 * - Recall: recall_history pulls up the logged calls, meetings, and notes
 *   on a contact on demand.
 *
 * White open grid, two-tone headline.
 */

import { Activity, CalendarCheck, History, Telescope } from 'lucide-react';
import { TwoTone } from './two-tone';
import { EyebrowChip, FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

const CELLS = [
  {
    icon: Telescope,
    title: 'Deep work on demand.',
    body: 'Hand Chippi a bigger job and it spins up a focused work session, streaming progress while it digs.',
  },
  {
    icon: CalendarCheck,
    title: 'Books against your calendar.',
    body: 'Chippi checks your real availability, proposes tour times, and books them. Reschedules and cancels too.',
  },
  {
    icon: Activity,
    title: 'Watches your pipeline.',
    body: 'Stalled deals, hot leads gone quiet, follow-ups overdue. Chippi surfaces what is slipping before you look.',
  },
  {
    icon: History,
    title: 'Total recall.',
    body: 'Ask about anyone and Chippi pulls up every logged call, meeting, and note you have on them in seconds.',
  },
];

export function BreadthBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <FadeUp className="mx-auto max-w-2xl text-center">
        <EyebrowChip className="justify-center">Beyond the inbox</EyebrowChip>
        <h2 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-5xl">
          <TwoTone parts={[{ t: 'More than' }, { t: 'another inbox.', dim: true }, { t: 'A teammate' }, { t: 'for the whole lead journey.', dim: true }]} />
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
          The inbox loop is where it starts. Chippi runs across your whole day,
          booking tours, watching the pipeline, recalling every detail you logged.
        </p>
      </FadeUp>

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        {CELLS.map((c) => (
          <StaggerItem key={c.title} className="h-full">
            <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                <c.icon className="h-4 w-4 text-[#ff4b29]" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950">{c.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-neutral-500">{c.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
