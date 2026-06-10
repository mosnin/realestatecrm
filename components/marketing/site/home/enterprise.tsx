/**
 * Enterprise — the trust band that says "safe to run your business on."
 *
 * Built on real, code-backed differentiators (approval gating, audit logging,
 * broker/realtor isolation, data ownership) rather than invented compliance
 * claims. The badge row is a labeled slot for certification logos the owner
 * adds when they're earned — we don't stamp SOC 2 / GDPR badges we can't back.
 */

import { ShieldCheck, ScrollText, KeyRound, Database } from 'lucide-react';
import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

const pillars = [
  {
    Icon: ShieldCheck,
    title: 'Approval-first by default',
    body: 'Chippi drafts and proposes; nothing sends, books, or changes without your tap. Control isn’t a setting — it’s the default.',
  },
  {
    Icon: ScrollText,
    title: 'A complete audit trail',
    body: 'Every action Chippi takes is logged and attributable. You can always see what happened, and when.',
  },
  {
    Icon: KeyRound,
    title: 'Role-aware access',
    body: 'Brokers see the floor; agents see their own book. The wall between them is enforced, not assumed.',
  },
  {
    Icon: Database,
    title: 'Your data stays yours',
    body: 'Your inbox, contacts, and deals belong to you. Export anytime — we don’t sell your book or train on it.',
  },
];

export function Enterprise() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Enterprise-ready
          </p>
          <h2
            className="mt-4 text-3xl tracking-tight text-foreground sm:text-[2.5rem]"
            style={TITLE_FONT}
          >
            Built for teams that can’t afford mistakes.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            An agent touching your inbox and your clients has to be safe by
            construction. Chippi is — control, visibility, and ownership are the
            defaults, not add-ons.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 sm:grid-cols-2">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.05}>
              <div className="h-full bg-background p-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
                  <p.Icon className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold leading-snug text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* compliance badge slots — fill with certification logos when earned */}
        <Reveal delay={0.1}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {['Badge', 'Badge', 'Badge'].map((label, i) => (
              <div
                key={i}
                className="flex h-16 w-32 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
