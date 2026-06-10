'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Loader2, CalendarCheck, MessageSquare, ImageOff, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import { Label } from '@/components/ui/label';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { formatPropertyFacts } from '@/lib/properties';
import { PRIMARY_PILL } from '@/lib/typography';
import type { PropertyListingStatus } from '@/lib/types';

interface Props {
  slug: string;
  propertyId: string;
  address: string;
  photos: string[];
  listingStatus: PropertyListingStatus;
  facts: { beds: number | null; baths: number | null; squareFeet: number | null };
  priceLabel: string | null;
  notes: string | null;
  accentColor: string;
}

// Same paper-flat field vocabulary the booking form uses, so the inquiry form
// reads as one family with /book.
const FIELD_BASE =
  'w-full bg-background border border-border/70 rounded-md px-3 text-base focus:border-foreground/30 focus:outline-none transition-colors placeholder:text-muted-foreground/70';
const INPUT_CLASS = cn(FIELD_BASE, 'h-10');
const TEXTAREA_CLASS = cn(FIELD_BASE, 'py-2 min-h-[72px]');
const FIELD_LABEL = 'text-[12.5px] font-medium text-foreground';

export function PropertyStorefront({
  slug,
  propertyId,
  address,
  photos,
  listingStatus,
  facts,
  priceLabel,
  notes,
  accentColor,
}: Props) {
  const primaryTextColor = pickContrastColor(accentColor);
  const [leadIndex, setLeadIndex] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);

  const factsLine = [formatPropertyFacts(facts), priceLabel].filter(Boolean).join(' · ');
  const leadPhoto = photos[leadIndex] ?? photos[0] ?? null;

  return (
    <div className="space-y-7">
      {/* ── Photo gallery — the focal element ─────────────────────────────── */}
      {leadPhoto ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-foreground/[0.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={leadPhoto}
              src={leadPhoto}
              alt={address}
              loading="eager"
              decoding="async"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {photos.map((p, i) => {
                const active = i === leadIndex;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLeadIndex(i)}
                    aria-label={`View photo ${i + 1}`}
                    aria-current={active}
                    className={cn(
                      'h-16 w-20 flex-shrink-0 overflow-hidden rounded-md border transition-colors',
                      active
                        ? 'border-foreground/40 ring-2 ring-foreground/10'
                        : 'border-border/70 hover:border-foreground/30 opacity-80 hover:opacity-100',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <ImageOff size={22} className="mx-auto text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-foreground mt-2">No photos yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Reach out and we&apos;ll share more about this listing.</p>
        </div>
      )}

      {/* ── Status + facts ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PropertyStatusBadge status={listingStatus} />
        {factsLine && <span className="text-sm text-muted-foreground">{factsLine}</span>}
      </div>

      {/* ── Description ───────────────────────────────────────────────────── */}
      {notes && (
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{notes}</p>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {!showInquiry ? (
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <a
            href={`/book/${slug}?property=${encodeURIComponent(propertyId)}`}
            className={cn(PRIMARY_PILL, 'justify-center')}
            style={{ backgroundColor: accentColor, color: primaryTextColor }}
          >
            <CalendarCheck size={15} aria-hidden />
            Book a tour
          </a>
          <button
            type="button"
            onClick={() => setShowInquiry(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 h-9 border border-border/70 text-sm text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <MessageSquare size={15} aria-hidden />
            Ask about this property
          </button>
        </div>
      ) : (
        <InquiryForm
          slug={slug}
          propertyId={propertyId}
          accentColor={accentColor}
          primaryTextColor={primaryTextColor}
          onBack={() => setShowInquiry(false)}
        />
      )}
    </div>
  );
}

function InquiryForm({
  slug,
  propertyId,
  accentColor,
  primaryTextColor,
  onBack,
}: {
  slug: string;
  propertyId: string;
  accentColor: string;
  primaryTextColor: string;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/property-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          propertyId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          message: message.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-xl border border-border/70 bg-background p-6 text-center space-y-3"
      >
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check size={18} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm text-foreground">Sent. We&apos;ll be in touch about this listing.</p>
      </motion.div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-foreground">Ask about this property</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={12} />
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inq-name" className={FIELD_LABEL}>Full name</Label>
          <input id="inq-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inq-email" className={FIELD_LABEL}>Email</Label>
          <input id="inq-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className={INPUT_CLASS} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inq-phone" className={FIELD_LABEL}>
          Phone <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
        </Label>
        <input id="inq-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className={INPUT_CLASS} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inq-message" className={FIELD_LABEL}>
          Message <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea id="inq-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="What would you like to know?" className={TEXTAREA_CLASS} />
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !name.trim() || !email.trim()}
        className={cn(PRIMARY_PILL, 'w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed')}
        style={{ backgroundColor: accentColor, color: primaryTextColor }}
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {submitting ? 'Sending…' : 'Send inquiry'}
      </button>
    </div>
  );
}
