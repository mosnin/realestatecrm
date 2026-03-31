'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, Phone, Mail, Briefcase } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// ── Types ────────────────────────────────────────────────────────────────────

interface Tour {
  id: string;
  guestName: string;
  guestEmail: string | null;
  propertyAddress: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface ContactFollowUp {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  followUpAt: string;
}

interface DealFollowUp {
  id: string;
  title: string;
  followUpAt: string;
}

interface CalendarViewProps {
  slug: string;
  tours: Tour[];
  contactFollowUps: ContactFollowUp[];
  dealFollowUps: DealFollowUp[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({
  slug,
  tours,
  contactFollowUps,
  dealFollowUps,
}: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(today));

  // Build lookup maps by date key
  const toursByDate = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      const key = toDateKey(new Date(t.startsAt));
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tours]);

  const contactsByDate = useMemo(() => {
    const map = new Map<string, ContactFollowUp[]>();
    for (const c of contactFollowUps) {
      const key = toDateKey(new Date(c.followUpAt));
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [contactFollowUps]);

  const dealsByDate = useMemo(() => {
    const map = new Map<string, DealFollowUp[]>();
    for (const d of dealFollowUps) {
      const key = toDateKey(new Date(d.followUpAt));
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }, [dealFollowUps]);

  // Calendar grid computation
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const startDow = firstDayOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // We need leading blanks for days before the 1st
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Trailing blanks to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = toDateKey(today);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  // Selected day events
  const selectedTours = selectedDate ? toursByDate.get(selectedDate) ?? [] : [];
  const selectedContacts = selectedDate ? contactsByDate.get(selectedDate) ?? [] : [];
  const selectedDeals = selectedDate ? dealsByDate.get(selectedDate) ?? [] : [];
  const hasSelectedEvents = selectedTours.length + selectedContacts.length + selectedDeals.length > 0;

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-0">
          {/* Header row */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) {
                return (
                  <div
                    key={`blank-${idx}`}
                    className="h-12 md:h-20 border-b border-r border-border last:border-r-0"
                  />
                );
              }

              const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;
              const hasTours = toursByDate.has(dateKey);
              const hasContacts = contactsByDate.has(dateKey);
              const hasDeals = dealsByDate.has(dateKey);

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  className={`
                    h-12 md:h-20 border-b border-r border-border p-1 md:p-2
                    text-left transition-colors relative
                    hover:bg-muted/30
                    ${isSelected ? 'bg-primary/5 border-primary/30' : ''}
                  `}
                >
                  <span
                    className={`
                      inline-flex items-center justify-center text-sm
                      ${isToday ? 'w-7 h-7 rounded-full ring-2 ring-primary text-primary font-semibold' : ''}
                    `}
                  >
                    {day}
                  </span>
                  {/* Event dots */}
                  {(hasTours || hasContacts || hasDeals) && (
                    <div className="flex gap-1 mt-0.5 md:mt-1">
                      {hasTours && (
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      )}
                      {hasContacts && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      )}
                      {hasDeals && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Tours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Contact follow-ups
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500" /> Deal follow-ups
        </span>
      </div>

      {/* Day detail panel */}
      {selectedDate && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>

          {!hasSelectedEvents && (
            <p className="text-sm text-muted-foreground">
              No tours or follow-ups on this day.
            </p>
          )}

          {/* Tours */}
          {selectedTours.map((tour) => (
            <Card key={tour.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {tour.guestName}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        tour.status === 'confirmed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {tour.status}
                    </span>
                  </div>
                  {tour.propertyAddress && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {tour.propertyAddress}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatTime(tour.startsAt)} &ndash; {formatTime(tour.endsAt)}
                  </p>
                  <Link
                    href={`/s/${slug}/tours`}
                    className="text-xs text-primary hover:underline"
                  >
                    View tours &rarr;
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Contact follow-ups */}
          {selectedContacts.map((contact) => (
            <Card key={contact.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="font-medium text-sm">{contact.name}</span>
                  {contact.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </p>
                  )}
                  {contact.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </p>
                  )}
                  <Link
                    href={`/s/${slug}/contacts/${contact.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View contact &rarr;
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Deal follow-ups */}
          {selectedDeals.map((deal) => (
            <Card key={deal.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="font-medium text-sm flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {deal.title}
                  </span>
                  <Link
                    href={`/s/${slug}/deals/${deal.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View deal &rarr;
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
