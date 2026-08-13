'use client';

/**
 * /s/[slug]/cma — Comparative market analysis.
 *
 * One intent: a realtor builds a CMA from a subject property and the comps
 * already in their CRM, then hands a seller a public link. The builder is the
 * focal element; past reports sit below with a copy-link action.
 *
 * Design (Jobs lens): paper-flat, serif h1 + status sentence, one builder card,
 * a calm preview of the auto-selected comps + the computed range, a hairline-
 * divided list of past reports. Comps + valuation come from RentCast market
 * data (merged with the realtor's own Property rows); the preview labels which
 * source produced the numbers. A direct MLS feed is a future source, not wired
 * up yet.
 *
 * Build pass (Musk lens): the heavy lifting (comp selection, stats) lives in
 * lib/cma.ts and runs server-side on save. The client just collects the subject,
 * shows what came back, and persists. No duplicate logic here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { Reveal, SplitReveal, AnimatedNumber } from '@/components/motion';
import { toastSuccess, toastError, toastCopied } from '@/lib/toast-helpers';
import { formatCurrency } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  CAPTION,
  META,
} from '@/lib/typography';
import type { CmaPayload, CmaComp } from '@/lib/cma-types';
import { DATA_SOURCE_LABEL } from '@/lib/cma-types';
import { NarrativeSection } from '@/components/cma/narrative-section';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PropertyOption {
  id: string;
  address: string;
  city: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  listPrice: number | null;
}

interface CmaReport {
  id: string;
  subjectAddress: string;
  title: string | null;
  shareToken: string;
  status: 'draft' | 'published';
  createdAt: string;
  payload?: CmaPayload;
}

const TYPE_IT = '__type__';

function money(n: number | null | undefined): string {
  return n == null ? '—' : formatCurrency(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function compFacts(c: CmaComp): string {
  const parts: string[] = [];
  if (c.beds != null) parts.push(`${c.beds}bd`);
  if (c.baths != null) parts.push(`${c.baths}ba`);
  if (c.squareFeet != null) parts.push(`${c.squareFeet.toLocaleString()} sqft`);
  if (c.distanceMiles != null) parts.push(`${c.distanceMiles.toFixed(1)} mi`);
  return parts.join(' · ');
}

// ── Main view ────────────────────────────────────────────────────────────────

export function CmaView({ slug, initialAddress }: { slug: string; initialAddress?: string }) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [reports, setReports] = useState<CmaReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  // Subject input: either a saved property id, or typed fields. A property
  // page's "Run a CMA" handoff arrives with ?address= — start in typing mode
  // with the subject already filled so the realtor lands one click from Build.
  const [subjectId, setSubjectId] = useState<string>(initialAddress ? TYPE_IT : '');
  const [address, setAddress] = useState(initialAddress ?? '');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [sqft, setSqft] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [title, setTitle] = useState('');

  const [building, setBuilding] = useState(false);
  const [preview, setPreview] = useState<CmaReport | null>(null);

  const typing = subjectId === TYPE_IT || subjectId === '';

  // ── Load data ──────────────────────────────────────────────────────────────

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/cma?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setReports([]);
        return;
      }
      const data = (await res.json()) as { reports?: CmaReport[] };
      setReports(data.reports ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, [slug]);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const data = (await res.json()) as PropertyOption[];
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal: the realtor can still type a subject by hand.
    }
  }, [slug]);

  useEffect(() => {
    fetchReports();
    fetchProperties();
  }, [fetchReports, fetchProperties]);

  // ── Build (save) ─────────────────────────────────────────────────────────────

  const canBuild = useMemo(() => {
    if (subjectId && subjectId !== TYPE_IT) return true;
    return address.trim().length > 0;
  }, [subjectId, address]);

  const handleBuild = async () => {
    if (!canBuild) {
      toastError('Pick a subject property or enter an address.');
      return;
    }

    const body: Record<string, unknown> = { slug };
    if (title.trim()) body.title = title.trim();

    if (subjectId && subjectId !== TYPE_IT) {
      body.subjectPropertyId = subjectId;
    } else {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      body.subject = {
        address: address.trim(),
        beds: num(beds),
        baths: num(baths),
        squareFeet: num(sqft),
        listPrice: num(listPrice),
      };
    }

    setBuilding(true);
    try {
      const res = await fetch('/api/cma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { report?: CmaReport; error?: string };
      if (!res.ok || !data.report) {
        toastError(data.error ?? 'Could not build the analysis. Try again.');
        return;
      }
      setReports((prev) => [{ ...data.report } as CmaReport, ...prev]);
      setPreview(data.report);
      // Reset the builder so the next CMA starts clean.
      setSubjectId('');
      setAddress('');
      setBeds('');
      setBaths('');
      setSqft('');
      setListPrice('');
      setTitle('');
      toastSuccess('Analysis built — review the comps below.');
    } catch {
      toastError('Something went wrong. Try again.');
    } finally {
      setBuilding(false);
    }
  };

  // ── Per-report actions ───────────────────────────────────────────────────────

  const shareUrl = useCallback(
    (token: string) =>
      `${typeof window !== 'undefined' ? window.location.origin : ''}/cma/${token}`,
    [],
  );

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toastCopied('Share link copied');
    } catch {
      toastError('Could not copy the link.');
    }
  };

  const handlePublish = async (report: CmaReport) => {
    const next = report.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/cma/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, status: next }),
      });
      if (!res.ok) {
        toastError('Could not update the report.');
        return;
      }
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: next } : r)),
      );
      toastSuccess(next === 'published' ? 'Report published — link is live.' : 'Report unpublished.');
    } catch {
      toastError('Something went wrong. Try again.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/cma/${id}?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toastError('Could not delete the report.');
        return;
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (preview?.id === id) setPreview(null);
      toastSuccess('Report deleted.');
    } catch {
      toastError('Something went wrong. Try again.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main data-realtor-page="today" className="chippi-dashboard-canvas min-h-[calc(100vh-10rem)] max-w-3xl mx-auto pb-12 pt-3 sm:pt-5 space-y-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Comparative market analysis.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          <SplitReveal as="span" text="Price a home." />
        </h1>
        <p className={cn(BODY_MUTED)}>
          Pick a subject, and Chippi pulls real market comps and computes a range.
        </p>
      </header>

      {/* ── Builder ────────────────────────────────────────────────────── */}
      <Reveal variant="rise" className="chippi-dashboard-panel rounded-[1.75rem] px-5 py-5 sm:px-7 sm:py-7 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="cma-subject" className="text-sm font-medium text-foreground">
            Subject property
          </label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger id="cma-subject" className="w-full">
              <SelectValue placeholder="Pick a saved property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.address}
                  {p.city ? `, ${p.city}` : ''}
                </SelectItem>
              ))}
              <SelectItem value={TYPE_IT}>Type an address instead</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {typing && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="cma-address" className="text-sm font-medium text-foreground">
                Address
              </label>
              <Input
                id="cma-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Oakland"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Beds" value={beds} onChange={setBeds} placeholder="3" />
              <Field label="Baths" value={baths} onChange={setBaths} placeholder="2" />
              <Field label="Sqft" value={sqft} onChange={setSqft} placeholder="1,450" />
              <Field label="List price" value={listPrice} onChange={setListPrice} placeholder="750000" />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="cma-title" className="text-sm font-medium text-foreground">
            Report title <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            id="cma-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Market analysis for the Chen residence"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleBuild} disabled={building || !canBuild}>
            {building ? 'Building…' : 'Build analysis'}
          </Button>
        </div>
      </Reveal>

      {/* ── Preview ────────────────────────────────────────────────────── */}
      {preview?.payload && (
        <Reveal as="section" variant="rise" className="space-y-3">
          <p className={cn(SECTION_LABEL)}>Preview</p>

          {(preview.payload.dataSource === 'crm' || preview.payload.stats.insufficientData) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {preview.payload.dataSourceReason === 'rentcast_unconfigured'
                ? 'Market data isn’t connected, so this is based only on your own CRM listings — not real comparable sales. Set RENTCAST_API_KEY (and redeploy) to get accurate market values.'
                : preview.payload.dataSource === 'crm'
                  ? 'No market data was found for this address, so this is based only on your own CRM listings. Treat it as a rough internal reference, not a market valuation.'
                  : 'Not enough comparable data to stand behind this estimate yet — add more priced comparables or connect market data.'}
            </div>
          )}

          <div className="chippi-dashboard-panel rounded-[1.75rem] px-6 py-6 text-center space-y-1.5">
            <p className={cn(SECTION_LABEL)}>Suggested list-price range</p>
            {preview.payload.stats.suggestedLow != null &&
            preview.payload.stats.suggestedHigh != null ? (
              <p
                className="text-3xl tracking-tight text-foreground tabular-nums"
                style={TITLE_FONT}
              >
                <AnimatedNumber value={preview.payload.stats.suggestedLow} format={money} />
                {' – '}
                <AnimatedNumber value={preview.payload.stats.suggestedHigh} format={money} />
              </p>
            ) : (
              <p className={cn(BODY_MUTED)}>Add priced comparables to compute a range.</p>
            )}
            <p className={cn(CAPTION)}>
              <AnimatedNumber
                value={preview.payload.stats.compCount}
                format={(n) => `${Math.round(n)}`}
              />{' '}
              comparable
              {preview.payload.stats.compCount === 1 ? '' : 's'}
              {preview.payload.stats.avgPricePerSqft != null && (
                <>
                  {' · avg '}
                  <AnimatedNumber
                    value={preview.payload.stats.avgPricePerSqft}
                    format={(n) => `$${Math.round(n).toLocaleString()}`}
                  />
                  /sqft
                </>
              )}
            </p>
            <p className={cn(META)}>
              Source: {DATA_SOURCE_LABEL[preview.payload.dataSource]}
            </p>
          </div>

          {preview.payload.comps.length > 0 && (
            <ul className="divide-y divide-border/60">
              {preview.payload.comps.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn(BODY, 'truncate')}>{c.address}</p>
                    <p className={cn(CAPTION, 'mt-0.5')}>{compFacts(c)}</p>
                  </div>
                  <span className={cn(BODY, 'tabular-nums shrink-0')}>{money(c.price)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handlePublish(reports.find((r) => r.id === preview.id) ?? preview)}>
              {(reports.find((r) => r.id === preview.id)?.status ?? preview.status) === 'published'
                ? 'Unpublish'
                : 'Publish & share'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleCopy(preview.shareToken)}>
              <Link2 size={14} /> Copy link
            </Button>
          </div>

          <NarrativeSection slug={slug} reportId={preview.id} payload={preview.payload} />
        </Reveal>
      )}

      {/* ── Past reports ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={cn(SECTION_LABEL)}>Your reports</p>

        {loadingReports ? (
          <div className="chippi-dashboard-panel-muted rounded-2xl px-5 py-10 text-center">
            <p className={cn(BODY, 'text-muted-foreground')}>Loading&hellip;</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="chippi-dashboard-panel rounded-[1.75rem] px-5 py-10 text-center">
            <p className={cn(BODY)}>No reports yet.</p>
            <p className={cn(CAPTION, 'mt-1')}>Build your first analysis above.</p>
          </div>
        ) : (
          <StaggerList key={reports.length} className="chippi-dashboard-panel overflow-hidden rounded-[1.75rem] divide-y chippi-dashboard-divider px-5 sm:px-7">
            {reports.map((r) => (
              <StaggerItem key={r.id}>
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn(BODY, 'font-medium truncate')}>
                      {r.title?.trim() || r.subjectAddress}
                    </p>
                    <p className={cn(META, 'mt-1')}>
                      {r.status === 'published' ? 'Published' : 'Draft'} · {formatDate(r.createdAt)}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handlePublish(r)}
                    title={r.status === 'published' ? 'Unpublish' : 'Publish'}
                  >
                    {r.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleCopy(r.shareToken)}
                    title="Copy share link"
                    aria-label="Copy share link"
                  >
                    <Link2 size={14} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleDelete(r.id)}
                    title="Delete"
                    aria-label="Delete report"
                  >
                    <Trash2 size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>
    </main>
  );
}

// ── Leaf ───────────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
