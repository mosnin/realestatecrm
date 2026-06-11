/**
 * Features — the loop as editorial rows.
 *
 * Three alternating sections (text one side, a framed product screenshot the
 * other, flipping each row) that walk the real loop: triage → draft → book +
 * update. This is the antidote to the "three identical cards" shape — each row
 * has room to breathe, a numbered eyebrow, real capability bullets, and a
 * LIVE product panel (animate-on-scroll) in a browser frame — no placeholders.
 */

import { Check } from 'lucide-react';
import { Reveal } from '../reveal';
import { PanelFrame } from '../frame';
import { InboxPanel, DraftPanel, CalendarPanel } from './live-panels';

interface Feature {
  no: string;
  eyebrow: string;
  slug: string;
  title: string;
  body: string;
  bullets: string[];
}

const PANELS: Record<string, React.ReactNode> = {
  inbox: <InboxPanel />,
  reply: <DraftPanel />,
  pipeline: <CalendarPanel />,
};

const features: Feature[] = [
  {
    no: '01',
    eyebrow: 'In the inbox',
    slug: 'inbox',
    title: 'It reads every inbound, and knows who to call first.',
    body: 'Chippi watches Gmail and Outlook, weighs each message against your live deals, and lifts the one that matters to the top — so your morning starts with the right call, not the loudest one.',
    bullets: [
      'Every lead scored the moment it lands',
      'The hottest deal surfaced out of the noise',
      'Nothing slips, even while you’re showing houses',
    ],
  },
  {
    no: '02',
    eyebrow: 'The reply',
    slug: 'reply',
    title: 'It drafts the reply — in your voice — before you open the thread.',
    body: 'Every response is written and waiting, learned from how you actually reply. Read it, tweak it, send it. Or don’t. By default nothing leaves without your tap.',
    bullets: [
      'Drafts that read like you wrote them',
      'Trained on your real tone and phrasing',
      'Edit, send, or skip — the decision stays yours',
    ],
  },
  {
    no: '03',
    eyebrow: 'Calendar & pipeline',
    slug: 'pipeline',
    title: 'It books the tour, then keeps the whole pipeline current.',
    body: 'Reply with a time and Chippi checks your calendar, books it, sends the confirmation, and writes it back to the deal. The board reflects reality — not last week.',
    bullets: [
      'Tours land on your calendar automatically',
      'Confirmations sent and logged for you',
      'Deals advance themselves as things happen',
    ],
  },
];

export function Features() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl space-y-24 sm:space-y-32">
        {features.map((f, i) => {
          const reverse = i % 2 === 1;
          return (
            <div
              key={f.no}
              className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              {/* copy */}
              <Reveal from={reverse ? 'right' : 'left'} className={reverse ? 'lg:order-2' : ''}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-brand">{f.no}</span>
                  <span className="h-px w-8 bg-border" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {f.eyebrow}
                  </span>
                </div>
                <h2 className="mt-5 text-[26px] leading-[1.18] tracking-tight text-foreground sm:text-[32px]" style={{ fontFamily: "var(--font-title)" }}>
                  {f.title}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm text-foreground/85">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-subtle">
                        <Check className="h-3 w-3 text-brand" />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* live panel — Chippi working, not a placeholder */}
              <Reveal from={reverse ? 'left' : 'right'} className={reverse ? 'lg:order-1' : ''}>
                <PanelFrame>
                  {PANELS[f.slug]}
                </PanelFrame>
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
