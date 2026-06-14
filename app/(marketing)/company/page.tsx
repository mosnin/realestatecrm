/**
 * `/company`, Chippi's founding story, on the bold-canvas system.
 *
 * One idea: the world moved to AI; real estate didn't, so two people who'd
 * lived the gap built Chippi to close it. Mission → the gap → the founders →
 * beliefs → a close.
 *
 * PageHero opener, story paragraphs in an open white section, beliefs as a
 * 2×2 grid of white soft-shadow cards, founder cards, vermillion closing CTA.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FadeUp, EyebrowChip } from '@/components/marketing/site/section';
import { Founders } from '@/components/marketing/company/founders';

export const metadata = { title: 'Company · Chippi' };

const BELIEFS = [
  {
    title: 'Configuration is failure to decide.',
    body: 'Settings, toggles, customization layers, they’re admissions the team couldn’t pick. Picking is the work. We won’t make your day harder so our spec was easier.',
  },
  {
    title: 'Nothing leaves without your name on it.',
    body: 'Chippi drafts, books, and updates, but by default every move is yours to approve. You can grant per-task autonomy when you trust it. The default is you in the loop, and that’s where the trust lives.',
  },
  {
    title: 'Chippi has one voice.',
    body: 'Wherever Chippi shows up, a draft card, a toast, an activity row, the same signature carries through. Nothing else does. It’s how you learn to trust the agent across every surface.',
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

      {/* The gap, open white */}
      <section className="px-4 pt-6 sm:px-6 sm:pt-10">
        <FadeUp className="mx-auto max-w-3xl">
          <EyebrowChip>The gap</EyebrowChip>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            The work moved on. The software didn’t.
          </h2>
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-neutral-600">
            <p>
              An agent’s day is mostly attention management, email, calendar, replies,
              follow-ups, pipeline updates. The actual selling, the listening and judging
              and knowing, happens in maybe ten percent of it.
            </p>
            <p>
              Everywhere else, that other ninety percent has started to run itself. In real
              estate it still doesn’t. The tools are stuck a generation behind what’s now
              possible. That distance, between what could happen and what actually does, is
              the whole reason Chippi exists.
            </p>
          </div>
        </FadeUp>
      </section>

      {/* Founders */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="mx-auto max-w-3xl text-center">
            <EyebrowChip className="justify-center">The founders</EyebrowChip>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Built by people who know the work.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Orlando and Preston teamed up to solve the problem from both ends: the agent’s
              day and the brokerage’s floor.
            </p>
          </FadeUp>
          <div className="mt-14">
            <Founders />
          </div>
        </div>
      </section>

      {/* Beliefs, 2×2 white soft-shadow cards */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <FadeUp className="mx-auto max-w-3xl text-center">
            <EyebrowChip className="justify-center">What we believe</EyebrowChip>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              A few things we won’t move on.
            </h2>
          </FadeUp>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {BELIEFS.map((b, i) => (
              <FadeUp key={b.title} delay={i * 0.05}>
                <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-950">
                    {b.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-600">{b.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="mt-24 px-4 pb-24 sm:mt-32 sm:px-6 sm:pb-32">
        <FadeUp className="mx-auto max-w-3xl text-center">
          <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-4xl">
            Come see what your day looks like with Chippi.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            Bring your inbox and let Chippi do the rest.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-7 text-[15px] font-semibold text-zinc-950 transition-colors duration-150 hover:bg-black/[0.04]"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-neutral-500">7 days free, then $97/mo. Cancel anytime.</p>
        </FadeUp>
      </section>
    </>
  );
}
