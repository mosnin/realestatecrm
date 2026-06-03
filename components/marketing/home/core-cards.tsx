'use client';

/**
 * CoreCards — the five things Chippi does, as a Chippi-skinned MagicUI bento.
 * Each card's background is its own abstract animation (pure geometry, one
 * scarce brand-orange accent) — the idea made *felt*, not a literal UI mock.
 * The animation lives in the top of the card and fades into the surface so the
 * icon + title + description stay clean. Section heading is serif Times.
 */

import { Mail, PenLine, Target, CalendarCheck, KanbanSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Reveal } from './home-kit';
import { InboxTriageAnimation } from './animations/inbox-triage-animation';
import { VoiceDraftAnimation } from './animations/voice-draft-animation';
import { LeadScoreAnimation } from './animations/lead-score-animation';
import { TourBookingAnimation } from './animations/tour-booking-animation';
import { PipelineFlowAnimation } from './animations/pipeline-flow-animation';

/** Hosts an abstraction in the top of a bento card and fades it into the
 *  surface so the title/description below stay legible. */
function AnimCanvas({
  children,
  tint = false,
}: {
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <div className="absolute inset-0">
      {tint && (
        <div aria-hidden className="absolute inset-0 bg-brand-subtle/40" />
      )}
      <div className={cn('absolute inset-x-4 top-4 bottom-[44%]')}>{children}</div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-card via-card/80 to-transparent"
      />
    </div>
  );
}

export function CoreCards() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <Reveal className="max-w-3xl">
        <h2 className="text-[clamp(2.25rem,4.8vw,4rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground">
          The work that used to eat your day,
          <span className="text-muted-foreground"> handled before you ask.</span>
        </h2>
      </Reveal>

      <BentoGrid className="mt-12">
        <BentoCard
          name="Reads your inbox, surfaces what matters"
          description="Gmail and Outlook plug in. Chippi reads every inbound, weighs it against your live deals, and quietly lifts the one to look at first."
          Icon={Mail}
          href="/features/communication"
          cta="See the inbox"
          className="col-span-3 md:col-span-2"
          background={
            <AnimCanvas>
              <InboxTriageAnimation className="h-full w-full" />
            </AnimCanvas>
          }
        />

        <BentoCard
          name="Drafts in your voice"
          description="Every reply written before you open the thread. Read it, edit it, send it — or don't."
          Icon={PenLine}
          href="/features/chippi"
          cta="Meet Chippi"
          className="col-span-3 md:col-span-1"
          background={
            <AnimCanvas tint>
              <VoiceDraftAnimation className="h-full w-full" />
            </AnimCanvas>
          }
        />

        <BentoCard
          name="Knows who to call first"
          description="Every lead scored against your deals, the hottest one rising out of the noise — so your morning starts with the right call."
          Icon={Target}
          href="/features/people"
          cta="See people"
          className="col-span-3 md:col-span-1"
          background={
            <AnimCanvas>
              <LeadScoreAnimation className="h-full w-full" />
            </AnimCanvas>
          }
        />

        <BentoCard
          name="Books the tour"
          description="Reply with a time; Chippi puts it on every calendar and writes it back to the deal."
          Icon={CalendarCheck}
          href="/features/calendar"
          cta="See the calendar"
          className="col-span-3 md:col-span-1"
          background={
            <AnimCanvas>
              <TourBookingAnimation className="h-full w-full" />
            </AnimCanvas>
          }
        />

        <BentoCard
          name="Keeps the pipeline honest"
          description="Move a card; the value, the dates, the counterparty all stay in sync. The board reflects reality, not last week."
          Icon={KanbanSquare}
          href="/features/deals"
          cta="See the pipeline"
          className="col-span-3 md:col-span-1"
          background={
            <AnimCanvas>
              <PipelineFlowAnimation className="h-full w-full" />
            </AnimCanvas>
          }
        />
      </BentoGrid>
    </section>
  );
}
