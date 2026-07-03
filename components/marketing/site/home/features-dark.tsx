'use client';

/**
 * FeaturesDark, the owner-provided five-card glass feature section,
 * reskinned to the WHITE scheme with pastel-orange gradients (owner
 * direction): one big rounded card washed white→peach, soft orange decor
 * orbs, and five glass cards with subtle warm gradient fills. Structure,
 * grid, and the mini live demos (typing drafts, pipeline stats, team
 * avatars + progress, status dots, security checklist) are unchanged.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react';

const TYPING_TEXT = 'Hi Maya, Saturday at 2:00 works. Want me to send the address?';

function useReducedMotionFlag(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduce;
}

/** The source component's typing loop: type at 100ms/char, hold 2s, reset. */
function TypingDemo() {
  const reduce = useReducedMotionFlag();
  const [text, setText] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    if (reduce) {
      setText(TYPING_TEXT);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (idx.current < TYPING_TEXT.length) {
        idx.current += 1;
        setText(TYPING_TEXT.slice(0, idx.current));
        timer = setTimeout(tick, 100);
      } else {
        timer = setTimeout(() => {
          idx.current = 0;
          setText('');
          tick();
        }, 2000);
      }
    };
    tick();
    return () => clearTimeout(timer);
  }, [reduce]);

  return <div className="h-8 font-mono text-xs text-neutral-500">{text}</div>;
}

/** Glass demo shell, white glass on the warm card. */
function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-black/5 backdrop-blur">
      {children}
    </div>
  );
}

function DemoLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm text-neutral-800">
      {icon}
      <span className="font-medium">{label}</span>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-white to-[#fff3ea] p-5 shadow-[0_2px_14px_rgba(80,40,15,0.06)] ring-1 ring-black/5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 to-transparent" />
      {children}
    </section>
  );
}

function CardTitle({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 md:text-2xl">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-600">{body}</p>
    </>
  );
}

const COLLAB_AVATARS = [
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/4c9aa348-4474-47a8-8f1e-3fe52ac8d2b9_320w.webp',
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/ca687bcc-f3d6-4ed6-9efe-e0fd4cbe69a9_320w.webp',
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/39e15168-9f77-4837-9a4b-89c74b8bc38b_320w.webp',
];

export function FeaturesDark() {
  return (
    <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 pb-16">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
        {/* Pastel decor orbs */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />

        <div className="grid grid-cols-1 items-stretch lg:grid-cols-2">
          {/* LEFT */}
          <div className="flex flex-col p-6 sm:p-10">
            {/* Eyebrow */}
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-neutral-600">
              {'// FEATURES'}
            </span>

            {/* Heading */}
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Everything you need<span className="block">to run your book</span>
            </h2>

            <p className="mt-4 max-w-2xl text-base text-neutral-600 md:text-lg">
              An agent that works your book end to end: scoring leads, drafting
              in your voice, booking tours, and logging it all while you close.
            </p>

            {/* Cards */}
            <div className="mt-10 space-y-6">
              {/* Card 1: Drafting */}
              <CardShell>
                <DemoShell>
                  <DemoLabel
                    icon={<MessageCircle className="h-4 w-4 text-[#ff4b29]" />}
                    label="Chippi Draft Assistant"
                  />
                  <div className="space-y-3">
                    <div className="rounded-xl bg-black/[0.03] p-3 ring-1 ring-black/5">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="mb-2 text-sm text-neutral-800">A reply in your voice, ready for your tap</p>
                          <TypingDemo />
                        </div>
                      </div>
                    </div>
                  </div>
                </DemoShell>
                <CardTitle
                  title="Replies in your voice"
                  body="Ask Chippi for a reply and it is written from how you actually write. Connect your inbox and it sends them in your voice the moment leads land."
                />
              </CardShell>

              {/* Card 2: Analytics */}
              <CardShell>
                <DemoShell>
                  <DemoLabel
                    icon={<TrendingUp className="h-4 w-4 text-[#ff4b29]" />}
                    label="Pipeline Insights"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-black/[0.03] p-3 ring-1 ring-black/5">
                      <p className="mb-1 text-xs text-neutral-500">Leads worked</p>
                      <p className="text-2xl font-semibold text-zinc-950">142</p>
                      <p className="mt-1 text-xs text-neutral-600">scored on arrival</p>
                    </div>
                    <div className="rounded-xl bg-black/[0.03] p-3 ring-1 ring-black/5">
                      <p className="mb-1 text-xs text-neutral-500">Follow-ups</p>
                      <p className="text-2xl font-semibold text-zinc-950">94%</p>
                      <p className="mt-1 text-xs text-neutral-600">on time, automatically</p>
                    </div>
                  </div>
                </DemoShell>
                <CardTitle
                  title="A pipeline that reflects reality"
                  body="Deals advance themselves as things happen. The board shows today, not last week."
                />
              </CardShell>
            </div>

            <div className="mt-auto" />
          </div>

          {/* RIGHT (3 cards) */}
          <div className="flex flex-col gap-6 p-6 sm:p-10 lg:col-start-2">
            {/* Card 3: Collaboration */}
            <CardShell>
              <DemoShell>
                <DemoLabel icon={<Users className="h-4 w-4 text-[#ff4b29]" />} label="Team Workspaces" />
                <div className="flex items-center gap-2">
                  {COLLAB_AVATARS.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt="user"
                      className={`h-8 w-8 rounded-full object-cover ring-2 ring-white ${i > 0 ? '-ml-3' : ''}`}
                    />
                  ))}
                  <div className="-ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 ring-2 ring-white">
                    <span className="text-xs text-neutral-700">+5</span>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]"
                      style={{ width: '68%' }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500">8 agents active on the floor</p>
                </div>
              </DemoShell>
              <CardTitle
                title="Built for the whole floor"
                body="Every agent gets a Chippi; the broker gets the floor view. Routing, visibility, and follow-through in one place."
              />
            </CardShell>

            {/* Card 4: Workflow Automation */}
            <CardShell>
              <DemoShell>
                <DemoLabel icon={<Workflow className="h-4 w-4 text-[#ff4b29]" />} label="Always-On Agent" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <div className="h-2 w-2 rounded-full bg-[#ff4b29]" />
                    <span>Inbox watch enabled</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <div className="h-2 w-2 rounded-full bg-[#ff4b29]/70" />
                    <span>Calendar sync active</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <div className="h-2 w-2 rounded-full bg-[#ff4b29]/40" />
                    <span>CRM writeback running</span>
                  </div>
                </div>
              </DemoShell>
              <CardTitle
                title="Autonomous follow-up"
                body="Set the guardrails once and Chippi works the quiet hours, nudging leads, booking tours, logging every move."
              />
            </CardShell>

            {/* Card 5: Security & Compliance */}
            <CardShell>
              <DemoShell>
                <DemoLabel
                  icon={<ShieldCheck className="h-4 w-4 text-[#ff4b29]" />}
                  label="Security &amp; Control"
                />
                <ul className="space-y-2 text-sm text-neutral-700">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-[18px] w-[18px] text-[#ff4b29]" />
                    <span>Every send on the record</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-[18px] w-[18px] text-[#ff4b29]" />
                    <span>Role-based broker controls</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-[18px] w-[18px] text-[#ff4b29]" />
                    <span>A log of every action it takes</span>
                  </li>
                </ul>
              </DemoShell>
              <CardTitle
                title="Enterprise-grade control"
                body="An agent you can hand your book to has to earn it. Guardrails, roles, and auditing are built in, not bolted on."
              />
            </CardShell>
          </div>
        </div>
      </div>
    </section>
  );
}
