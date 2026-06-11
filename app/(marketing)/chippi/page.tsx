/**
 * `/chippi` — Meet Chippi. The scroll-morph hero (all your leads in one
 * place — headshot placeholder tiles orbiting, morphing into an arc as you
 * scroll) → what Chippi is in three lines → where it works (links into the
 * product pages) → the ask.
 */

import Link from 'next/link';
import { ArrowRight, MessageCircle, PenLine, KanbanSquare, Megaphone } from 'lucide-react';
import IntroAnimation from '@/components/ui/scroll-morph-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { PointerHighlight } from '@/components/marketing/site/pointer-highlight';
import FeaturesTailark from '@/components/ui/features-tailark';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Meet Chippi',
  description:
    'Chippi is the agent inside your CRM — it reads your inbox, scores every lead, drafts in your voice, and keeps every deal current. All your leads in one place, worked while you close.',
};

const SURFACES = [
  { Icon: PenLine, title: 'In your inbox', body: 'Reads every inbound, drafts the reply in your voice, never sends without your tap.', href: '/realtors' },
  { Icon: KanbanSquare, title: 'On your pipeline', body: 'Advances deals as things happen and logs every outcome in plain language.', href: '/deals' },
  { Icon: Megaphone, title: 'In your marketing', body: 'Drafts the just-listed post, the story, and the email — formatted for every channel.', href: '/studio' },
];

export default function MeetChippiPage() {
  return (
    <>
      {/* Scroll-morph hero — needs a tall stage; the nav floats above. */}
      <section className="relative h-[760px] w-full overflow-hidden border-b border-border/60 pt-16 sm:h-[820px]">
        <IntroAnimation />
      </section>

      {/* What Chippi is */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <MessageCircle className="h-5 w-5" />
          </span>
          <h2 style={TITLE_FONT} className="mx-auto mt-5 max-w-2xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Not another tool. A{' '}
            <PointerHighlight>
              <span>teammate</span>
            </PointerHighlight>
            .
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Chippi lives inside your CRM and does the work between the closings — reading,
            scoring, drafting, booking, updating — and brings you the decisions, not the busywork.
            Approval-first by default; nothing leaves without your name on it.
          </p>
        </Reveal>
      </section>

      {/* A teammate in every part of the day — soft feature cards */}
      <section className="border-t border-border/60 bg-background">
        <FeaturesTailark />
      </section>

      {/* Where it works */}
      <section className="bg-background px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 md:grid-cols-3">
            {SURFACES.map((s) => (
              <Reveal key={s.title}>
                <Link href={s.href} className="group block h-full bg-background p-7 transition-colors hover:bg-foreground/[0.02]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold leading-snug text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    See it work
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Put Chippi on your book.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your inbox and it starts working the leads today.
          </p>
          <div className="mt-8">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
