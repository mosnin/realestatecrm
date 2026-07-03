'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Phone, Mail, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import { SECTION_LABEL } from '@/lib/typography';

interface PriorityItem {
  contactId: string;
  name: string;
  reason: string;
  leadScore: number;
  leadType: 'rental' | 'buyer' | null;
  hasEmail: boolean;
  hasPhone: boolean;
}

interface PriorityData {
  items: PriorityItem[];
  generatedAt: string | null;
}

/**
 * "Today's focus" — Chippi's curated picks of contacts to reach out to.
 * Backed by the AgentMemory PRIORITY_LIST written by the coordinator after
 * each run. Hides itself when there's no priority list yet (newly enabled
 * agent, or pre-first-run).
 */
export function TodayFocus({ slug }: { slug: string }) {
  const [data, setData] = useState<PriorityData>({ items: [], generatedAt: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/priority', { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setData({
            items: json.items ?? [],
            generatedAt: json.generatedAt ?? null,
          });
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Hide entirely when nothing to show
  if (!loading && data.items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className={SECTION_LABEL}>
          Who to reach today
        </h2>
        {!loading && data.items.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {data.items.length}
          </span>
        )}
        {data.generatedAt && (
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(data.generatedAt)}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3 pt-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted/40 animate-pulse" />
              <div className="flex-1 h-4 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && data.items.length > 0 && (
        <motion.div
          className="divide-y divide-border/60"
          variants={STAGGER_CONTAINER}
          initial="initial"
          animate="enter"
        >
          {data.items.slice(0, 6).map((item) => {
            // One-tap action: prefill the composer with an outreach instruction
            // for this person. `?prefill=` populates the box but NEVER auto-sends
            // — the realtor still reads, tweaks, and approves. Turns "who to
            // reach" from a list of links into the day's work, ready to act on.
            const draftHref = `/s/${slug}/chippi?prefill=${encodeURIComponent(
              `Draft a friendly outreach message to ${item.name}.`,
            )}`;
            return (
              <motion.div key={item.contactId} variants={STAGGER_ITEM}>
                <div className="group/row flex items-center gap-3 py-3 first:pt-4 last:pb-0 hover:bg-muted/20 -mx-3 px-3 rounded-lg transition-colors">
                  <Link
                    href={`/s/${slug}/contacts/${item.contactId}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                        {item.leadScore >= HOT_LEAD_THRESHOLD && (
                          <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                            hot
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.reason}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden sm:flex items-center gap-1 text-muted-foreground/70">
                      {item.hasPhone && <Phone size={11} />}
                      {item.hasEmail && <Mail size={11} />}
                    </span>
                    {/* Always visible (no hover-only — the mobile realtor has no
                        hover), so the day's first action is one tap away. */}
                    <Link
                      href={draftHref}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                        'text-[12px] font-medium transition-colors',
                        'bg-foreground/[0.05] text-foreground/80 hover:bg-foreground/[0.08] hover:text-foreground',
                      )}
                      aria-label={`Draft a message to ${item.name}`}
                    >
                      <SquarePen size={12} aria-hidden />
                      Draft
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
