'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, SECTION_LABEL } from '@/lib/typography';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { Mail, MessageSquare, Waypoints } from 'lucide-react';

export interface ActiveEnrollment {
  id: string;
  contactId: string | null;
  contactName: string;
  playKind: string;
  playName: string;
  /** 0-based index of the NEXT step to fire. */
  step: number;
  totalSteps: number;
  nextActionAt: string | null;
}

export interface PlayCard {
  kind: string;
  name: string;
  description: string;
  steps: { actionType: 'email' | 'sms'; delayDays: number }[];
}

interface Props {
  slug: string;
  enrollments: ActiveEnrollment[];
  plays: PlayCard[];
}

function formatNext(dateStr: string | null): string {
  if (!dateStr) return 'scheduled';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'scheduled';
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'due now';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return `in ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChannelIcon({ type }: { type: 'email' | 'sms' }) {
  return type === 'email' ? (
    <Mail size={12} className="text-muted-foreground" />
  ) : (
    <MessageSquare size={12} className="text-muted-foreground" />
  );
}

/** Human label for a step delay — "day 0", "day 1", "day 14". */
function dayLabel(delayDays: number): string {
  return delayDays === 0 ? 'day 0' : `+${delayDays}d`;
}

export function PlaysView({ slug, enrollments, plays }: Props) {
  const activeCount = enrollments.length;

  const statusSentence =
    activeCount === 0
      ? 'Nothing running yet. Enroll a contact and Chippi works the sequence for you.'
      : `${activeCount} ${activeCount === 1 ? 'contact is' : 'contacts are'} on a play. Each step drafts for your approval.`;

  return (
    <div className="space-y-12 max-w-[900px] pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Plays.</p>
        <h1 className={H1} style={TITLE_FONT}>
          {activeCount === 0 ? 'No plays running.' : `${activeCount} on a play.`}
        </h1>
        <p className="text-sm text-muted-foreground">{statusSentence}</p>
      </header>

      {/* ── Active enrollments ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={cn(SECTION_LABEL, 'px-1')}>Active</p>

        {activeCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className="text-sm text-foreground">Nothing in flight.</p>
            <p className="text-xs text-muted-foreground mt-1">
              A new lead or a finished tour starts a play on its own. Or ask Chippi to enroll
              someone.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
            <StaggerList className="divide-y divide-border/60">
              {enrollments.map((e) => (
                <StaggerItem key={e.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-foreground/[0.04] flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {e.contactName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {e.contactId ? (
                        <Link
                          href={`/s/${slug}/contacts/${e.contactId}`}
                          className="text-sm font-medium hover:text-foreground/70 transition-colors truncate block"
                        >
                          {e.contactName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium truncate block">{e.contactName}</span>
                      )}
                      <p className="text-[11px] text-muted-foreground truncate">
                        {e.playName} · step {Math.min(e.step + 1, e.totalSteps)} of {e.totalSteps}
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
                      next {formatNext(e.nextActionAt)}
                    </span>
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        )}
      </section>

      {/* ── The playbook ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={cn(SECTION_LABEL, 'px-1')}>The playbook</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plays.map((p) => (
            <div
              key={p.kind}
              className="rounded-xl border border-border/70 bg-card px-4 py-4 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <Waypoints size={15} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[17px] leading-snug font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
              </div>

              {/* The sequence — self-explaining, no "how this works" card. */}
              <div className="flex flex-wrap items-center gap-1.5 pl-[26px]">
                {p.steps.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                  >
                    <ChannelIcon type={s.actionType} />
                    {dayLabel(s.delayDays)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
