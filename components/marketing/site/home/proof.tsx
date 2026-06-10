/**
 * Proof — the loop, shown once.
 *
 * The home page used to tell the same idea five times (core-cards, agent-
 * showcase, how-it-works, about, hero subhead). This says it once and SHOWS
 * it: Chippi scores the inbox → books the tour → keeps the pipeline current.
 * The draft beat already lives in the hero, so it isn't repeated here.
 *
 * Every mockup is built from the product's own chrome (hairline borders,
 * rounded-xl, the status-pill tones from STYLESHEET.md) so a prospect sees the
 * real thing, not a marketing diagram. No fabricated logos: integrations are
 * stated honestly in words.
 */

import { CalendarCheck, CheckCheck, ArrowUpRight, Bell } from 'lucide-react';
import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

export function Proof() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            How it works
          </p>
          <h2
            className="mt-4 text-3xl tracking-tight text-foreground sm:text-[2.5rem]"
            style={TITLE_FONT}
          >
            Watch it work.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            Connect your inbox and calendar — two minutes, no migration. From
            there, Chippi handles the busywork and waits for your tap on
            anything that goes out.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Reveal delay={0.05}>
            <ProofCard label="In the inbox" title="Knows who to call first">
              <div className="space-y-2">
                <LeadRow initials="MP" name="Maya Patel" note="new buyer · 14 Oak St" score="hot · 82" tone="text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15" highlight />
                <LeadRow initials="TR" name="Tom Reyes" note="refi question" score="warm · 64" tone="text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15" />
                <LeadRow initials="DL" name="Dana Lee" note="just browsing" score="cold · 41" tone="text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-500/15" />
              </div>
              <CardNote>Ranked against your open deals. Maya first.</CardNote>
            </ProofCard>
          </Reveal>

          <Reveal delay={0.1}>
            <ProofCard label="On the calendar" title="Books it, then logs it">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Saturday
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
                  <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">2:00 PM · Tour, 14 Oak St</p>
                    <p className="truncate text-[11px] text-muted-foreground">Maya Patel · confirmed</p>
                  </div>
                  <CheckCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                </div>
                <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  4:30 PM · open
                </div>
              </div>
              <CardNote>Booked, confirmed, and written back to the deal.</CardNote>
            </ProofCard>
          </Reveal>

          <Reveal delay={0.15}>
            <ProofCard label="In the pipeline" title="Keeps every deal current">
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                <PipelineRow Icon={ArrowUpRight} text="Maya Patel → Touring" />
                <PipelineRow Icon={CalendarCheck} text="Tour booked · 14 Oak St" />
                <PipelineRow Icon={Bell} text="Follow-up set · Tom Reyes" />
              </ul>
              <CardNote>The board reflects reality, not last week.</CardNote>
            </ProofCard>
          </Reveal>
        </div>

        {/* Honest integrations line — no fabricated brand logos. */}
        <Reveal delay={0.1}>
          <p className="mt-12 text-center text-sm text-muted-foreground">
            Connects to Gmail, Outlook, your calendar, and{' '}
            <span className="text-foreground">50+ tools</span> you already use.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ProofCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border/70 bg-card p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-snug text-foreground">
        {title}
      </h3>
      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

function CardNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function LeadRow({
  initials,
  name,
  note,
  score,
  tone,
  highlight,
}: {
  initials: string;
  name: string;
  note: string;
  score: string;
  tone: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
        highlight ? 'border-brand/30 bg-brand-subtle' : 'border-border/60 bg-muted/30'
      }`}
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{note}</p>
      </div>
      <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
        {score}
      </span>
    </div>
  );
}

function PipelineRow({ Icon, text }: { Icon: typeof Bell; text: string }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
      <span className="text-xs text-foreground/80">{text}</span>
    </li>
  );
}
