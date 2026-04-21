'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Clock,
  MapPin,
  User,
  XCircle,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostTourFeedback } from '@/components/tours/post-tour-feedback';

interface TourData {
  id: string;
  guestName: string;
  guestEmail: string;
  propertyAddress: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface TourManageClientProps {
  tour: TourData;
  token: string;
  businessName: string;
  bookingSlug: string;
}

export function TourManageClient({ tour, token, businessName, bookingSlug }: TourManageClientProps) {
  const [status, setStatus] = useState(tour.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCancelled = status === 'cancelled';
  const isPast = new Date(tour.startsAt) < new Date();
  const isCompleted = status === 'completed';

  async function cancelTour() {
    if (!confirm('Are you sure you want to cancel this tour?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tours/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'cancel' }),
      });
      if (res.ok) {
        setStatus('cancelled');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to cancel. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const start = new Date(tour.startsAt);
  const end = new Date(tour.endsAt);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl bg-white dark:bg-card border border-border/60 shadow-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Your Tour</h1>
          <p className="text-sm text-muted-foreground">
            with {businessName}
          </p>
        </div>

        {/* Status banner */}
        {isCancelled && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-center">
            <XCircle size={24} className="mx-auto text-red-500 mb-2" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Tour cancelled</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
              This tour has been cancelled. You can rebook below.
            </p>
          </div>
        )}

        {isCompleted && (
          <>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Tour completed</p>
            </div>
            <PostTourFeedback
              token={token}
              guestName={tour.guestName}
              businessName={businessName}
            />
          </>
        )}

        {/* Tour details */}
        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-3 text-sm">
            <User size={15} className="text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{tour.guestName}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CalendarDays size={15} className="text-muted-foreground flex-shrink-0" />
            <span>{start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock size={15} className="text-muted-foreground flex-shrink-0" />
            <span>
              {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ({duration} min)
            </span>
          </div>
          {tour.propertyAddress && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin size={15} className="text-muted-foreground flex-shrink-0" />
              <span>{tour.propertyAddress}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {!isCancelled && !isPast && !isCompleted && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={cancelTour}
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <XCircle size={16} className="mr-2" />}
              Cancel Tour
            </Button>
          )}

          {(isCancelled || isPast) && bookingSlug && (
            <a
              href={`/book/${bookingSlug}`}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <CalendarPlus size={16} />
              Book a New Tour
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Need help? Contact {businessName} directly.
        </p>
      </div>
    </div>
  );
}
