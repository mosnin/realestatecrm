/**
 * HowItWorks, the owner-provided white-card steps section, exact.
 *
 * A white rounded-3xl card with a deep soft shadow: giant tracking-tighter
 * "How it works." headline beside a hairline separator + gray sub, then a
 * hairline, then three bordered step cards with floating STEP pills and
 * neutral skeleton-mockup visuals. Native design verbatim (skeleton bars,
 * tinted mini-chips, hover lift); copy tailored to Chippi's three steps:
 * connect → Chippi drafts & books → approve & track.
 */

import {
  BookOpen,
  FileText,
  Mail,
  MessageSquare,
  Monitor,
  RefreshCw,
  Send,
} from 'lucide-react';

function StepPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -top-4 left-6 inline-flex items-center rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs tracking-tight text-neutral-800 dark:border-white/10 dark:bg-[#151517] dark:text-white/80 sm:text-sm">
      {children}
    </span>
  );
}

function StepCard({
  step,
  title,
  body,
  children,
}: {
  step: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col rounded-[28px] border border-neutral-200 bg-white p-6 transition-transform duration-200 hover:-translate-y-1 dark:border-white/10 dark:bg-[#151517] sm:p-8">
      <StepPill>{step}</StepPill>
      {children}
      <h3 className="font-display mt-6 text-3xl tracking-tighter text-neutral-900 dark:text-white sm:text-4xl">
        {title}
      </h3>
      <p className="mt-2 max-w-[52ch] text-sm tracking-tight text-neutral-600 dark:text-white/60 sm:text-base">
        {body}
      </p>
    </div>
  );
}

/** Tiny tinted channel chip used in the step-3 dashboard mock. */
function ChannelChip({
  tone,
  icon,
  barWidth,
}: {
  tone: 'blue' | 'emerald' | 'purple';
  icon: React.ReactNode;
  barWidth: string;
}) {
  const tones = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20',
    emerald:
      'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    purple:
      'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-500/10 dark:border-purple-500/20',
  } as const;
  const bars = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    purple: 'bg-purple-600',
  } as const;
  return (
    <div className={`rounded border p-2 text-center ${tones[tone]}`}>
      <span className="mx-auto mb-1 block w-fit">{icon}</span>
      <div className={`mx-auto h-1 rounded ${bars[tone]} ${barWidth}`} />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="relative z-10 mx-auto mt-24 w-full max-w-7xl rounded-3xl border border-neutral-200/70 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#101012] sm:p-8">
      {/* Header */}
      <div className="flex items-center gap-6 px-1">
        <h2 className="font-display text-[44px] leading-[0.9] tracking-tighter text-zinc-950 dark:text-white sm:text-6xl lg:text-7xl xl:text-8xl">
          How it works.
        </h2>
        <span aria-hidden role="separator" className="h-10 w-px bg-neutral-200 dark:bg-white/10" />
        <p className="mt-1 text-sm tracking-tight text-zinc-400 sm:text-base">
          Three simple steps to put your book on autopilot
        </p>
      </div>
      <div className="mt-4 h-px bg-neutral-200 dark:bg-white/10" />

      <div className="relative z-10 mt-6 grid grid-cols-1 items-stretch gap-8 sm:mt-8 sm:gap-10 lg:grid-cols-12">
        {/* STEP 1, Connect */}
        <div className="lg:col-span-4">
          <StepCard
            step="STEP 1"
            title="Connect your inbox"
            body="Link Gmail or Outlook and your calendar in two minutes. Chippi learns your voice from how you already write."
          >
            <div className="relative h-48 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] sm:h-56">
              <div className="absolute inset-0 p-4 sm:p-6">
                <div className="w-full rounded-xl border border-neutral-200 bg-white/90 p-4 shadow-2xl dark:border-white/10 dark:bg-[#1a1a1d]/90">
                  <div className="mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                    <div className="h-2 w-24 rounded bg-neutral-900 dark:bg-white/80" />
                  </div>
                  <div className="mb-2 h-2 w-full rounded bg-neutral-100 dark:bg-white/10" />
                  <div className="mb-2 h-2 w-4/5 rounded bg-neutral-100 dark:bg-white/10" />
                  <div className="mb-3 h-2 w-3/4 rounded bg-neutral-100 dark:bg-white/10" />
                  <div className="flex gap-2">
                    <div className="flex h-6 w-16 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
                      <div className="h-1 w-8 rounded bg-emerald-600" />
                    </div>
                    <div className="h-6 w-20 rounded-lg bg-neutral-100 dark:bg-white/10" />
                  </div>
                </div>
              </div>
            </div>
          </StepCard>
        </div>

        {/* STEP 2, Chippi works */}
        <div className="lg:col-span-4">
          <StepCard
            step="STEP 2"
            title="Chippi drafts &amp; books"
            body="Every lead gets scored, a reply drafted in your voice for your approval, and tour times proposed from your calendar."
          >
            <div className="relative h-48 overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-100 p-4 dark:border-white/10 dark:from-white/[0.06] dark:to-white/[0.02] sm:h-56">
              <div className="grid h-full grid-cols-2 gap-3">
                {[
                  { icon: <MessageSquare className="h-3 w-3 text-blue-600" strokeWidth={2} />, bar: 'bg-blue-600 w-12' },
                  { icon: <Monitor className="h-3 w-3 text-emerald-600" strokeWidth={2} />, bar: 'bg-emerald-600 w-10' },
                  { icon: <BookOpen className="h-3 w-3 text-purple-600" strokeWidth={2} />, bar: 'bg-purple-600 w-14' },
                  { icon: <Send className="h-3 w-3 text-orange-600" strokeWidth={2} />, bar: 'bg-orange-600 w-8' },
                ].map((cell, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1a1a1d]"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {cell.icon}
                      <div className={`h-1.5 rounded ${cell.bar}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="h-1 w-full rounded bg-neutral-200 dark:bg-white/10" />
                      <div className="h-1 w-4/5 rounded bg-neutral-200 dark:bg-white/10" />
                      <div className="h-1 w-3/4 rounded bg-neutral-200 dark:bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </StepCard>
        </div>

        {/* STEP 3, Approve & track */}
        <div className="lg:col-span-4">
          <StepCard
            step="STEP 3"
            title="Approve &amp; track"
            body="Tap to send. Deals advance themselves, and every action lands in a plain-language log you can audit."
          >
            <div className="relative h-48 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 p-4 dark:border-white/10 dark:bg-white/[0.04] sm:h-56">
              <div className="h-full w-full overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1d]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
                      <RefreshCw className="h-3 w-3 text-emerald-600" strokeWidth={2} />
                    </div>
                    <div className="h-2 w-16 rounded bg-neutral-900 dark:bg-white/80" />
                  </div>
                  <div className="h-4 w-4 rounded-full bg-green-400" />
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <ChannelChip tone="blue" barWidth="w-8" icon={<MessageSquare className="h-3 w-3" strokeWidth={2} />} />
                  <ChannelChip tone="emerald" barWidth="w-6" icon={<Mail className="h-3 w-3" strokeWidth={2} />} />
                  <ChannelChip tone="purple" barWidth="w-10" icon={<Monitor className="h-3 w-3" strokeWidth={2} />} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ChannelChip tone="blue" barWidth="w-8" icon={<MessageSquare className="h-3 w-3" strokeWidth={2} />} />
                  <ChannelChip tone="emerald" barWidth="w-6" icon={<Mail className="h-3 w-3" strokeWidth={2} />} />
                  <ChannelChip tone="purple" barWidth="w-10" icon={<Monitor className="h-3 w-3" strokeWidth={2} />} />
                </div>
              </div>
            </div>
          </StepCard>
        </div>
      </div>
    </section>
  );
}
