'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, Clock, Check, Loader2, ChevronLeft, ChevronRight, MapPin, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingFormProps {
  slug: string;
  duration: number;
  businessName: string;
  timezone: string;
}

interface DaySlots {
  date: string;
  times: string[];
}

interface PropertyProfile {
  id: string;
  name: string;
  address: string | null;
  tourDuration: number;
}

type Step = 'property' | 'date' | 'details' | 'confirmed';

export function BookingForm({ slug, duration: defaultDuration, businessName, timezone }: BookingFormProps) {
  const [step, setStep] = useState<Step>('date');
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Property selection
  const [properties, setProperties] = useState<PropertyProfile[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [effectiveDuration, setEffectiveDuration] = useState(defaultDuration);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Detect guest timezone
  const guestTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const showTzNote = guestTz && guestTz !== timezone;

  async function loadSlots(propId?: string | null) {
    setLoading(true);
    setSelectedDate(null);
    setSelectedTime(null);
    try {
      let url = `/api/tours/available?slug=${encodeURIComponent(slug)}`;
      if (propId) url += `&propertyId=${encodeURIComponent(propId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots ?? []);
        setEffectiveDuration(data.duration ?? defaultDuration);
        // If properties exist and we haven't shown the property picker yet
        if (data.propertyProfiles?.length > 0 && !propId && step === 'date') {
          setProperties(data.propertyProfiles);
          setStep('property');
        }
      }
    } catch {
      setError('Could not load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSlots(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectProperty(id: string | null) {
    setSelectedPropertyId(id);
    if (id) {
      const prop = properties.find((p) => p.id === id);
      if (prop?.address) setPropertyAddress(prop.address);
    }
    setStep('date');
    loadSlots(id);
  }

  const selectedDaySlots = slots.find((s) => s.date === selectedDate);

  async function handleSubmit() {
    if (!selectedTime || !guestName.trim() || !guestEmail.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/tours/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim() || null,
          propertyAddress: propertyAddress.trim() || null,
          notes: notes.trim() || null,
          startsAt: selectedTime,
          propertyProfileId: selectedPropertyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Booking failed');
      }
      setStep('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTzShort(tz: string) {
    try {
      return new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || tz;
    } catch { return tz; }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 'confirmed') {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto">
          <Check size={28} className="text-emerald-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Tour Booked!</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Your tour is scheduled for{' '}
          <span className="font-medium text-foreground">
            {selectedTime && new Date(selectedTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>{' '}
          at{' '}
          <span className="font-medium text-foreground">
            {selectedTime && formatTime(selectedTime)}
          </span>.
          {businessName} will follow up with a confirmation.
        </p>
      </div>
    );
  }

  // Property selection step
  if (step === 'property' && properties.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <p className="text-xs font-medium text-muted-foreground">Which property are you interested in?</p>
        <div className="space-y-2">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProperty(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-left hover:border-primary/40 hover:bg-accent/30 transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
              </div>
              <ChevronRight size={16} className="ml-auto text-muted-foreground" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectProperty(null)}
            className="w-full px-4 py-3 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground hover:border-primary/40 hover:bg-accent/30 transition-all"
          >
            Not sure yet / General inquiry
          </button>
        </div>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <button
          type="button"
          onClick={() => setStep('date')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} />
          Back to calendar
        </button>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
          <CalendarDays size={16} className="text-primary" />
          <div className="text-sm">
            <span className="font-medium">{selectedDate && formatDate(selectedDate)}</span>
            <span className="text-muted-foreground"> at </span>
            <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
            <span className="text-muted-foreground"> ({effectiveDuration} min)</span>
          </div>
        </div>

        {showTzNote && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            <Globe size={13} />
            Times shown in your local timezone ({formatTzShort(guestTz)}).
            Agent is in {formatTzShort(timezone)}.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
            <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="jane@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
            <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Property Address</label>
            <input type="text" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="123 Main St, Apt 4B" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="Anything we should know?" />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !guestName.trim() || !guestEmail.trim()}
          className={cn(
            'w-full rounded-xl py-3 text-sm font-semibold transition-all',
            submitting || !guestName.trim() || !guestEmail.trim()
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Booking...</span>
          ) : 'Confirm Booking'}
        </button>
      </div>
    );
  }

  // Date + time selection step
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock size={14} />
          <span>{effectiveDuration}-minute tour</span>
        </div>
        {showTzNote && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Globe size={10} />
            {formatTzShort(guestTz)}
          </div>
        )}
      </div>

      {properties.length > 0 && (
        <button
          type="button"
          onClick={() => { setStep('property'); setSelectedPropertyId(null); }}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ChevronLeft size={12} />
          Change property
        </button>
      )}

      {slots.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No available time slots right now. Please check back later.</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Pick a date</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {slots.map((s) => (
                <button
                  key={s.date}
                  type="button"
                  onClick={() => { setSelectedDate(s.date); setSelectedTime(null); }}
                  className={cn(
                    'flex-shrink-0 px-3 py-2 rounded-xl border text-center transition-all min-w-[80px]',
                    selectedDate === s.date
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/40 hover:bg-accent/30'
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-70">
                    {new Date(s.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })}
                  </div>
                  <div className="text-sm font-medium">
                    {new Date(s.date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedDate && selectedDaySlots && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Pick a time</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {selectedDaySlots.times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTime(t)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-sm transition-all',
                      selectedTime === t
                        ? 'border-primary bg-primary text-primary-foreground font-semibold'
                        : 'border-border hover:border-primary/40 hover:bg-accent/30'
                    )}
                  >
                    {formatTime(t)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedTime && (
            <button
              onClick={() => setStep('details')}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
