'use client';

/**
 * CoreCards — the four things Chippi does, as a Chippi-skinned MagicUI bento.
 *
 * Each card carries a composed "canvas": an app-window-framed media slot that
 * bleeds off the top-right edge (KAIRO/VPN card energy) plus a couple of real
 * UI accents (a Chippi draft pill, a lead-tier dot) built from our tokens — so
 * the cards read as the product, not stock art. The framed area itself is a
 * <Placeholder> to be swapped with real screenshots. Section heading is serif
 * Times (the brand flourish); card titles stay sans (scarcity).
 */

import { Mail, PenLine, CalendarCheck, KanbanSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Reveal, Placeholder } from './home-kit';

/** App-window-framed media slot, bleeding off the top so it reads as a live
 *  surface cropped by the card. Fades into the card so the title sits clean. */
function CardCanvas({
  label,
  tint = false,
  accent,
}: {
  label: string;
  tint?: boolean;
  accent?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0">
      {tint && <div className="absolute inset-0 bg-brand-subtle/60" aria-hidden />}
      <div className="absolute -right-8 left-6 top-6 overflow-hidden rounded-2xl bg-background ring-1 ring-border/70 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]">
        <div className="flex h-8 items-center gap-1.5 border-b border-border/60 px-3.5">
          <span className="h-2 w-2 rounded-full bg-foreground/15" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-foreground/15" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-foreground/15" aria-hidden />
        </div>
        <Placeholder label={label} aspect="aspect-[16/8]" className="rounded-none ring-0" />
      </div>
      {accent}
      {/* fade into the card so the title/desc stay legible */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-card via-card/85 to-transparent" />
    </div>
  );
}

/** A small Chippi draft pill — the agent's orange+chip signature, the one
 *  branded accent allowed here. */
function DraftPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-[10px] font-medium text-brand ring-1 ring-brand/20',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
      Chippi · draft ready
    </span>
  );
}

export function CoreCards() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <Reveal className="max-w-3xl">
        <h2
          style={{ fontFamily: 'var(--font-title)' }}
          className="text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.04] tracking-[-0.02em] text-foreground"
        >
          The work that used to eat your day,
          <span className="text-muted-foreground"> handled before you ask.</span>
        </h2>
      </Reveal>

      <BentoGrid className="mt-12">
        <BentoCard
          name="Reads your inbox, surfaces what matters"
          description="Gmail and Outlook plug in. Chippi reads every inbound, scores it against your live deals, and tells you who to call first."
          Icon={Mail}
          href="/features/communication"
          cta="See the inbox"
          className="col-span-3 md:col-span-2"
          background={
            <CardCanvas
              label="Inbox triage"
              accent={<DraftPill className="right-2 top-12" />}
            />
          }
        />

        <BentoCard
          name="Drafts in your voice"
          description="Every reply written before you open the thread. Read it, edit it, send it — or don't. Nothing leaves without your tap."
          Icon={PenLine}
          href="/features/chippi"
          cta="Meet Chippi"
          className="col-span-3 md:col-span-1"
          background={<CardCanvas label="Chippi draft" tint accent={<DraftPill className="right-2 top-12" />} />}
        />

        <BentoCard
          name="Books the tour"
          description="Reply with a time; Chippi puts it on every calendar and writes it back to the deal. No tab-switching."
          Icon={CalendarCheck}
          href="/features/calendar"
          cta="See the calendar"
          className="col-span-3 md:col-span-1"
          background={<CardCanvas label="Tour booking" />}
        />

        <BentoCard
          name="Keeps the pipeline honest"
          description="Move a card; Chippi keeps the value, the dates, and the counterparty in sync everywhere. The board reflects reality, not last week."
          Icon={KanbanSquare}
          href="/features/deals"
          cta="See the pipeline"
          className="col-span-3 md:col-span-2"
          background={
            <CardCanvas
              label="Pipeline board"
              accent={
                <span className="absolute right-2 top-12 inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-[10px] font-medium text-foreground/70 ring-1 ring-border/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-lead-hot" aria-hidden /> Closing won
                </span>
              }
            />
          }
        />
      </BentoGrid>
    </section>
  );
}
