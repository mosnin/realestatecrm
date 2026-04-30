'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, MessageSquare, Mail, StickyNote, Bell, Brain, Activity,
  Share2, Undo2, X, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  agentType: string;
  actionType: string;
  reasoning: string | null;
  outcome: string;
  reversible: boolean;
  reversedAt: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
  Deal: { id: string; title: string } | null;
}

// ─── Action vocabulary ──────────────────────────────────────────────────────
//
// Past-tense, human verbs. The realtor reads this as a story Chippi is
// telling them, not a list of action types. Same vocabulary as WhatIDid for
// consistency; could be extracted into a shared module in a follow-up.

const ACTION_META: Record<string, { verb: string; icon: LucideIcon }> = {
  send_sms:                 { verb: 'sent SMS to',                    icon: MessageSquare },
  send_email:               { verb: 'sent email to',                  icon: Mail },
  log_note:                 { verb: 'logged a note about',            icon: StickyNote },
  create_draft_message:     { verb: 'drafted a message for',          icon: MessageSquare },
  set_contact_follow_up:    { verb: 'scheduled a follow-up with',     icon: Bell },
  set_deal_follow_up:       { verb: 'scheduled a deal follow-up on',  icon: Bell },
  log_agent_observation:    { verb: 'noted something about',          icon: Brain },
  log_observation:          { verb: 'noted something about',          icon: Brain },
  store_memory:             { verb: 'remembered something about',     icon: Brain },
  update_lead_score:        { verb: 'updated the score for',          icon: Activity },
  update_deal_probability:  { verb: 'updated the probability on',     icon: Activity },
  create_follow_up_reminder:{ verb: 'set a reminder for',             icon: Bell },
};

const UNDOABLE_TYPES = new Set(['set_contact_follow_up', 'set_deal_follow_up']);

function metaFor(actionType: string): { verb: string; icon: LucideIcon } {
  return (
    ACTION_META[actionType] ?? {
      verb: actionType.replace(/_/g, ' '),
      icon: CheckCircle2,
    }
  );
}

// ─── Local-state helpers ────────────────────────────────────────────────────

const DISMISS_KEY = 'chippi.morningReplay.lastDismissed';
const FIRST_SIGN_IN_KEY = 'chippi.firstSignInAt';
const WINDOW_HOURS = 12;
/** After this many days, the full replay collapses to a one-liner by default. */
const FULL_MODE_DAYS = 7;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === todayKey();
  } catch {
    return false;
  }
}

function markDismissedToday() {
  try {
    window.localStorage.setItem(DISMISS_KEY, todayKey());
  } catch {
    // ignore
  }
}

/**
 * Read (or initialize) the first-sign-in epoch ms. First time we see the
 * realtor on /chippi we stamp now(); afterwards we read the stored value.
 * Returns null on SSR or if storage is unavailable.
 */
function readOrInitFirstSignInAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FIRST_SIGN_IN_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const now = Date.now();
    window.localStorage.setItem(FIRST_SIGN_IN_KEY, String(now));
    return now;
  } catch {
    return null;
  }
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatTimeRange(entries: ActivityEntry[]): string {
  if (entries.length === 0) return '';
  const earliest = new Date(entries[entries.length - 1].createdAt);
  const latest = new Date(entries[0].createdAt);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${fmt(earliest)} → ${fmt(latest)}`;
}

function buildShareText(entries: ActivityEntry[]): string {
  const lines = entries.slice(0, 5).map((e) => {
    const { verb } = metaFor(e.actionType);
    const target = e.Contact?.name ?? e.Deal?.title ?? 'a contact';
    return `${verb} ${target}`;
  });
  if (entries.length > 5) lines.push(`…and ${entries.length - 5} more`);
  return `Overnight, Chippi:\n${lines.map((l) => `  • ${l}`).join('\n')}`;
}

/**
 * One-line summary in Chippi voice for the collapsed mode. Examples:
 *   "Since yesterday: 1 draft."
 *   "Since yesterday: 4 things — 2 drafts, 1 reminder, 1 calendar update."
 *
 * The "calendar update" / "reminder" / "draft" / "note" buckets map onto the
 * same stats the footer summary uses, just relabelled in plain English so the
 * realtor doesn't have to translate.
 */
function buildCollapsedLine(stats: {
  sent: number;
  drafted: number;
  scheduled: number;
  noted: number;
}): string | null {
  const buckets: { count: number; singular: string; plural: string }[] = [
    { count: stats.drafted, singular: 'draft', plural: 'drafts' },
    { count: stats.scheduled, singular: 'reminder', plural: 'reminders' },
    { count: stats.sent, singular: 'message sent', plural: 'messages sent' },
    { count: stats.noted, singular: 'note', plural: 'notes' },
  ].filter((b) => b.count > 0);

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;

  if (buckets.length === 1) {
    const b = buckets[0];
    const noun = b.count === 1 ? b.singular : b.plural;
    return `Since yesterday: ${b.count} ${noun}.`;
  }

  const parts = buckets.map((b) => `${b.count} ${b.count === 1 ? b.singular : b.plural}`);
  const noun = total === 1 ? 'thing' : 'things';
  return `Since yesterday: ${total} ${noun} — ${parts.join(', ')}.`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  slug: string;
}

/**
 * Morning Replay — the wow moment.
 *
 * The realtor lands on /chippi at 8am and watches Chippi's overnight work
 * animate in as a story: "Last night while you slept, I qualified Marcus,
 * drafted Sarah's message, booked a tour for David." Past tense. Active
 * voice. Human verbs. Each row lands 180ms after the previous, ease-out
 * cubic — definite, not bouncy.
 *
 * Hidden until the realtor has overnight activity to see; dismissed for
 * the rest of the day with one tap. No persistent settings. No skeleton
 * when there's nothing to show — the surface either renders or doesn't.
 */
export function MorningReplay({ slug }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  // Days since first /chippi visit. Null until the client-side effect runs.
  const [daysSinceFirstSignIn, setDaysSinceFirstSignIn] = useState<number | null>(null);
  // In collapsed mode, the user can click "Show" to expand for the current view.
  const [forceFull, setForceFull] = useState(false);

  // Check dismiss state up front, and stamp/read the first-sign-in epoch so
  // we know whether the user is still in their first-week wow window.
  useEffect(() => {
    if (isDismissedToday()) setHidden(true);
    const firstSignInAt = readOrInitFirstSignInAt();
    if (firstSignInAt != null) {
      setDaysSinceFirstSignIn((Date.now() - firstSignInAt) / 86400000);
    } else {
      // Storage unavailable — default to full mode (safer, more delightful).
      setDaysSinceFirstSignIn(0);
    }
  }, []);

  // Load activity once. Skip if already dismissed.
  useEffect(() => {
    if (hidden) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/activity?outcome=completed&limit=30', {
          signal: controller.signal,
        });
        if (!res.ok) {
          setEntries([]);
          return;
        }
        const all = (await res.json()) as ActivityEntry[];
        const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
        const recent = all.filter((e) => new Date(e.createdAt).getTime() >= cutoff);
        setEntries(recent);
      } catch {
        setEntries([]);
      }
    })();
    return () => controller.abort();
  }, [hidden]);

  const stats = useMemo(() => {
    if (!entries) return null;
    const sent = entries.filter((e) => e.actionType === 'send_sms' || e.actionType === 'send_email').length;
    const drafted = entries.filter((e) => e.actionType === 'create_draft_message').length;
    const scheduled = entries.filter((e) =>
      e.actionType === 'set_contact_follow_up' || e.actionType === 'set_deal_follow_up' || e.actionType === 'create_follow_up_reminder',
    ).length;
    const noted = entries.filter((e) =>
      e.actionType === 'log_note' || e.actionType === 'log_observation' || e.actionType === 'log_agent_observation' || e.actionType === 'store_memory',
    ).length;
    return { sent, drafted, scheduled, noted };
  }, [entries]);

  const dismiss = useCallback(() => {
    markDismissedToday();
    setHidden(true);
  }, []);

  // In collapsed mode: collapse the expanded full view back down without
  // marking the day as dismissed, so the line still shows.
  const collapseAgain = useCallback(() => {
    setForceFull(false);
  }, []);

  const share = useCallback(async () => {
    if (!entries) return;
    const text = buildShareText(entries);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: "Chippi's overnight work", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard.');
      }
    } catch {
      // user cancelled — silent
    }
  }, [entries]);

  const undoEntry = useCallback(async (entry: ActivityEntry) => {
    setUndoing(entry.id);
    try {
      const res = await fetch(`/api/agent/activity/${entry.id}/reverse`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Couldn't undo that.");
        return;
      }
      setEntries((prev) =>
        prev
          ? prev.map((e) =>
              e.id === entry.id ? { ...e, reversedAt: data?.reversedAt ?? new Date().toISOString() } : e,
            )
          : prev,
      );
      toast.success('Undone.');
    } finally {
      setUndoing(null);
    }
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  // Hide entirely when dismissed, still loading (entries null/first-sign-in
  // not yet computed), or empty.
  if (
    hidden ||
    entries === null ||
    entries.length === 0 ||
    daysSinceFirstSignIn === null
  ) {
    return null;
  }

  // Mode selection: full for the first week, collapsed afterwards. The user
  // can override collapsed by clicking "Show", which sets forceFull=true for
  // the current view only.
  const inFirstWeek = daysSinceFirstSignIn < FULL_MODE_DAYS;
  const showFull = inFirstWeek || forceFull;

  // Reverse so oldest first reads as a story (chronological)
  const story = [...entries].reverse();
  const range = formatTimeRange(entries);

  // Stagger config — each row 180ms after the previous, ease-out cubic
  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.18, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
  };

  // Collapsed mode — a single muted "Since yesterday" line above the focus
  // card with a [Show] affordance. Renders nothing if there's nothing to say.
  if (!showFull) {
    const line = buildCollapsedLine(stats ?? { sent: 0, drafted: 0, scheduled: 0, noted: 0 });
    if (!line) return null;
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="morning-replay-collapsed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="max-w-2xl mx-auto flex items-center gap-2 text-[13px] text-muted-foreground"
        >
          <span className="flex-1 min-w-0 truncate">{line}</span>
          <button
            type="button"
            onClick={() => setForceFull(true)}
            className="text-foreground/80 hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Show
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key="morning-replay-full"
        initial={{ opacity: 0, y: inFirstWeek ? 8 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
        transition={{ duration: inFirstWeek ? 0.35 : 0.2, ease: [0.16, 1, 0.3, 1] as const }}
        className="max-w-2xl mx-auto"
      >
        <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-2 flex items-baseline gap-3">
            <h2 className="text-xl tracking-tight font-semibold text-foreground">
              Last night
            </h2>
            <span className="text-[12px] text-muted-foreground tabular-nums">{range}</span>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Story */}
          <motion.ul
            variants={container}
            initial="hidden"
            animate="show"
            className="px-6 py-4 space-y-2"
          >
            {story.map((entry) => {
              const { verb, icon: Icon } = metaFor(entry.actionType);
              const targetName = entry.Contact?.name ?? entry.Deal?.title ?? null;
              const targetHref = entry.Contact
                ? `/s/${slug}/contacts/${entry.Contact.id}`
                : entry.Deal
                  ? `/s/${slug}/deals`
                  : null;
              const canUndo =
                !entry.reversedAt &&
                entry.reversible &&
                UNDOABLE_TYPES.has(entry.actionType);

              return (
                <motion.li
                  key={entry.id}
                  variants={item}
                  className="group/row flex items-center gap-3 py-1.5"
                >
                  <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={12} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="flex-1 text-[14px] leading-snug text-foreground min-w-0">
                    <span className="text-foreground/80">I {verb}</span>{' '}
                    {targetName ? (
                      targetHref ? (
                        <Link
                          href={targetHref}
                          className="font-medium text-foreground hover:underline underline-offset-2"
                        >
                          {targetName}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{targetName}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground italic">a contact</span>
                    )}
                  </p>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums">
                    {timeAgo(entry.createdAt)}
                  </span>
                  {entry.reversedAt ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground flex-shrink-0">
                      <Undo2 size={10} />
                      undone
                    </span>
                  ) : canUndo ? (
                    <button
                      type="button"
                      onClick={() => void undoEntry(entry)}
                      disabled={undoing === entry.id}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                    >
                      {undoing === entry.id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Undo2 size={10} />
                      )}
                      Undo
                    </button>
                  ) : null}
                </motion.li>
              );
            })}
          </motion.ul>

          {/* Footer — summary line + actions */}
          <div className="px-6 pt-3 pb-5 border-t border-border/60 flex items-center gap-3 flex-wrap">
            <p className="text-[13px] text-muted-foreground flex-1 min-w-0">
              {[
                stats?.sent && `${stats.sent} sent`,
                stats?.drafted && `${stats.drafted} drafted`,
                stats?.scheduled && `${stats.scheduled} scheduled`,
                stats?.noted && `${stats.noted} noted`,
              ]
                .filter(Boolean)
                .join(' · ') || `${entries.length} actions handled`}
            </p>
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
            >
              <Share2 size={12} />
              Share
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150"
            >
              Looks good
            </button>
          </div>
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
