/**
 * `/company` — Chippi's founding story, on the calm site system.
 *
 * One idea: the world moved to AI; real estate didn't — so two people who'd
 * lived the gap built Chippi to close it. Mission → the gap → the founders →
 * beliefs → a calm close.
 *
 * Rebuilt off the legacy studio-ASCII version onto the calm vocabulary
 * (PageHero, Reveal, serif headlines). Auth users bounce to their workspace.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { Founders } from '@/components/marketing/company/founders';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = { title: 'Company · Chippi' };

const BELIEFS = [
  {
    title: 'Configuration is failure to decide.',
    body: 'Settings, toggles, customization layers — they’re admissions the team couldn’t pick. Picking is the work. We won’t make your day harder so our spec was easier.',
  },
  {
    title: 'Nothing leaves without your name on it.',
    body: 'Chippi drafts, books, and updates, but by default every move is yours to approve. You can grant per-task autonomy when you trust it. The default is you in the loop, and that’s where the trust lives.',
  },
  {
    title: 'Chippi has one voice.',
    body: 'Wherever Chippi shows up — a draft card, a toast, an activity row — the same signature carries through. Nothing else does. It’s how you learn to trust the agent across every surface.',
  },
  {
    title: 'No numbers we can’t defend.',
    body: 'No 10× headline. No minutes-saved-per-day claim. The day we can prove a number against your own data, we’ll quote it, and footnote it. Until then, the agent does the talking.',
  },
];

export default function CompanyPage() {
  return (
    <>
      <PageHero
        eyebrow="Our story"
        title="Real estate deserves to work the way the rest of the world already does."
        sub="We built Chippi because the tools agents and brokerages live in were drawn for a slower era. The work shouldn’t be the chrome. The work should be the deals."
      />

      {/* The gap */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            The gap
          </p>
          <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
            The work moved on. The software didn’t.
          </h2>
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              An agent’s day is mostly attention management — email, calendar, replies,
              follow-ups, pipeline updates. The actual selling, the listening and judging
              and knowing, happens in maybe ten percent of it.
            </p>
            <p>
              Everywhere else, that other ninety percent has started to run itself. In real
              estate it still doesn’t. The tools are stuck a generation behind what’s now
              possible. That distance — between what could happen and what actually does — is
              the whole reason Chippi exists.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Founders */}
      <section className="border-y border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The founders
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Built by people who know the work.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Orlando and Preston teamed up to solve the problem from both ends: the agent’s
              day and the brokerage’s floor.
            </p>
          </Reveal>
          <div className="mt-14">
            <Founders />
          </div>
        </div>
      </section>

      {/* Beliefs */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            What we believe
          </p>
          <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
            A few things we won’t move on.
          </h2>
          <ul className="mt-10 divide-y divide-border/60 border-y border-border/60">
            {BELIEFS.map((b) => (
              <li key={b.title} className="py-7">
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{b.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Close */}
      <section className="bg-background px-4 pb-24 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Come see what your day looks like with Chippi.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Bring your inbox and let Chippi do the rest.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">7 days free, then $97/mo. Cancel anytime.</p>
        </Reveal>
      </section>
    </>
  );
}
