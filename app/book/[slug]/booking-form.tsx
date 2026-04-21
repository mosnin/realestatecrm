'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Clock, Check, Loader2, ChevronLeft, ChevronRight, MapPin, Globe, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { fireConversionEvents } from '@/lib/tracking-events';

interface BookingFormProps {
  slug: string;
  duration: number;
  businessName: string;
  timezone: string;
  accentColor?: string;
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

export function BookingForm({ slug, duration: defaultDuration, businessName, timezone, accentColor = '#ff964f' }: BookingFormProps) {
  const confettiRef = useRef<ConfettiRef>(null);
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

  // Waitlist state
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistDate, setWaitlistDate] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  // Detect guest timezone
  const guestTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const showTzNote = guestTz && guestTz !== timezone;

  async function loadSlots(propId?: string | null, currentStep?: Step) {
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
        // Use the passed-in step to avoid stale closure on the state variable
        const stepAtLoad = currentStep ?? step;
        if (data.propertyProfiles?.length > 0 && !propId && stepAtLoad === 'date') {
          setProperties(data.propertyProfiles);
          setStep('property');
        }
      } else {
        setError('Could not load availability');
      }
    } catch {
      setError('Could not load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSlots(null, 'date'); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectProperty(id: string | null) {
    setSelectedPropertyId(id);
    if (id) {
      const prop = properties.find((p) => p.id === id);
      if (prop?.address) setPropertyAddress(prop.address);
    }
    setStep('date');
    loadSlots(id, 'date');
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
      // Fire tracking pixel conversion events on successful booking
      fireConversionEvents();
      setTimeout(() => {
        confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        confettiRef.current?.fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
        confettiRef.current?.fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
      }, 300);
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

  async function handleWaitlistSubmit() {
    if (!waitlistName.trim() || !waitlistEmail.trim() || !waitlistDate) return;
    setWaitlistSubmitting(true);
    try {
      const res = await fetch('/api/tours/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          guestName: waitlistName.trim(),
          guestEmail: waitlistEmail.trim(),
          preferredDate: waitlistDate,
          propertyProfileId: selectedPropertyId,
        }),
      });
      if (res.ok || res.status === 409) {
        setWaitlistDone(true);
      }
    } catch {
      // silent
    } finally {
      setWaitlistSubmitting(false);
    }
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
      <>
        <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
        <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-xl bg-white dark:bg-card border border-border/60 shadow-lg p-8 text-center space-y-4"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
          className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto"
        >
          <Check size={28} className="text-emerald-600" />
        </motion.div>
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
      </motion.div>
      </>
    );
  }

  // Step order for direction detection
  const stepOrder: Step[] = ['property', 'date', 'details'];
  const stepIdx = stepOrder.indexOf(step);

  function renderCurrentStep() {
    // Property selection step
    if (step === 'property' && properties.length > 0) {
      return (
        <div className="rounded-xl bg-white dark:bg-card border border-border/60 shadow-lg p-6 space-y-5">
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
        <div className="rounded-xl bg-white dark:bg-card border border-border/60 shadow-lg p-6 space-y-5">
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

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="guestName">Full Name <span className="text-destructive">*</span></Label>
                <Input id="guestName" type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guestEmail">Email <span className="text-destructive">*</span></Label>
                <Input id="guestEmail" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="guestPhone">Phone</Label>
                <Input id="guestPhone" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propertyAddress">Property Address</Label>
                <Input id="propertyAddress" type="text" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="123 Main St, Apt 4B" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything we should know?" />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !guestName.trim() || !guestEmail.trim()}
            className="w-full"
            size="lg"
            style={{ backgroundColor: accentColor, borderColor: accentColor }}
          >
            {submitting ? (
              <><Loader2 size={16} className="mr-2 animate-spin" /> Booking...</>
            ) : 'Confirm Booking'}
          </Button>
        </div>
      );
    }

    // Date + time selection step
    return (
      <div className="rounded-xl bg-white dark:bg-card border border-border/60 shadow-lg p-6 space-y-5">
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
          <div className="text-center py-6 space-y-4">
            <p className="text-sm text-muted-foreground">No available time slots right now.</p>
            {!showWaitlist && !waitlistDone && (
              <button
                type="button"
                onClick={() => setShowWaitlist(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-accent/30 transition-all"
              >
                <Bell size={14} />
                Join Waitlist
              </button>
            )}
            {showWaitlist && !waitlistDone && (
              <div className="text-left space-y-3 max-w-sm mx-auto">
                <p className="text-xs text-muted-foreground">Get notified when a slot opens up.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="waitlistDate">Preferred date</Label>
                  <Input id="waitlistDate" type="date" value={waitlistDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setWaitlistDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="waitlistName">Your name</Label>
                  <Input id="waitlistName" type="text" value={waitlistName} onChange={(e) => setWaitlistName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="waitlistEmail">Your email</Label>
                  <Input id="waitlistEmail" type="email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <Button onClick={handleWaitlistSubmit} disabled={waitlistSubmitting || !waitlistName.trim() || !waitlistEmail.trim() || !waitlistDate} className="w-full" style={{ backgroundColor: accentColor, borderColor: accentColor }}>
                  {waitlistSubmitting ? 'Joining...' : 'Join Waitlist'}
                </Button>
              </div>
            )}
            {waitlistDone && (
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
                <Check size={16} />
                You&apos;re on the waitlist! We&apos;ll notify you when a slot opens.
              </div>
            )}
          </div>
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
                        ? 'font-semibold'
                        : 'border-border hover:bg-accent/30'
                    )}
                    style={selectedDate === s.date ? { borderColor: accentColor, backgroundColor: `${accentColor}15`, color: accentColor } : {}}
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
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                  {selectedDaySlots.times.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-sm transition-all',
                        selectedTime === t
                          ? 'text-white font-semibold'
                          : 'border-border hover:bg-accent/30'
                      )}
                      style={selectedTime === t ? { borderColor: accentColor, backgroundColor: accentColor } : {}}
                    >
                      {formatTime(t)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTime && (
              <Button onClick={() => setStep('details')} className="w-full" size="lg" style={{ backgroundColor: accentColor, borderColor: accentColor }}>
                Continue
                <ChevronRight size={16} className="ml-1" />
              </Button>
            )}
          </>
        )}

        {error && <p className="text-xs text-destructive text-center">{error}</p>}
      </div>
    );
  }

  return (
    <>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -40, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        {renderCurrentStep()}
      </motion.div>
    </AnimatePresence>

    {/* Processing overlay */}
    <AnimatePresence>
      {submitting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="rounded-2xl bg-card border border-border shadow-xl p-8 text-center space-y-3"
          >
            <Loader2 size={28} className="animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium text-foreground">Processing your booking...</p>
            <p className="text-xs text-muted-foreground">This will only take a moment</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
