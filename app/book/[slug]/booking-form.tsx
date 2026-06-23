'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2, ChevronLeft, MapPin, Globe, Bell, ArrowRight, CalendarPlus } from 'lucide-react';
import { cn, formatPhoneAsTyped } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Label } from '@/components/ui/label';
import { fireConversionEvents } from '@/lib/tracking-events';
import { EASE_APPLE, EASE_OUT } from '@/lib/motion';
import { googleCalendarUrl, icsDataUri } from '@/lib/calendar-links';
import { QUIET_LINK, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

interface BookingFormProps {
  slug: string;
  duration: number;
  businessName: string;
  timezone: string;
  accentColor?: string;
  /** When set, the confirmed-state renders an outbound link back to the
   *  realtor's public page so the applicant has somewhere to go after
   *  booking. Same dead-end fix the intake success card has. */
  profileHref?: string | null;
  /** Focal serif heading for the page — the booking equivalent of the
   *  intake's active question (e.g. "Book a tour"). */
  pageTitle?: string;
  /** Calm one-line intro beneath the title. */
  pageIntro?: string;
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

// Inputs in the intake composer's vocabulary — rounded, soft, paper-flat.
const FIELD_BASE =
  'w-full bg-background/80 border border-border/70 rounded-2xl px-4 text-[15px] focus:border-foreground/40 focus:outline-none transition-colors placeholder:text-muted-foreground/50';
const INPUT_CLASS = cn(FIELD_BASE, 'h-11');
const TEXTAREA_CLASS = cn(FIELD_BASE, 'py-3 min-h-[80px]');
const FIELD_LABEL = 'text-[12.5px] font-medium text-foreground';

export function BookingForm({
  slug,
  duration: defaultDuration,
  businessName,
  timezone,
  accentColor = '#ff964f',
  profileHref,
  pageTitle = 'Book a tour',
  pageIntro,
}: BookingFormProps) {
  const reduce = useReducedMotion();
  const primaryTextColor = pickContrastColor(accentColor);
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

  // Shared accent-pill style — matches the intake's primary action button.
  const accentPillStyle = { backgroundColor: accentColor, color: primaryTextColor };
  const ACCENT_PILL =
    'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-7 text-sm font-semibold shadow-sm transition-all duration-150 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed';

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

  // ── Focal heading — the booking equivalent of the intake's active question.
  const Heading = (
    <div className="flex flex-col items-center text-center">
      <h1
        className="text-3xl leading-tight tracking-tight text-foreground sm:text-4xl"
        style={TITLE_FONT}
      >
        {pageTitle}
      </h1>
      {pageIntro && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {pageIntro}
        </p>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        {Heading}
        <div className="mt-10 flex justify-center">
          <Loader2 size={22} className="animate-spin" style={{ color: accentColor }} />
        </div>
      </div>
    );
  }

  if (step === 'confirmed') {
    const start = selectedTime ? new Date(selectedTime) : null;
    const dateLabel = start
      ? start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    const timeLabel = start ? formatTime(selectedTime!) : '';

    // Build the calendar links from what the guest just booked. The slot ISO
    // is the authoritative instant; effectiveDuration mirrors the server's
    // tour length so the event block matches the real appointment.
    const confirmedProperty = selectedPropertyId
      ? properties.find((p) => p.id === selectedPropertyId)
      : null;
    const locationForCal =
      (propertyAddress.trim() || confirmedProperty?.address || '').trim() || null;
    const calTitle = `Tour with ${businessName}`;
    const calDetails = `Your tour with ${businessName}.`;
    let gCalUrl: string | null = null;
    let icsUrl: string | null = null;
    if (start) {
      const end = new Date(start.getTime() + effectiveDuration * 60_000);
      const evt = { title: calTitle, start, end, location: locationForCal, details: calDetails };
      gCalUrl = googleCalendarUrl(evt);
      icsUrl = icsDataUri(evt);
    }

    return (
      <>
        <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE_APPLE }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={reduce ? undefined : { delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10"
          >
            <Check size={26} className="text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <h2 className="mt-5 text-3xl tracking-tight text-foreground sm:text-4xl" style={TITLE_FONT}>
            Confirmed.
          </h2>
          <p className="mt-3 max-w-sm text-base text-muted-foreground">
            Your tour is set for <span className="font-medium text-foreground">{dateLabel}</span>{' '}
            at <span className="font-medium text-foreground">{timeLabel}</span>.
            {` ${businessName} will reach out if anything changes.`}
          </p>

          {/* Add to calendar — the highest-value moment to capture the slot
              while it's fresh. Two routes cover every calendar app. */}
          {(gCalUrl || icsUrl) && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.35, duration: 0.3, ease: EASE_OUT }}
              className="mt-7 flex w-full max-w-xs flex-col items-center justify-center gap-2.5 sm:max-w-none sm:flex-row"
            >
              {gCalUrl && (
                <a
                  href={gCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(ACCENT_PILL, 'w-full sm:w-auto')}
                  style={accentPillStyle}
                >
                  <CalendarPlus size={15} aria-hidden />
                  Add to Google Calendar
                </a>
              )}
              {icsUrl && (
                <a
                  href={icsUrl}
                  download="tour.ics"
                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-border/70 px-5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground sm:w-auto"
                >
                  Apple / Outlook
                </a>
              )}
            </motion.div>
          )}

          {profileHref && (
            <div className="mt-6">
              <Link
                href={profileHref}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                See {businessName}&apos;s page
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          )}
        </motion.div>
      </>
    );
  }

  // Visual sections render progressively. The state machine is preserved:
  // - 'property' lock: only the property section is interactive
  // - 'date' lock: property is summarized + collapsed; date+time is open
  // - 'details' lock: above are summarized; details form is open
  const showProperty = properties.length > 0;
  const propertyChosen = step === 'date' || step === 'details';
  const showDateSection = step === 'date' || step === 'details';
  const showDetailsSection = step === 'details';

  const selectedProperty = selectedPropertyId
    ? properties.find((p) => p.id === selectedPropertyId)
    : null;

  return (
    <>
      {Heading}

      {/* Lifted panel holding the booking controls — sits on the immersive
          warm canvas the same way the intake's choice cards do, so it reads
          as part of the experience, not a marooned widget. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: EASE_APPLE }}
        className="mt-10 text-left"
      >
        {/* ─── Property section ─────────────────────────────────────────── */}
        {showProperty && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <p className={SECTION_LABEL}>Property</p>
              {propertyChosen && (
                <button
                  type="button"
                  onClick={() => { setStep('property'); setSelectedPropertyId(null); }}
                  className={cn(QUIET_LINK, 'text-xs')}
                >
                  Change
                </button>
              )}
            </div>

            {step === 'property' ? (
              <div className="space-y-2.5">
                {properties.map((p) => {
                  const active = selectedPropertyId === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileTap={reduce ? undefined : { scale: 0.99 }}
                      onClick={() => selectProperty(p.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150',
                        active
                          ? 'border-foreground/30 bg-foreground/[0.04] ring-2 ring-foreground/10'
                          : 'border-border/70 hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
                      )}
                    >
                      <MapPin size={16} className="flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                        {p.address && <p className="truncate text-xs text-muted-foreground">{p.address}</p>}
                      </div>
                    </motion.button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => selectProperty(null)}
                  className="w-full rounded-2xl border border-dashed border-border/70 px-4 py-3.5 text-center text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.04]"
                >
                  Not sure yet / general inquiry
                </button>
              </div>
            ) : (
              <p className="text-sm text-foreground">
                {selectedProperty ? (
                  <>
                    <span className="font-medium">{selectedProperty.name}</span>
                    {selectedProperty.address && (
                      <span className="text-muted-foreground"> · {selectedProperty.address}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">General inquiry</span>
                )}
              </p>
            )}
          </section>
        )}

        {/* Divider only between sections that are both visible */}
        {showProperty && showDateSection && (
          <div className="my-9 border-t border-border/40" />
        )}

        {/* ─── Date + time section ──────────────────────────────────────── */}
        {showDateSection && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <p className={SECTION_LABEL}>Pick a time</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{effectiveDuration} min</span>
                {showTzNote && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Globe size={11} />
                    {formatTzShort(guestTz)}
                  </span>
                )}
                {step === 'details' && (
                  <button
                    type="button"
                    onClick={() => setStep('date')}
                    className={cn(QUIET_LINK, 'text-xs')}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {step === 'details' ? (
              <p className="text-sm text-foreground">
                <span className="font-medium">{selectedDate && formatDate(selectedDate)}</span>
                <span className="text-muted-foreground"> at </span>
                <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
              </p>
            ) : slots.length === 0 ? (
              <div className="space-y-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No available time slots right now.</p>
                {!showWaitlist && !waitlistDone && (
                  <button
                    type="button"
                    onClick={() => setShowWaitlist(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm text-foreground transition-colors hover:bg-foreground/[0.04]"
                  >
                    <Bell size={14} />
                    Join waitlist
                  </button>
                )}
                {showWaitlist && !waitlistDone && (
                  <div className="mx-auto max-w-sm space-y-3 text-left">
                    <p className="text-xs text-muted-foreground">Get notified when a slot opens.</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistDate" className={FIELD_LABEL}>Preferred date</Label>
                      <input
                        id="waitlistDate"
                        type="date"
                        value={waitlistDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setWaitlistDate(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistName" className={FIELD_LABEL}>Your name</Label>
                      <input
                        id="waitlistName"
                        type="text"
                        value={waitlistName}
                        onChange={(e) => setWaitlistName(e.target.value)}
                        placeholder="Jane Smith"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="waitlistEmail" className={FIELD_LABEL}>Your email</Label>
                      <input
                        id="waitlistEmail"
                        type="email"
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleWaitlistSubmit}
                      disabled={waitlistSubmitting || !waitlistName.trim() || !waitlistEmail.trim() || !waitlistDate}
                      className={cn(ACCENT_PILL, 'w-full')}
                      style={accentPillStyle}
                    >
                      {waitlistSubmitting && <Loader2 size={14} className="animate-spin" />}
                      {waitlistSubmitting ? 'Joining…' : 'Join waitlist'}
                    </button>
                  </div>
                )}
                {waitlistDone && (
                  <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check size={16} />
                    You&apos;re on the waitlist. We&apos;ll let you know.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Date strip — lifted pills; active uses the realtor accent. */}
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {slots.map((s) => {
                    const active = selectedDate === s.date;
                    return (
                      <motion.button
                        key={s.date}
                        type="button"
                        whileTap={reduce ? undefined : { scale: 0.96 }}
                        onClick={() => { setSelectedDate(s.date); setSelectedTime(null); }}
                        className={cn(
                          'min-w-[74px] flex-shrink-0 rounded-2xl px-3 py-2.5 text-center transition-all duration-150',
                          active
                            ? 'text-white shadow-sm'
                            : 'bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.07]',
                        )}
                        style={active ? { backgroundColor: accentColor, color: primaryTextColor } : undefined}
                      >
                        <div className="text-[10px] uppercase tracking-wider opacity-70">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })}
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(s.date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {selectedDate && selectedDaySlots && (
                    <motion.div
                      key={selectedDate}
                      initial={reduce ? false : 'initial'}
                      animate="enter"
                      variants={
                        reduce
                          ? undefined
                          : { enter: { transition: { staggerChildren: 0.018 } } }
                      }
                      className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
                    >
                      {selectedDaySlots.times.map((t) => {
                        const active = selectedTime === t;
                        return (
                          <motion.button
                            key={t}
                            type="button"
                            variants={
                              reduce
                                ? undefined
                                : {
                                    initial: { opacity: 0, y: 4 },
                                    enter: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
                                  }
                            }
                            whileTap={reduce ? undefined : { scale: 0.96 }}
                            onClick={() => setSelectedTime(t)}
                            className={cn(
                              'h-10 rounded-xl px-3 text-sm transition-all duration-150',
                              active
                                ? 'font-medium text-white shadow-sm'
                                : 'bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.07]',
                            )}
                            style={active ? { backgroundColor: accentColor, color: primaryTextColor } : undefined}
                          >
                            {formatTime(t)}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {selectedTime && (
                    <motion.button
                      type="button"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: 8 }}
                      transition={{ duration: 0.24, ease: EASE_APPLE }}
                      onClick={() => setStep('details')}
                      className={cn(ACCENT_PILL, 'w-full')}
                      style={accentPillStyle}
                    >
                      Continue
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </section>
        )}

        {/* ─── Details section ──────────────────────────────────────────── */}
        {showDetailsSection && (
          <>
            <div className="my-9 border-t border-border/40" />
            <motion.section
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE_APPLE }}
            >
              <div className="mb-4 flex items-center justify-between">
                <p className={SECTION_LABEL}>Your details</p>
                <button
                  type="button"
                  onClick={() => setStep('date')}
                  className={cn(QUIET_LINK, 'inline-flex items-center gap-1 text-xs')}
                >
                  <ChevronLeft size={12} />
                  Back
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="guestName" className={FIELD_LABEL}>
                      Full name
                    </Label>
                    <input
                      id="guestName"
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Smith"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="guestEmail" className={FIELD_LABEL}>
                      Email
                    </Label>
                    <input
                      id="guestEmail"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="guestPhone" className={FIELD_LABEL}>
                      Phone <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <input
                      id="guestPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(formatPhoneAsTyped(e.target.value))}
                      placeholder="(555) 123-4567"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="propertyAddress" className={FIELD_LABEL}>
                      Property address <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <input
                      id="propertyAddress"
                      type="text"
                      value={propertyAddress}
                      onChange={(e) => setPropertyAddress(e.target.value)}
                      placeholder="123 Main St"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className={FIELD_LABEL}>
                    Notes <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Anything we should know?"
                    className={TEXTAREA_CLASS}
                  />
                </div>
              </div>

              {error && (
                <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !guestName.trim() || !guestEmail.trim()}
                className={cn(ACCENT_PILL, 'mt-6 w-full')}
                style={accentPillStyle}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Booking…' : 'Confirm booking'}
              </button>
            </motion.section>
          </>
        )}

        {/* Surface availability errors at the bottom of the picker step */}
        {error && step !== 'details' && (
          <p className="mt-4 text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </motion.div>

      {/* Processing overlay — kept minimal, paper-flat */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="space-y-3 rounded-3xl border border-border/70 bg-background p-6 text-center shadow-lg"
            >
              <Loader2 size={20} className="mx-auto animate-spin" style={{ color: accentColor }} />
              <p className="text-sm text-foreground">Booking your tour…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
