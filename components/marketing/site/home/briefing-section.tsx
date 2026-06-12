/**
 * BriefingSection, the morning-briefing beat (audit gap #2: the hero badge
 * name-drops it, then the story drops it).
 *
 * Grounded in the real /api/cron/daily-briefing job: a digest of hot leads,
 * stalled deals, today's tours, and follow-ups due, delivered email + SMS +
 * push at the realtor's local 7am, with autonomous-sweep drafts already
 * waiting. Dark contrast band (the only dark beat on the page) with a
 * skeleton "brief" card. Two-tone headline written inline (TwoTone's dim is
 * dark-on-light, so on a dark band we hand-tone with white / white-45).
 */

import { Bell, CalendarClock, Flame, Sun, TrendingDown } from 'lucide-react';
import { EyebrowChip, FadeUp } from '@/components/marketing/site/section';

const ROWS = [
  { icon: Flame, label: 'Hot leads to call first', meta: '3 ranked', tone: 'text-[#ff8a5c]' },
  { icon: TrendingDown, label: 'Deals that stalled', meta: '2 flagged', tone: 'text-amber-400' },
  { icon: CalendarClock, label: "Today's tours", meta: '1 confirmed', tone: 'text-sky-400' },
  { icon: Bell, label: 'Follow-ups due', meta: '4 drafted', tone: 'text-emerald-400' },
];

export function BriefingSection() {
  return (
    <section className="px-3 sm:px-4">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#0d0d0f] px-6 py-12 text-white sm:rounded-[2.75rem] sm:px-12 sm:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Copy */}
          <div>
            <EyebrowChip light>Morning briefing</EyebrowChip>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl">
              Wake up to the work <span className="text-white/45">already done.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              Every morning at 7, Chippi hands you the brief: who is hot, which
              deals stalled, today&apos;s tours, and the follow-ups due, with the
              drafts already written and waiting for your tap.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {['Email', 'Text', 'Push'].map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/85"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Skeleton brief card */}
          <FadeUp delay={0.1}>
            <div className="rounded-3xl bg-[#161618] p-5 ring-1 ring-white/10 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-white/10 pb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff4b29]/15 text-[#ff8a5c]">
                  <Sun className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Good morning. Here&apos;s your day.</p>
                  <p className="text-[11px] text-white/45">7:00 AM · drafted overnight</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {ROWS.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 ring-1 ring-white/5"
                  >
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 ${r.tone}`}>
                      <r.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13px] text-white/85">{r.label}</span>
                    <span className="text-[12px] font-medium text-white/50">{r.meta}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
