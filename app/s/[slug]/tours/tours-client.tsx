'use client';

import { useState, useCallback } from 'react';
import {
  CalendarDays,
  MapPin,
  User,
  Mail,
  Phone,
  Check,
  X,
  Copy,
  MoreHorizontal,
  CalendarPlus,
  Loader2,
  Briefcase,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DURATION_FAST, DURATION_BASE, EASE_OUT, EASE_APPLE } from '@/lib/motion';
import { Expandable, ExpandableContent } from '@/components/ui/expandable';
import { useRealtime } from '@/hooks/use-realtime';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TourAvailabilityManager } from './tour-availability-manager';
import { TourPrepCard } from '@/components/tours/tour-prep-card';
import { TourTimeline } from '@/components/tours/tour-timeline';
import { TourStatsStrip } from '@/components/tours/tour-stats-strip';
import { TourFeedbackBadge } from '@/components/tours/tour-feedback-badge';
import {
  H1,
  H2,
  H3,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_LABEL,
  PAGE_RHYTHM,
  SECTION_RHYTHM,
} from '@/lib/typography';

type TourStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

interface Tour {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyAddress: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  status: TourStatus;
  googleEventId: string | null;
  sourceDealId: string | null;
  createdAt?: string;
  Contact: { id: string; name: string; email: string | null; phone: string | null } | null;
}

interface PropertyProfile {
  id: string;
  name: string;
  address: string | null;
  tourDuration: number;
  isActive: boolean;
}

interface TourSettings {
  tourDuration: number;
  tourBufferMinutes: number;
  tourStartHour: number;
  tourEndHour: number;
  tourDaysAvailable: number[];
  tourBlockedDates: string[];
}

interface ToursClientProps {
  slug: string;
  spaceId: string;
  initialTours: Tour[];
  hasGoogleCalendar: boolean;
  bookingUrl: string;
  propertyProfiles?: PropertyProfile[];
  tourSettings?: TourSettings;
}

const STATUS_CONFIG: Record<TourStatus, { label: string; color: string; dot: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
  confirmed: { label: 'Confirmed', color: 'bg-foreground/[0.06] text-foreground', dot: 'bg-foreground' },
  completed: { label: 'Completed', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/40' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  no_show: { label: 'No Show', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
};

/** Status chip with a small leading dot — the dot does the at-a-glance
 *  signalling, the label confirms it. One vocabulary across table + card. */
function StatusChip({ status, className }: { status: TourStatus; className?: string }) {
  const conf = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
        conf.color,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', conf.dot)} />
      {conf.label}
    </span>
  );
}

type FilterTab = 'upcoming' | 'past' | 'all' | 'availability';

export function ToursClient({ slug, spaceId, initialTours, hasGoogleCalendar, bookingUrl, propertyProfiles: initialProfiles = [], tourSettings: initialTourSettings }: ToursClientProps) {
  const reduced = useReducedMotion();
  const [tours, setTours] = useState<Tour[]>(initialTours);
  const [tab, setTab] = useState<FilterTab>('upcoming');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'table' | 'card'>('table');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [embedCopied, setEmbedCopied] = useState(false);
  const router = useRouter();

  // --- Supabase Realtime: keep tours in sync across tabs / devices ---
  useRealtime<Record<string, unknown>>({
    table: 'Tour',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      if (payload.eventType === 'INSERT') {
        const newTour = payload.new as unknown as Tour;
        setTours((prev) => {
          // Avoid duplicates (e.g. if we just created it locally)
          if (prev.some((t) => t.id === newTour.id)) return prev;
          return [newTour, ...prev];
        });
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as unknown as Tour;
        setTours((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
        );
      } else if (payload.eventType === 'DELETE') {
        const deleted = payload.old as unknown as { id: string };
        if (deleted?.id) {
          setTours((prev) => prev.filter((t) => t.id !== deleted.id));
        }
      }
    },
  });

  const now = new Date();
  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = tours.filter((t) => {
    const start = new Date(t.startsAt);
    if (tab === 'upcoming' && !(start >= now && t.status !== 'cancelled')) return false;
    if (tab === 'past' && !(start < now || t.status === 'completed')) return false;
    if (searchLower) {
      return (
        t.guestName.toLowerCase().includes(searchLower) ||
        (t.guestEmail?.toLowerCase().includes(searchLower) ?? false) ||
        (t.guestPhone?.toLowerCase().includes(searchLower) ?? false) ||
        (t.propertyAddress?.toLowerCase().includes(searchLower) ?? false) ||
        (t.notes?.toLowerCase().includes(searchLower) ?? false) ||
        (t.Contact?.name.toLowerCase().includes(searchLower) ?? false)
      );
    }
    return true;
  });

  const updateStatus = useCallback(async (tourId: string, status: TourStatus) => {
    setUpdatingId(tourId);
    setActionMenuId(null);
    try {
      const res = await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTours((prev) => prev.map((t) => (t.id === tourId ? { ...t, ...updated } : t)));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('[Tours] Status update failed:', data.error);
        toast.error("Couldn't update that tour. Try again.", {
          action: { label: 'Retry', onClick: () => void updateStatus(tourId, status) },
        });
      }
    } catch (err) {
      console.error('[Tours] Status update error:', err);
      toast.error("Couldn't update that tour. Try again.", {
        action: { label: 'Retry', onClick: () => void updateStatus(tourId, status) },
      });
    } finally {
      setUpdatingId(null);
    }
  }, []);

  const syncToGcal = useCallback(async (tourId: string) => {
    setSyncingId(tourId);
    try {
      const res = await fetch('/api/tours/gcal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action: 'sync_tour', tourId }),
      });
      if (res.ok) {
        const data = await res.json();
        setTours((prev) =>
          prev.map((t) => (t.id === tourId ? { ...t, googleEventId: data.googleEventId } : t))
        );
        toast.success('Added to your Google Calendar.');
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('[Tours] Sync failed:', data.error);
        toast.error(
          data.error === 'not_connected'
            ? 'Connect Google Calendar in Integrations first.'
            : "Couldn't sync to Google Calendar. Try again.",
        );
      }
    } catch (err) {
      console.error('[Tours] Sync failed:', err);
      toast.error("Couldn't sync to Google Calendar. Try again.");
    } finally {
      setSyncingId(null);
    }
  }, [slug]);

  const convertToDeal = useCallback(async (tourId: string) => {
    setConvertingId(tourId);
    try {
      const res = await fetch('/api/tours/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, tourId }),
      });
      if (res.ok) {
        const data = await res.json();
        setTours((prev) =>
          prev.map((t) => (t.id === tourId ? { ...t, sourceDealId: data.deal.id } : t))
        );
        toast.success('Tour turned into a deal.');
        router.push(`/s/${slug}/deals/${data.deal.id}`);
      } else if (res.status === 409) {
        const data = await res.json();
        if (data.dealId) {
          toast.info('This tour already has a deal — opening it.');
          router.push(`/s/${slug}/deals/${data.dealId}`);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('[Tours] Convert failed:', data.error);
        toast.error("Couldn't turn this into a deal. Try again.", {
          action: { label: 'Retry', onClick: () => void convertToDeal(tourId) },
        });
      }
    } catch (err) {
      console.error('[Tours] Convert failed:', err);
      toast.error("Couldn't turn this into a deal. Try again.", {
        action: { label: 'Retry', onClick: () => void convertToDeal(tourId) },
      });
    } finally {
      setConvertingId(null);
    }
  }, [slug, router]);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
  }

  function getDuration(start: string, end: string) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / 60000);
  }

  return (
    <div className={PAGE_RHYTHM}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Tours
        </h1>
        <div className="flex items-center gap-1">
          {/* View toggle — small two-icon segmented control */}
          <div className="flex rounded-md border border-border/70 overflow-hidden bg-background">
            <button
              type="button"
              onClick={() => setView('table')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors duration-150',
                view === 'table'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              )}
              title="Table view"
              aria-label="Table view"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('card')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors duration-150',
                view === 'card'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              )}
              title="Card view"
              aria-label="Card view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by guest, email, phone, or address…"
          className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Stats */}
      <TourStatsStrip tours={tours.map((t) => ({ startsAt: t.startsAt, status: t.status, sourceDealId: t.sourceDealId, createdAt: t.createdAt }))} />

      {/* Tabs — animated active underline (shared layoutId) so switching slides
          rather than cuts. role=tablist + role=tab so screen readers announce
          the tab group and selected state. */}
      <div role="tablist" aria-label="Tour views" className="flex items-center gap-1 border-b border-border/70">
        {(['upcoming', 'past', 'all', 'availability'] as const).map((t) => {
          const active = tab === t;
          const label =
            t === 'upcoming' ? 'Upcoming' : t === 'past' ? 'Past' : t === 'all' ? 'All' : 'Availability';
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                'relative px-4 py-2 text-sm font-medium transition-colors duration-150 -mb-px',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {active && (
                <motion.span
                  layoutId="tours-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground"
                  transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Availability tab */}
      {tab === 'availability' && (
        <div className={SECTION_RHYTHM}>
          <TourAvailabilityManager
            slug={slug}
            initialSettings={initialTourSettings}
            propertyProfiles={profiles}
            onProfilesUpdate={setProfiles as any}
          />

          {/* Embed Code */}
          <div className="border-t border-border pt-6 space-y-3">
            <div>
              <h3 className={H3}>Embed Booking Widget</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste this code into your website or listing page to let visitors book tours directly.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <code className="text-xs text-foreground break-all block">
                {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/book/${slug}/embed" width="100%" height="600" frameborder="0" style="border: none; border-radius: 16px;"></iframe>`}
              </code>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const code = `<iframe src="${window.location.origin}/book/${slug}/embed" width="100%" height="600" frameborder="0" style="border: none; border-radius: 16px;"></iframe>`;
                navigator.clipboard.writeText(code);
                setEmbedCopied(true);
                setTimeout(() => setEmbedCopied(false), 2000);
              }}
              className="gap-1.5"
            >
              {embedCopied ? <Check size={14} /> : <Copy size={14} />}
              {embedCopied ? 'Copied!' : 'Copy Embed Code'}
            </Button>
          </div>
        </div>
      )}

      {/* Tour list */}
      {tab !== 'availability' && filtered.length === 0 ? (
        (() => {
          // Two empties: a truly fresh workspace (no tours at all, no search)
          // earns the booking-link onboarding moment; a filtered/searched view
          // that simply has no matches gets a quieter, accurate line.
          const isFresh = tours.length === 0 && !searchLower;
          const bookingUrl =
            typeof window !== 'undefined' ? `${window.location.origin}/book/${slug}` : '';
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              className="flex flex-col items-center text-center py-16 space-y-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.04]">
                <CalendarDays size={22} strokeWidth={1.5} className="text-muted-foreground/60" />
              </div>
              <p className={H2} style={TITLE_FONT}>
                {isFresh
                  ? 'No tours booked yet'
                  : `No ${tab === 'all' ? '' : tab + ' '}tours${searchLower ? ' match' : ''}`}
              </p>
              <p className={`${BODY_MUTED} max-w-sm`}>
                {isFresh
                  ? 'Share your booking link and tour requests will land right here.'
                  : searchLower
                    ? 'Try a shorter search, or switch tabs.'
                    : 'Nothing here for this view yet.'}
              </p>
              {isFresh && bookingUrl && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(bookingUrl);
                    toast.success('Booking link copied.');
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-4 h-9 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
                >
                  <Copy size={14} />
                  Copy booking link
                </button>
              )}
            </motion.div>
          );
        })()
      ) : tab !== 'availability' ? (
        view === 'table' ? (
          /* ── Table view ── */
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className={cn('text-left px-4 py-3', SECTION_LABEL)}>Guest</th>
                    <th className={cn('text-left px-4 py-3 hidden sm:table-cell', SECTION_LABEL)}>Date & Time</th>
                    <th className={cn('text-left px-4 py-3 hidden md:table-cell', SECTION_LABEL)}>Property</th>
                    <th className={cn('text-left px-4 py-3', SECTION_LABEL)}>Status</th>
                    <th className={cn('text-left px-4 py-3 hidden lg:table-cell', SECTION_LABEL)}>Contact</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filtered.map((tour, i) => {
                    const { date, time } = formatDateTime(tour.startsAt);
                    const endTime = formatDateTime(tour.endsAt).time;
                    const dur = getDuration(tour.startsAt, tour.endsAt);
                    const isPast = new Date(tour.startsAt) < now;

                    return (
                      <motion.tr
                        key={tour.id}
                        initial={reduced ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduced
                            ? undefined
                            : { duration: DURATION_FAST, ease: EASE_OUT, delay: Math.min(i, 12) * 0.025 }
                        }
                        className={cn(
                          'group hover:bg-muted/30 transition-colors',
                          isPast && tour.status !== 'completed' && 'opacity-70',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{tour.guestName}</p>
                            <p className="text-xs text-muted-foreground">{tour.guestEmail}</p>
                            {tour.guestPhone && (
                              <p className="text-xs text-muted-foreground sm:hidden">{tour.guestPhone}</p>
                            )}
                            {/* Show date on mobile since the date column is hidden */}
                            <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{date} {time}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-sm">{date}</p>
                          <p className="text-xs text-muted-foreground">{time} – {endTime} ({dur} min)</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                          {tour.propertyAddress ? (
                            <span className="flex items-center gap-1"><MapPin size={10} /> {tour.propertyAddress}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={tour.status} />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs">
                          {tour.Contact ? (
                            <a
                              href={`/s/${slug}/contacts/${tour.Contact.id}`}
                              className="text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {tour.Contact.name}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <button
                              onClick={() => setActionMenuId(actionMenuId === tour.id ? null : tour.id)}
                              disabled={updatingId === tour.id || convertingId === tour.id}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              {updatingId === tour.id ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
                            </button>
                            {actionMenuId === tour.id && (
                              <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-card shadow-lg dark:shadow-none py-1">
                                {tour.status === 'scheduled' && (
                                  <button onClick={() => updateStatus(tour.id, 'confirmed')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                    Confirm
                                  </button>
                                )}
                                {(tour.status === 'scheduled' || tour.status === 'confirmed') && (
                                  <>
                                    <button onClick={() => updateStatus(tour.id, 'completed')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                      Mark Completed
                                    </button>
                                    <button onClick={() => updateStatus(tour.id, 'no_show')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                      Mark No-Show
                                    </button>
                                    <button onClick={() => updateStatus(tour.id, 'cancelled')} className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-accent transition-colors">
                                      Cancel Tour
                                    </button>
                                  </>
                                )}
                                {(tour.status === 'completed' || tour.status === 'confirmed') && !tour.sourceDealId && (
                                  <button
                                    onClick={() => { setActionMenuId(null); convertToDeal(tour.id); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5"
                                  >
                                    <Briefcase size={11} />
                                    {convertingId === tour.id ? 'Creating...' : 'Create Deal'}
                                  </button>
                                )}
                                {tour.sourceDealId && (
                                  <a
                                    href={`/s/${slug}/deals/${tour.sourceDealId}`}
                                    className="w-full block text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground"
                                  >
                                    View Deal
                                  </a>
                                )}
                                {tour.status === 'cancelled' && (
                                  <button onClick={() => updateStatus(tour.id, 'scheduled')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                    Reschedule
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Card view — premium expandable agenda rows ── */
          <div className="space-y-3">
          {filtered.map((tour, i) => {
            const { date, time } = formatDateTime(tour.startsAt);
            const endTime = formatDateTime(tour.endsAt).time;
            const dur = getDuration(tour.startsAt, tour.endsAt);
            const isPast = new Date(tour.startsAt) < now;
            const isExpanded = expandedCardId === tour.id;
            // The row earns an expand affordance only when there's something
            // worth revealing — notes, a linked contact, or the lifecycle
            // timeline. Cancelled tours collapse the timeline noise.
            const hasDetail = Boolean(tour.notes) || Boolean(tour.Contact) || tour.status !== 'cancelled';

            return (
              <Expandable
                key={tour.id}
                expanded={isExpanded}
                onToggle={() => setExpandedCardId(isExpanded ? null : tour.id)}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduced
                    ? undefined
                    : { duration: DURATION_BASE, ease: EASE_OUT, delay: Math.min(i, 12) * 0.03 }
                }
                className={cn(
                  'group relative rounded-xl border bg-card p-4 transition-colors duration-200',
                  isExpanded ? 'border-border bg-foreground/[0.015]' : 'border-border/80 hover:border-border hover:bg-foreground/[0.012]',
                  isPast && tour.status !== 'completed' && 'opacity-70',
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Date/time column */}
                  <div className="flex items-center gap-3 sm:min-w-[180px]">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 transition-colors group-hover:bg-foreground/[0.06]">
                      <CalendarDays size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium tabular-nums">{date}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {time} – {endTime} ({dur} min)
                      </p>
                    </div>
                  </div>

                  {/* Guest info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{tour.guestName}</span>
                      <StatusChip status={tour.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail size={11} /> {tour.guestEmail}</span>
                      {tour.guestPhone && <span className="flex items-center gap-1"><Phone size={11} /> {tour.guestPhone}</span>}
                      {tour.propertyAddress && <span className="flex items-center gap-1"><MapPin size={11} /> {tour.propertyAddress}</span>}
                    </div>

                    {/* Expandable detail — notes, linked contact, the lifecycle
                     *  timeline, and feedback live here so the resting row stays
                     *  calm. ExpandableContent spring-animates its own height. */}
                    {hasDetail && (
                      <ExpandableContent
                        preset="fade"
                        keepMounted={false}
                        className="-mx-0.5"
                      >
                        <div className="space-y-2 pt-2">
                          {tour.notes && (
                            <p className="text-xs text-muted-foreground/80 italic">{tour.notes}</p>
                          )}
                          {tour.Contact && (
                            <a
                              href={`/s/${slug}/contacts/${tour.Contact.id}`}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              Linked: {tour.Contact.name}
                            </a>
                          )}
                          <div className="flex items-center gap-3">
                            <TourTimeline
                              status={tour.status}
                              createdAt={tour.createdAt}
                              startsAt={tour.startsAt}
                              googleEventId={tour.googleEventId}
                              sourceDealId={tour.sourceDealId}
                            />
                            <TourFeedbackBadge tourId={tour.id} slug={slug} status={tour.status} />
                          </div>
                        </div>
                      </ExpandableContent>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 sm:flex-shrink-0 relative">
                    {/* Expand toggle — chevron rotates 180° when open. Only
                     *  rendered when there's detail to reveal. */}
                    {hasDetail && (
                      <button
                        type="button"
                        onClick={() => setExpandedCardId(isExpanded ? null : tour.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Hide tour detail' : 'Show tour detail'}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <motion.span
                          animate={reduced ? undefined : { rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                          className="flex"
                        >
                          <ChevronDown size={15} />
                        </motion.span>
                      </button>
                    )}
                    {!isPast && tour.status !== 'cancelled' && (
                      <TourPrepCard tourId={tour.id} />
                    )}
                    {hasGoogleCalendar && !tour.googleEventId && tour.status !== 'cancelled' && (
                      <button
                        onClick={() => syncToGcal(tour.id)}
                        disabled={syncingId === tour.id}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border border-border hover:bg-accent transition-colors disabled:opacity-50"
                        title="Sync to Google Calendar"
                      >
                        {syncingId === tour.id ? <Loader2 size={12} className="animate-spin" /> : <CalendarPlus size={12} />}
                        Sync
                      </button>
                    )}
                    {tour.googleEventId && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <Check size={10} /> Synced
                      </span>
                    )}

                    <div className="relative">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === tour.id ? null : tour.id)}
                        disabled={updatingId === tour.id || convertingId === tour.id}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {updatingId === tour.id ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
                      </button>
                      {actionMenuId === tour.id && (
                        <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-card shadow-lg dark:shadow-none py-1">
                          {tour.status === 'scheduled' && (
                            <button onClick={() => updateStatus(tour.id, 'confirmed')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                              Confirm
                            </button>
                          )}
                          {(tour.status === 'scheduled' || tour.status === 'confirmed') && (
                            <>
                              <button onClick={() => updateStatus(tour.id, 'completed')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                Mark Completed
                              </button>
                              <button onClick={() => updateStatus(tour.id, 'no_show')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                                Mark No-Show
                              </button>
                              <button onClick={() => updateStatus(tour.id, 'cancelled')} className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-accent transition-colors">
                                Cancel Tour
                              </button>
                            </>
                          )}
                          {(tour.status === 'completed' || tour.status === 'confirmed') && !tour.sourceDealId && (
                            <button
                              onClick={() => { setActionMenuId(null); convertToDeal(tour.id); }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5"
                            >
                              <Briefcase size={11} />
                              {convertingId === tour.id ? 'Creating...' : 'Create Deal'}
                            </button>
                          )}
                          {tour.sourceDealId && (
                            <a
                              href={`/s/${slug}/deals/${tour.sourceDealId}`}
                              className="w-full block text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors text-foreground"
                            >
                              View Deal
                            </a>
                          )}
                          {tour.status === 'cancelled' && (
                            <button onClick={() => updateStatus(tour.id, 'scheduled')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                              Reschedule
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Expandable>
            );
          })}
        </div>
        )
      ) : null}
    </div>
  );
}
