/**
 * Bento — the breadth, without the repetition.
 *
 * A mixed-size grid for the capabilities that don't need a full feature row:
 * ask-anything, voice, model routing, the content studio, and the team view.
 * One live mockup (ask-anything, in the product's own chrome) anchors the
 * grid; one labeled screenshot slot sits in the studio card; the rest are
 * icon + copy. Varied spans keep it from reading as another card row.
 */

import { MessageCircle, PenLine, Layers, Megaphone, Users, CheckCheck } from 'lucide-react';
import { Reveal } from '../reveal';
import { StudioCard } from './more-panels';
import { TITLE_FONT } from '@/lib/typography';

export function Bento() {
  return (
    <section className="border-y border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            More than email
          </p>
          <h2
            className="mt-4 text-3xl tracking-tight text-foreground sm:text-[2.5rem]"
            style={TITLE_FONT}
          >
            One agent. The whole job.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {/* Ask anything — big, with a live mockup */}
          <Reveal className="lg:col-span-4">
            <Card className="h-full">
              <CardHead Icon={MessageCircle} label="Ask anything" />
              <h3 className="mt-3 text-[19px] font-semibold leading-snug text-foreground">
                It knows your whole book.
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Every deal, every thread, every tour. Ask in plain language and the answer
                comes back with names and numbers, not a shrug.
              </p>
              <div className="mt-5 rounded-xl border border-border/60 bg-background p-3">
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-[9px] font-bold text-brand-foreground">C</span>
                  <span className="text-xs text-foreground/70">which buyers should I call today?</span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <AnswerRow name="Maya Patel" detail="hot · tour Saturday — confirm the time" />
                  <AnswerRow name="Tom Reyes" detail="refi, quiet 4 days — nudge him" />
                </div>
              </div>
            </Card>
          </Reveal>

          {/* Voice */}
          <Reveal delay={0.05} className="lg:col-span-2">
            <Card className="h-full">
              <CardHead Icon={PenLine} label="Your voice" />
              <h3 className="mt-3 text-[17px] font-semibold leading-snug text-foreground">
                Drafts that sound like you.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Learned from how you actually write — not a generic template.
              </p>
            </Card>
          </Reveal>

          {/* Models */}
          <Reveal delay={0.05} className="lg:col-span-2">
            <Card className="h-full">
              <CardHead Icon={Layers} label="Every model" />
              <h3 className="mt-3 text-[17px] font-semibold leading-snug text-foreground">
                Routed automatically.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Each job goes to the model that does it best. You never pick one.
              </p>
            </Card>
          </Reveal>

          {/* Content studio — image slot */}
          <Reveal delay={0.1} className="lg:col-span-2">
            <Card className="h-full overflow-hidden p-0">
              <div className="p-6">
                <CardHead Icon={Megaphone} label="Content studio" />
                <h3 className="mt-3 text-[17px] font-semibold leading-snug text-foreground">
                  Listings &amp; posts, drafted.
                </h3>
              </div>
              <StudioCard />
            </Card>
          </Reveal>

          {/* Team */}
          <Reveal delay={0.1} className="lg:col-span-2">
            <Card className="h-full">
              <CardHead Icon={Users} label="For teams" />
              <h3 className="mt-3 text-[17px] font-semibold leading-snug text-foreground">
                The whole floor, at a glance.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Brokers see performance and bottlenecks; every agent gets a teammate.
              </p>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/70 bg-card p-6 ${className}`}>{children}</div>
  );
}

function CardHead({ Icon, label }: { Icon: typeof Users; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function AnswerRow({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />
      <p className="text-xs leading-relaxed text-foreground/80">
        <span className="font-medium text-foreground">{name}</span> — {detail}
      </p>
    </div>
  );
}
