'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles, ExternalLink, Loader2, AlertTriangle, Info, RefreshCw, Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, timeAgo } from '@/lib/formatting';
import { SECTION_LABEL } from '@/lib/typography';
import { Button } from '@/components/ui/button';
import type { Property, PropertyAnalysis, AnalyzedFields, FieldSources } from '@/lib/types';

/** Apple ease-out cubic — entrances. */
const EASE_APPLE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type AnalyzeResponse =
  | { status: 'ok'; analysis: PropertyAnalysis; filled: string[]; property: Property }
  | { status: 'no_evidence'; analyzedAt: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; error: string };

interface Props {
  propertyId: string;
  /** Persisted prior analysis (if any) so the panel shows last result on load. */
  initialAnalysis: PropertyAnalysis | null;
  initialAnalyzedAt: string | null;
  /** Bubble the filled columns up so the parent can refresh the property facts. */
  onApplied?: (property: Property) => void;
}

export function PropertyAnalysisPanel({
  propertyId,
  initialAnalysis,
  initialAnalyzedAt,
  onApplied,
}: Props) {
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(initialAnalysis);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(initialAnalyzedAt);
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState<string[] | null>(null);
  const [noEvidence, setNoEvidence] = useState(false);
  const [filled, setFilled] = useState<string[]>([]);

  async function analyze() {
    setLoading(true);
    setNotConfigured(null);
    setNoEvidence(false);
    try {
      const res = await fetch(`/api/properties/${propertyId}/analyze`, { method: 'POST' });
      const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;

      if (!data) {
        toast.error("Couldn't analyze this property. Try again.");
        return;
      }

      if (data.status === 'not_configured') {
        setNotConfigured(data.missing);
        return;
      }
      if (data.status === 'error') {
        toast.error(data.error || 'Analysis failed. Try again.');
        return;
      }
      if (data.status === 'no_evidence') {
        setNoEvidence(true);
        setAnalyzedAt(data.analyzedAt);
        return;
      }

      // status === 'ok'
      setAnalysis(data.analysis);
      setAnalyzedAt(data.analysis.analyzedAt);
      setFilled(data.filled);
      if (data.filled.length > 0) {
        toast.success(
          `Analysis complete — filled ${data.filled.length} ${
            data.filled.length === 1 ? 'field' : 'fields'
          }.`,
        );
        onApplied?.(data.property);
      } else {
        toast.success('Analysis complete.');
      }
    } catch {
      toast.error('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const hasResult = analysis !== null;

  return (
    <section className="space-y-4 border-t border-border/60 pt-6">
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-muted-foreground" aria-hidden />
          <h2 className={cn(SECTION_LABEL)}>Analysis</h2>
          {analyzedAt && (
            <span className="text-[11px] text-muted-foreground">
              Analyzed {timeAgo(analyzedAt)}
            </span>
          )}
        </div>
        <Button size="sm" variant={hasResult ? 'outline' : 'default'} onClick={analyze} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="animate-spin" /> Researching…
            </>
          ) : hasResult ? (
            <>
              <RefreshCw /> Re-analyze
            </>
          ) : (
            <>
              <Sparkles /> Analyze
            </>
          )}
        </Button>
      </div>

      {/* ── Intro / empty hint (only before the first run) ─────────── */}
      {!hasResult && !loading && !notConfigured && !noEvidence && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Pull real data about this property from the web — listing details, sale history, public
          records, and neighborhood context — then fill in any blank fields automatically. Existing
          values you&apos;ve entered are never overwritten.
        </p>
      )}

      {/* ── Progress ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_APPLE }}
            className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
          >
            <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
            <div className="text-sm text-muted-foreground">
              Searching the web, reading listing &amp; record pages, and structuring the findings.
              This can take up to a minute.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Not configured ─────────────────────────────────────────── */}
      {notConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 text-amber-600 dark:text-amber-500" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-foreground">Web research isn&apos;t configured</p>
            <p className="text-muted-foreground mt-0.5">
              Property analysis needs{' '}
              {notConfigured.map((k, i) => (
                <span key={k}>
                  {i > 0 && (i === notConfigured.length - 1 ? ' and ' : ', ')}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{k}</code>
                </span>
              ))}{' '}
              set on the server. Ask your administrator to add{' '}
              {notConfigured.length === 1 ? 'this key' : 'these keys'}.
            </p>
          </div>
        </div>
      )}

      {/* ── No evidence found ──────────────────────────────────────── */}
      {noEvidence && !loading && (
        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <Info size={16} className="mt-0.5 text-muted-foreground" aria-hidden />
          <div className="text-sm text-muted-foreground">
            We couldn&apos;t find reliable public data for this exact address. Double-check the
            address (including city &amp; state) and try again.
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {hasResult && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_APPLE }}
            className="space-y-5"
          >
            {/* Summary */}
            {analysis.summary && (
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {analysis.summary}
              </p>
            )}

            {/* Which columns were just filled */}
            {filled.length > 0 && (
              <p className="text-xs text-emerald-700 dark:text-emerald-500">
                Filled blank fields: {filled.map(prettyField).join(', ')}.
              </p>
            )}

            {/* Structured fields */}
            <FieldsGrid fields={analysis.fields} sources={analysis.fieldSources} />

            {/* Extras that don't live in their own column */}
            <ExtrasList fields={analysis.fields} sources={analysis.fieldSources} />

            {/* Sources */}
            {analysis.sources.length > 0 && (
              <div className="space-y-2">
                <h3 className={cn(SECTION_LABEL)}>
                  Sources
                  <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {analysis.sources.length}
                  </span>
                </h3>
                <ul className="space-y-1">
                  {analysis.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline max-w-full"
                      >
                        <Link2 size={12} className="shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{s.title || s.url}</span>
                        <ExternalLink size={11} className="shrink-0 text-muted-foreground" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Field grid (numeric / enum columns) ──────────────────────────────────────

const GRID_FIELDS: Array<{ key: keyof AnalyzedFields; label: string; fmt: (v: unknown) => string }> = [
  { key: 'beds', label: 'Beds', fmt: (v) => String(v) },
  { key: 'baths', label: 'Baths', fmt: (v) => String(v) },
  { key: 'squareFeet', label: 'Sq ft', fmt: (v) => Number(v).toLocaleString() },
  { key: 'lotSizeSqft', label: 'Lot', fmt: (v) => `${Number(v).toLocaleString()} sqft` },
  { key: 'yearBuilt', label: 'Year built', fmt: (v) => String(v) },
  { key: 'propertyType', label: 'Type', fmt: (v) => String(v).replace(/_/g, ' ') },
  { key: 'listPrice', label: 'List price', fmt: (v) => formatCurrency(Number(v)) },
  { key: 'estimatedValue', label: 'Estimate', fmt: (v) => formatCurrency(Number(v)) },
  { key: 'lastSoldPrice', label: 'Last sold', fmt: (v) => formatCurrency(Number(v)) },
  { key: 'lastSoldDate', label: 'Sold date', fmt: (v) => String(v) },
];

function FieldsGrid({ fields, sources }: { fields: AnalyzedFields; sources: FieldSources }) {
  const shown = GRID_FIELDS.filter((f) => {
    const v = fields[f.key];
    return v !== null && v !== undefined && v !== '';
  });
  if (shown.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
      {shown.map((f) => {
        const src = sources[f.key];
        return (
          <div key={f.key}>
            <dt className={cn(SECTION_LABEL, 'mb-0.5')}>{f.label}</dt>
            <dd className="text-sm text-foreground flex items-center gap-1.5">
              <span className="tabular-nums">{f.fmt(fields[f.key])}</span>
              {src && (
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  title="View source"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink size={11} aria-hidden />
                </a>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── Extras (features, HOA, taxes, description) ────────────────────────────────

function ExtrasList({ fields, sources }: { fields: AnalyzedFields; sources: FieldSources }) {
  const hasExtras =
    fields.features.length > 0 || fields.hoaFee || fields.propertyTaxes || fields.description;
  if (!hasExtras) return null;

  return (
    <div className="space-y-3">
      {fields.description && (
        <div>
          <h3 className={cn(SECTION_LABEL, 'mb-1')}>Description</h3>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {fields.description}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {fields.hoaFee && <Inline label="HOA" value={fields.hoaFee} src={sources.hoaFee} />}
        {fields.propertyTaxes && (
          <Inline label="Taxes" value={fields.propertyTaxes} src={sources.propertyTaxes} />
        )}
      </div>

      {fields.features.length > 0 && (
        <div>
          <h3 className={cn(SECTION_LABEL, 'mb-1.5')}>Notable features</h3>
          <div className="flex flex-wrap gap-1.5">
            {fields.features.map((f, i) => (
              <span
                key={`${f}-${i}`}
                className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-0.5 text-xs text-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Inline({ label, value, src }: { label: string; value: string; src?: string }) {
  return (
    <div>
      <span className={cn(SECTION_LABEL)}>{label}</span>{' '}
      <span className="text-sm text-foreground">{value}</span>
      {src && (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          title="View source"
          className="ml-1 inline-flex text-muted-foreground hover:text-foreground transition-colors align-middle"
        >
          <ExternalLink size={11} aria-hidden />
        </a>
      )}
    </div>
  );
}

// ── Field-name prettifier for the "filled" toast/line ─────────────────────────

const FIELD_LABELS: Record<string, string> = {
  beds: 'beds',
  baths: 'baths',
  squareFeet: 'square feet',
  lotSizeSqft: 'lot size',
  yearBuilt: 'year built',
  propertyType: 'property type',
  listPrice: 'list price',
  listingUrl: 'listing link',
  photos: 'photos',
};

function prettyField(key: string): string {
  return FIELD_LABELS[key] ?? key;
}
