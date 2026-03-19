'use client';

import { useState, useCallback } from 'react';
import {
  CalendarDays,
  Clock,
  MapPin,
  User,
  Mail,
  Phone,
  ExternalLink,
  Check,
  X,
  Copy,
  MoreHorizontal,
  CalendarPlus,
  Loader2,
  Briefcase,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  Contact: { id: string; name: string; email: string | null; phone: string | null } | null;
}

interface ToursClientProps {
  slug: string;
  initialTours: Tour[];
  hasGoogleCalendar: boolean;
  bookingUrl: string;
}

const STATUS_CONFIG: Record<TourStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  no_show: { label: 'No Show', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

type FilterTab = 'upcoming' | 'past' | 'all';

export function ToursClient({ slug, initialTours, hasGoogleCalendar, bookingUrl }: ToursClientProps) {
  const [tours, setTours] = useState<Tour[]>(initialTours);
  const [tab, setTab] = useState<FilterTab>('upcoming');
  const [copied, setCopied] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const router = useRouter();

  const now = new Date();
  const filtered = tours.filter((t) => {
    const start = new Date(t.startsAt);
    if (tab === 'upcoming') return start >= now && t.status !== 'cancelled';
    if (tab === 'past') return start < now || t.status === 'completed';
    return true;
  });

  const upcomingCount = tours.filter((t) => new Date(t.startsAt) >= now && t.status !== 'cancelled').length;

  function copyLink() {
    const url = `${window.location.origin}${bookingUrl}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const updateStatus = useCallback(async (tourId: string, status: TourStatus) => {
    const res = await fetch(`/api/tours/${tourId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTours((prev) => prev.map((t) => (t.id === tourId ? { ...t, ...updated } : t)));
    }
    setActionMenuId(null);
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
      }
    } catch (err) {
      console.error('[Tours] Sync failed:', err);
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
        router.push(`/s/${slug}/deals/${data.deal.id}`);
      } else if (res.status === 409) {
        const data = await res.json();
        if (data.dealId) router.push(`/s/${slug}/deals/${data.dealId}`);
      }
    } catch (err) {
      console.error('[Tours] Convert failed:', err);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tours</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {upcomingCount} upcoming tour{upcomingCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            className="gap-2"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Booking Link'}
          </Button>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <ExternalLink size={14} />
            Preview
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['upcoming', 'past', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'upcoming' ? 'Upcoming' : t === 'past' ? 'Past' : 'All'}
          </button>
        ))}
      </div>

      {/* Tour list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <CalendarDays size={40} className="mx-auto opacity-30" />
          <p className="text-sm">No {tab === 'all' ? '' : tab + ' '}tours yet</p>
          <p className="text-xs">Share your booking link to start receiving tour requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tour) => {
            const { date, time } = formatDateTime(tour.startsAt);
            const endTime = formatDateTime(tour.endsAt).time;
            const dur = getDuration(tour.startsAt, tour.endsAt);
            const statusConf = STATUS_CONFIG[tour.status];
            const isPast = new Date(tour.startsAt) < now;

            return (
              <div
                key={tour.id}
                className={cn(
                  'relative rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/20',
                  isPast && tour.status !== 'completed' && 'opacity-70'
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Date/time column */}
                  <div className="flex items-center gap-3 sm:min-w-[180px]">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CalendarDays size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{date}</p>
                      <p className="text-xs text-muted-foreground">
                        {time} – {endTime} ({dur} min)
                      </p>
                    </div>
                  </div>

                  {/* Guest info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{tour.guestName}</span>
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', statusConf.color)}>
                        {statusConf.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail size={11} /> {tour.guestEmail}</span>
                      {tour.guestPhone && <span className="flex items-center gap-1"><Phone size={11} /> {tour.guestPhone}</span>}
                      {tour.propertyAddress && <span className="flex items-center gap-1"><MapPin size={11} /> {tour.propertyAddress}</span>}
                    </div>
                    {tour.notes && (
                      <p className="text-xs text-muted-foreground/80 italic mt-1">{tour.notes}</p>
                    )}
                    {tour.Contact && (
                      <a
                        href={`/s/${slug}/contacts/${tour.Contact.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        Linked: {tour.Contact.name}
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 sm:flex-shrink-0 relative">
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
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {actionMenuId === tour.id && (
                        <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-card shadow-lg py-1">
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
                              className="w-full block text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors text-primary"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
