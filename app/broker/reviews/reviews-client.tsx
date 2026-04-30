'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'open' | 'approved' | 'closed';

export interface ReviewRow {
  id: string;
  dealId: string;
  status: ReviewStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
  requestingUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  deal: {
    id: string;
    title: string | null;
    value: number | null;
    spaceSlug: string | null;
  };
  commentCount: number;
}

type Tab = 'open' | 'approved' | 'closed' | 'all';

interface Props {
  initialReviews: ReviewRow[];
  role: string;
  brokerageName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsOf(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || email || '?';
  return src
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

// Relative time using Intl.RelativeTimeFormat. Falls back to short date if
// the event happened more than 7 days ago — the queue cares about recency,
// absolute dates add noise for anything older than a week.
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const sevenDays = 7 * 24 * 60 * 60;

  if (abs > sevenDays) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const buckets: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, secs] of buckets) {
    if (abs >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, 'second');
}

const statusBadgeClass = (status: ReviewStatus): string => {
  switch (status) {
    case 'open':
      return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'approved':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    case 'closed':
    default:
      return 'text-muted-foreground bg-muted';
  }
};

const statusLabel = (status: ReviewStatus): string =>
  status === 'open' ? 'Open' : status === 'approved' ? 'Approved' : 'Closed';

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewsClient({ initialReviews, role, brokerageName }: Props) {
  // Surface-level bookkeeping: `role` + `brokerageName` aren't used directly
  // on the queue, but the parent passes them for consistency with the detail
  // page and future header polish. Mark as intentionally read to satisfy the
  // no-unused-vars lint rule without widening the prop shape.
  void role;
  void brokerageName;

  const [tab, setTab] = useState<Tab>('open');
  const [reviews, setReviews] = useState<ReviewRow[]>(initialReviews);
  const [loading, setLoading] = useState(false);
  // Cache of fetched-tabs so switching back doesn't refetch every click.
  const [cache, setCache] = useState<Partial<Record<Tab, ReviewRow[]>>>({
    open: initialReviews,
  });

  useEffect(() => {
    const cached = cache[tab];
    if (cached) {
      setReviews(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/broker/reviews?status=${tab}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
        const data = (await res.json()) as ReviewRow[];
        if (cancelled) return;
        setReviews(data);
        setCache((c) => ({ ...c, [tab]: data }));
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load reviews';
        toast.error(msg);
        setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, cache]);

  const tabs: Array<{ key: Tab; label: string }> = useMemo(
    () => [
      { key: 'open', label: 'Open' },
      { key: 'approved', label: 'Approved' },
      { key: 'closed', label: 'Closed' },
      { key: 'all', label: 'All' },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
              tab === t.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <Card>
          <CardContent className="px-5 py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading reviews…
          </CardContent>
        </Card>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === 'open'
                ? "You're all caught up. Your agents haven't flagged anything for review."
                : `No ${tab} reviews yet.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => {
            const agentInitials = initialsOf(r.requestingUser.name, r.requestingUser.email);
            const agentName = r.requestingUser.name ?? r.requestingUser.email ?? 'Unknown agent';
            const dealTitle = r.deal.title ?? 'Untitled deal';
            const preview =
              r.reason.length > 140 ? `${r.reason.slice(0, 137).trimEnd()}…` : r.reason;

            return (
              <Link
                key={r.id}
                href={`/broker/reviews/${r.id}`}
                className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {agentInitials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="text-sm font-semibold truncate">{agentName}</p>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm font-medium text-primary truncate">
                          {dealTitle}
                        </span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">
                          flagged {formatRelative(r.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {preview}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.commentCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
                        aria-label={`${r.commentCount} comment${r.commentCount === 1 ? '' : 's'}`}
                      >
                        <MessageCircle size={11} />
                        {r.commentCount}
                      </span>
                    )}
                    <span
                      className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${statusBadgeClass(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
