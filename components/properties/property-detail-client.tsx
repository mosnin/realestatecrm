'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Pencil, Trash2, ExternalLink, Briefcase, CalendarDays, Share2,
  BedDouble, Bath, Ruler, Tag, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property, AreaReport } from '@/lib/types';
import { formatCurrency, formatCompact } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
import { SECTION_LABEL, TITLE_FONT, H3 } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button } from '@/components/ui/button';
import { PropertyForm } from './property-form';
import { PropertyShareDialog } from './property-share-dialog';
import { PropertyStatusBadge } from './property-status-badge';
import { PropertyGallery } from './property-gallery';
import { PropertyAnalysisPanel } from './property-analysis-panel';
import { PropertyAreaPanel } from './property-area-panel';

interface Props {
  slug: string;
  initial: Property;
  /** Pre-loaded area report for this property's neighborhood, when one exists. */
  initialAreaReport?: AreaReport | null;
  linkedDeals: { id: string; title: string; status: string; value: number | null; closeDate: string | null }[];
  linkedTours: { id: string; guestName: string; startsAt: string; status: string }[];
}

export function PropertyDetailClient({ slug, initial, initialAreaReport, linkedDeals, linkedTours }: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [property, setProperty] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function save(values: Partial<Property>) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't save that. Try again.");
        return;
      }
      const updated: Property = await res.json();
      setProperty(updated);
      setEditing(false);
      toast.success('Saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this property? Linked deals and tours stay intact.')) return;
    const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error("Couldn't delete that property."); return; }
    toast.success('Deleted.');
    router.push(`/s/${slug}/properties`);
  }

  const addr = formatPropertyAddress(property);
  const facts = formatPropertyFacts(property);

  if (editing) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <h1 className={cn(H3, 'mb-4')}>Edit property</h1>
        <PropertyForm
          initial={property}
          onCancel={() => setEditing(false)}
          onSubmit={save}
          submitting={submitting}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  const numericStats = [
    property.beds != null
      ? { icon: BedDouble, value: property.beds, label: property.beds === 1 ? 'Bed' : 'Beds' }
      : null,
    property.baths != null
      ? { icon: Bath, value: property.baths, label: property.baths === 1 ? 'Bath' : 'Baths' }
      : null,
    property.squareFeet != null
      ? { icon: Ruler, value: property.squareFeet, label: 'Sq ft', fmt: (n: number) => Math.round(n).toLocaleString() }
      : null,
    property.listPrice != null
      ? { icon: Tag, value: property.listPrice, label: 'List price', fmt: formatCompact }
      : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="space-y-8">
      {/* ── Cinematic header ────────────────────────────────────────────
          Real estate leads with the photo. The gallery shows the full set
          (stage + thumbnail rail), not just the cover. When no photo is on
          file: a calm 16:9 placeholder, same hairline frame. */}
      <PropertyGallery photos={property.photos} alt={addr} />

      {/* ── Title + status sentence ─────────────────────────────────────
          Page-level focal: serif Times h1 + status pill row. Same
          vocabulary as the contact detail page. */}
      <header className="space-y-2">
        <h1 className="text-3xl tracking-tight text-foreground" style={TITLE_FONT}>
          {addr}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <PropertyStatusBadge status={property.listingStatus} />
          {property.propertyType && (
            <span>· {property.propertyType.replace('_', ' ')}</span>
          )}
          {facts && <span>· {facts}</span>}
        </div>
      </header>

      {/* ── Glanceable key stats ────────────────────────────────────────
          The four numbers a buyer asks first — beds / baths / sq ft / price.
          Paper-flat, hairline-divided, focal numerals count up on entry.
          Same stat-strip vocabulary as the commissions page. Only rendered
          when there's at least one numeric fact to show. */}
      {numericStats.length > 0 && (
        <motion.dl
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className={cn(
            'grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70',
            numericStats.length >= 4
              ? 'grid-cols-2 sm:grid-cols-4'
              : numericStats.length === 3
                ? 'grid-cols-3'
                : numericStats.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-1',
          )}
        >
          {numericStats.map((s) => (
            <div key={s.label} className="bg-card p-4 sm:p-5">
              <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <s.icon size={12} strokeWidth={1.75} aria-hidden />
                {s.label}
              </dt>
              <dd className="mt-1.5 text-[25px] leading-none tracking-tight tabular-nums text-foreground" style={TITLE_FONT}>
                <AnimatedNumber value={s.value} format={s.fmt} />
              </dd>
            </div>
          ))}
        </motion.dl>
      )}

      {/* ── Secondary facts + listing/notes ──────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-6">
        {(property.yearBuilt != null || property.lotSizeSqft != null || property.mlsNumber) && (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {property.yearBuilt != null && <Fact label="Year built" value={String(property.yearBuilt)} />}
            {property.lotSizeSqft != null && <Fact label="Lot" value={`${property.lotSizeSqft.toLocaleString()} sqft`} />}
            {property.mlsNumber && <Fact label="MLS" value={property.mlsNumber} />}
          </dl>
        )}

        {property.listingUrl && (
          <a
            href={property.listingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            View listing <ExternalLink size={12} />
          </a>
        )}

        {property.notes && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {property.notes}
          </p>
        )}
      </section>

      {/* ── Action row ──────────────────────────────────────────────────
          Canonical Button components — outline for Share, default for
          Edit (primary), destructive for Delete. */}
      <div className="flex items-center justify-between border-t border-border/60 pt-6">
        <Button variant="destructive" size="sm" onClick={remove}>
          <Trash2 /> Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSharing(true)}>
            <Share2 /> Share
          </Button>
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        </div>
      </div>

      {/* ── Linked deals + tours ────────────────────────────────────────
          Below the facts, not in a sidebar. Section labels use the
          canonical SECTION_LABEL small-caps treatment. */}
      <div className="space-y-8 border-t border-border/60 pt-6">
        <LinkedSection
          title="Linked deals"
          icon={Briefcase}
          empty="No deals linked to this property yet."
          items={linkedDeals.map((d) => ({
            key: d.id,
            href: `/s/${slug}/deals/${d.id}`,
            primary: d.title,
            secondary: [
              d.status !== 'active' ? d.status : null,
              d.value != null ? formatCurrency(d.value) : null,
              d.closeDate ? `Closes ${new Date(d.closeDate).toLocaleDateString()}` : null,
            ].filter(Boolean).join(' · '),
          }))}
        />
        <LinkedSection
          title="Tours"
          icon={CalendarDays}
          empty="No tours have been scheduled here yet."
          items={linkedTours.map((t) => {
            const d = new Date(t.startsAt);
            return {
              key: t.id,
              href: `/s/${slug}/calendar`,
              primary: t.guestName,
              secondary: `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
            };
          })}
        />
      </div>

      {/* ── Web research / Analyze ──────────────────────────────────────
          Pulls real data about this address from the web, structures it with
          the LLM, and fills blank fields. Filled values flow back into the
          local property state so the facts above refresh immediately. */}
      <PropertyAnalysisPanel
        propertyId={property.id}
        initialAnalysis={property.analysis ?? null}
        initialAnalyzedAt={property.analyzedAt ?? null}
        onApplied={(updated) => setProperty((prev) => ({ ...prev, ...updated }))}
      />

      {/* ── Property IQ: area / neighborhood research ─────────────────────── */}
      <PropertyAreaPanel propertyId={property.id} initialReport={initialAreaReport ?? null} />

      {sharing && (
        <PropertyShareDialog
          propertyId={property.id}
          linkedDealIds={linkedDeals.map((d) => d.id)}
          origin={origin}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={cn(SECTION_LABEL, 'mb-0.5')}>{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function LinkedSection({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof Briefcase;
  items: { key: string; href: string; primary: string; secondary: string }[];
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-muted-foreground" aria-hidden />
        <h2 className={cn(SECTION_LABEL)}>{title}</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 py-3 -mx-2 px-2 rounded-md hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.primary}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.secondary}</p>
                </div>
                {/* Quiet directional cue — slides in a hair on hover so the
                    row reads as navigable without shouting. */}
                <ChevronRight
                  size={14}
                  aria-hidden
                  className="flex-shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
