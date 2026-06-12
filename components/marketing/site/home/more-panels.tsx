'use client';

/**
 * More live panels, the brokerage feature rows, the two extra realtor rows
 * (inbox triage + the pipeline board), and the content-studio bento card.
 * Same animate-on-scroll vocabulary as live-panels.tsx; shared <Panel> wrapper
 * provides the in-view flag + the frame height. Reduced-motion: composed, still.
 */

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { GitBranch, ArrowRight, Trophy, MessageCircle, ShieldCheck, PenLine, ArrowUp } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

const PANEL = 'h-[300px] bg-background p-4 sm:h-[340px] sm:p-5';

function Panel({ children }: { children: (lit: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className={PANEL}>
      {children(Boolean(reduce) || inView)}
    </div>
  );
}

function Row({ lit, i, children, className = '' }: { lit: boolean; i: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={lit ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 * i }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Brokerage: lead routing ───────────────────────────────────────────────── */

export function RoutingPanel() {
  return (
    <Panel>
      {(lit) => (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lead routing</p>
          <Row lit={lit} i={0} className="mt-3 flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
            <GitBranch className="h-4 w-4 flex-shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">New buyer · 14 Oak St</p>
              <p className="truncate text-[11px] text-muted-foreground">luxury · $1.2M · downtown</p>
            </div>
          </Row>
          <motion.div
            initial={{ opacity: 0 }}
            animate={lit ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="my-2 flex justify-center text-muted-foreground"
          >
            <ArrowRight className="h-4 w-4 rotate-90" />
          </motion.div>
          <Row lit={lit} i={6} className="flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-subtle px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">SK</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">Routed to Sam Kim</p>
              <p className="truncate text-[11px] text-muted-foreground">downtown luxury · has room (2 open)</p>
            </div>
          </Row>
          <p className="mt-3 text-[11px] text-muted-foreground"><span className="font-medium text-brand">Chippi</span> matched the territory and logged it.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Brokerage: performance leaderboard ────────────────────────────────────── */

export function LeaderboardPanel() {
  const agents = [
    { name: 'Sam Kim', deals: 9, pct: 92 },
    { name: 'Ava Brooks', deals: 7, pct: 71 },
    { name: 'Leo Marsh', deals: 5, pct: 54 },
  ];
  return (
    <Panel>
      {(lit) => (
        <>
          <div className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-brand" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">This week · the floor</p>
          </div>
          <div className="mt-3 space-y-2.5">
            {agents.map((a, i) => (
              <Row key={a.name} lit={lit} i={i}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{a.name}</span>
                  <span className="tabular-nums text-muted-foreground">{a.deals} closing</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    initial={{ width: 0 }}
                    animate={lit ? { width: `${a.pct}%` } : {}}
                    transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 + 0.12 * i }}
                  />
                </div>
              </Row>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Pulled from real activity, not a status meeting.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Brokerage: team chat ──────────────────────────────────────────────────── */

export function TeamChatPanel() {
  return (
    <Panel>
      {(lit) => (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"># 14-oak-st</p>
          <div className="mt-3 space-y-2.5">
            <Row lit={lit} i={0} className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-medium text-foreground/70">AB</span>
              <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-3 py-1.5 text-xs leading-relaxed text-foreground/80">
                @chippi where does this deal stand?
              </div>
            </Row>
            <Row lit={lit} i={3} className="flex justify-end gap-2">
              <div className="rounded-2xl rounded-tr-sm border border-brand/30 bg-brand-subtle px-3 py-2 text-xs leading-relaxed text-foreground/85">
                Tour booked Saturday, offer drafted, waiting on lender. Want me to nudge them?
                <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-brand">
                  <MessageCircle className="h-2.5 w-2.5" /> Chippi
                </span>
              </div>
            </Row>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Channels live with the deal. Mention to pull Chippi in.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Brokerage: members & roles ────────────────────────────────────────────── */

export function MembersPanel() {
  const members = [
    { initials: 'OR', name: 'Orlando R.', role: 'Owner' },
    { initials: 'AB', name: 'Ava Brooks', role: 'Admin' },
    { initials: 'SK', name: 'Sam Kim', role: 'Member' },
  ];
  return (
    <Panel>
      {(lit) => (
        <>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Members</p>
          </div>
          <div className="mt-3 space-y-2">
            {members.map((m, i) => (
              <Row key={m.name} lit={lit} i={i} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">{m.initials}</span>
                <span className="flex-1 truncate text-sm text-foreground">{m.name}</span>
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{m.role}</span>
              </Row>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Three roles, no permissions maze.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Realtor: inbox triage (the one that matters, lifted) ──────────────────── */

export function TriagePanel() {
  const threads = [
    { from: 'Maya Patel', subj: 'Re: 14 Oak St, can we see it Saturday?', label: 'Buyer', top: true },
    { from: 'Tom Reyes', subj: 'Quick refinance question', label: 'Refi' },
    { from: 'Market Digest', subj: 'Your weekly neighborhood update', label: 'Promo', dim: true },
  ];
  return (
    <Panel>
      {(lit) => (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inbox · triaged</p>
          <div className="mt-3 space-y-2">
            {threads.map((t, i) => (
              <Row
                key={t.from}
                lit={lit}
                i={i}
                className={`rounded-xl border px-3 py-2 ${
                  t.top
                    ? 'border-brand/30 bg-brand-subtle'
                    : `border-border/60 bg-muted/20 ${t.dim ? 'opacity-50' : ''}`
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.top && <ArrowUp className="h-3.5 w-3.5 flex-shrink-0 text-brand" />}
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t.from}</p>
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.subj}</p>
              </Row>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground"><span className="font-medium text-brand">Chippi</span> lifted Maya to the top, the rest can wait.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Realtor: the pipeline board advances itself ───────────────────────────── */

export function PipelinePanel() {
  const columns = [
    { label: 'New', tone: 'text-muted-foreground', cards: [{ name: 'Dana Lee', val: '$640K' }] },
    {
      label: 'Touring',
      tone: 'text-brand',
      cards: [
        { name: 'Maya Patel', val: '$1.2M', moved: true },
        { name: 'Eli Vance', val: '$815K' },
      ],
    },
    { label: 'Offer', tone: 'text-emerald-600 dark:text-emerald-400', cards: [{ name: 'Sara Voss', val: '$890K' }] },
  ];
  return (
    <Panel>
      {(lit) => (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pipeline · live</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {columns.map((col, ci) => (
              <div key={col.label}>
                <div className="flex items-center justify-between px-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${col.tone}`}>{col.label}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{col.cards.length}</span>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {col.cards.map((card, ri) => {
                    const moved = 'moved' in card && card.moved;
                    return (
                      <motion.div
                        key={card.name}
                        initial={moved ? { opacity: 0, y: -14, scale: 0.95 } : { opacity: 0, y: 6 }}
                        animate={lit ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ duration: 0.45, ease: EASE_OUT, delay: moved ? 0.55 : 0.12 * ci + 0.06 * ri }}
                        className={`rounded-lg border px-2 py-1.5 ${
                          moved ? 'border-brand/40 bg-brand-subtle' : 'border-border/60 bg-muted/20'
                        }`}
                      >
                        <p className="truncate text-[11px] font-medium text-foreground">{card.name}</p>
                        <p className="truncate text-[10px] tabular-nums text-muted-foreground">{card.val}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground"><span className="font-medium text-brand">Maya</span> advanced to Touring, the board updated itself.</p>
        </>
      )}
    </Panel>
  );
}

/* ── Content studio (home bento card, compact, fills the slot) ────────────── */

export function StudioCard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const lit = Boolean(reduce) || inView;
  return (
    <div ref={ref} className="border-t border-border/60 bg-muted/15 p-5">
      <div className="rounded-xl border border-border/60 bg-background p-3.5">
        <div className="flex items-center gap-2">
          <PenLine className="h-3.5 w-3.5 text-brand" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Drafting · just listed</span>
        </div>
        <p className="mt-2.5 text-sm font-medium text-foreground">14 Oak St, just listed</p>
        <div className="mt-2 space-y-1.5">
          {[100, 84, 62].map((w, i) => (
            <motion.div
              key={w}
              initial={{ width: 0 }}
              animate={lit ? { width: `${w}%` } : {}}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + 0.12 * i }}
              className="h-2 rounded bg-foreground/[0.08]"
            />
          ))}
        </div>
        <div className="mt-3 flex gap-1.5">
          {['#justlisted', '#oakland', '#openhouse'].map((t, i) => (
            <motion.span
              key={t}
              initial={{ opacity: 0, y: 4 }}
              animate={lit ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.5 + 0.08 * i }}
              className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-medium text-brand"
            >
              {t}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}
