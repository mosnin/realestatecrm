'use client';

/**
 * Instant First Touch card — the speed-to-lead spotlight on the /chippi
 * home (rendered by components/chippi/today-feed.tsx above the focus
 * queue).
 *
 * Shows the NEWEST pending first-touch draft (sourced from
 * /api/leads/first-touch, the same client-fetch pattern the focus card
 * uses for /api/agent/drafts): lead name, source, arrival time, a
 * one-line want from intake answers, and a two-line draft preview. One
 * primary action — "Review & send" — which lands on the inbox where the
 * existing approve → send pipeline takes over.
 *
 * Design spec (reference-driven restyle in progress — build to this):
 * large radius (rounded-3xl), NO border, flat bg-card surface, p-6,
 * semibold lg headline, status as a small rounded-full pill.
 *
 * Renders nothing when there are no pending first-touch drafts.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { FOCUS_CARD_MAX } from '@/lib/geometry';
import { PRIMARY_PILL } from '@/lib/typography';

interface FirstTouchItem {
  id: string;
  channel: 'email' | 'sms' | 'note';
  subject: string | null;
  preview: string;
  createdAt: string;
  contactId: string | null;
  leadName: string;
  source: string;
  arrivedAt: string;
  want: string | null;
}

export function FirstTouchCard({ slug }: { slug: string }) {
  const [items, setItems] = useState<FirstTouchItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/leads/first-touch');
        if (!res.ok) return;
        const data = (await res.json()) as FirstTouchItem[];
        if (!cancelled && Array.isArray(data)) setItems(data);
      } catch {
        // Best-effort spotlight — a fetch failure just means no card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const item = items[0];
  if (!item) return null;

  const more = items.length - 1;
  const channelLabel = item.channel === 'sms' ? 'intro text' : 'intro email';

  return (
    <section
      aria-label="New lead — first touch ready"
      className={cn(FOCUS_CARD_MAX, 'mx-auto rounded-3xl bg-card p-6')}
    >
      {/* Headline row: lead name + status pill */}
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-foreground truncate">
          {item.leadName}
        </h3>
        <span className="shrink-0 inline-flex items-center rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-foreground/80">
          First touch ready
        </span>
      </div>

      {/* Meta line: source + arrival */}
      <p className="mt-1 text-xs text-muted-foreground">
        New lead · {item.source} · {timeAgo(item.arrivedAt)}
      </p>

      {/* One-line want from intake answers, when the lead gave us one */}
      {item.want && (
        <p className="mt-3 text-sm text-foreground/85 truncate">{item.want}</p>
      )}

      {/* Draft preview — two lines, truncated */}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {item.preview}
      </p>

      {/* Single primary action */}
      <div className="mt-5 flex items-center gap-3">
        <Link href={`/s/${slug}/chippi/inbox`} className={PRIMARY_PILL}>
          Review &amp; send
          <ArrowRight size={14} />
        </Link>
        {more > 0 && (
          <span className="text-xs text-muted-foreground">
            +{more} more new {more === 1 ? 'lead' : 'leads'} waiting
          </span>
        )}
      </div>
    </section>
  );
}
