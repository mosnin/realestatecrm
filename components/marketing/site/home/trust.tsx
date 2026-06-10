/**
 * Trust — the one belief that closes a realtor's deepest fear.
 *
 * Replaces the fabricated testimonials (which shipped "Realtor name · Agent ·
 * City" with five hardcoded stars). Fake social proof poisons every other
 * claim on the page, so it's gone. In its place: the single promise that
 * actually earns trust — you are in control of every send — stated plainly in
 * the product's serif, then two supporting beliefs on the paper-flat grid.
 */

import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

export function Trust() {
  return (
    <section className="border-y border-border/60 bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Why Chippi
          </p>
          <h2
            className="mx-auto mt-4 max-w-2xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]"
            style={TITLE_FONT}
          >
            Nothing leaves without your name on it.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Chippi drafts, scores, books, and updates — but by default every
            move is yours to approve. The work runs itself; the decisions stay
            yours. That&rsquo;s where the trust lives.
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="mx-auto mt-14 max-w-3xl">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2">
          <Belief
            title="One workspace, not six tools"
            body="CRM, inbox, calendar, and the pipeline — one agent runs all of it, and they finally agree."
          />
          <Belief
            title="Calm by design"
            body="No settings maze to operate. Chippi surfaces the one thing to handle next and gets out of the way."
          />
        </div>
      </Reveal>
    </section>
  );
}

function Belief({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-background px-6 py-7 text-left">
      <h3 className="text-[17px] font-semibold leading-snug text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
