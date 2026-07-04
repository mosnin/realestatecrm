'use client';

/**
 * Property IQ panel on the property detail page — researches the neighborhood /
 * local market for THIS property's address and renders the Area IQ card.
 *
 * Deliberately matches PropertyAnalysisPanel's anatomy (section divider, header
 * row with timestamp, animated progress strip, not-configured / no-evidence
 * states) so the two research blocks read as one family. The report is cached
 * per area, so opening Area IQ on a second listing in the same ZIP is instant.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { MapPinned, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';
import { Button } from '@/components/ui/button';
import { toAreaCardData, type AreaCardData } from '@/lib/area-card';
import type { AreaReport } from '@/lib/types';
import { AreaResult } from '@/components/ai/blocks/tool-results/area-result';

const EASE_APPLE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type AreaResponse =
  | { status: 'ok'; cached: boolean; report: AreaReport }
  | { status: 'no_evidence'; generatedAt: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; error: string };

export function PropertyAreaPanel({
  propertyId,
  initialReport = null,
}: {
  propertyId: string;
  /** A pre-loaded report (from the server) so the brief is there on arrival. */
  initialReport?: AreaReport | null;
}) {
  const [card, setCard] = useState<AreaCardData | null>(
    initialReport ? toAreaCardData(initialReport, true) : null,
  );
  const [generatedAt, setGeneratedAt] = useState<string | null>(
    initialReport?.generatedAt ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState<string[] | null>(null);
  const [noEvidence, setNoEvidence] = useState(false);

  async function research(forceRefresh = false) {
    setLoading(true);
    setNotConfigured(null);
    setNoEvidence(false);
    try {
      const res = await fetch('/api/areas/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, forceRefresh }),
      });
      const data = (await res.json().catch(() => null)) as AreaResponse | null;
      if (!data) {
        toast.error("Couldn't research this area. Try again.");
        return;
      }
      if (data.status === 'not_configured') {
        setNotConfigured(data.missing);
        return;
      }
      if (data.status === 'no_evidence') {
        setNoEvidence(true);
        setGeneratedAt(data.generatedAt);
        return;
      }
      if (data.status === 'error') {
        toast.error(data.error || "Couldn't research this area.");
        return;
      }
      setCard(toAreaCardData(data.report, data.cached));
      setGeneratedAt(data.report.generatedAt);
      toast.success(data.cached ? 'Loaded the area brief.' : 'Area research complete.');
    } catch {
      toast.error('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const hasResult = card !== null;

  return (
    <section className="space-y-4 border-t border-border/60 pt-6">
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className={cn(SECTION_LABEL)}>Area IQ</h2>
          {generatedAt && (
            <span className="text-[11px] text-muted-foreground">researched {timeAgo(generatedAt)}</span>
          )}
        </div>
        <Button
          size="sm"
          variant={hasResult ? 'outline' : 'default'}
          onClick={() => research(hasResult)}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" /> Researching…
            </>
          ) : hasResult ? (
            <>
              <RefreshCw /> Refresh
            </>
          ) : (
            <>
              <MapPinned /> Research area
            </>
          )}
        </Button>
      </div>

      {/* ── Intro / empty hint (only before the first run) ─────────── */}
      {!hasResult && !loading && !notConfigured && !noEvidence && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Research the neighborhood around this address — schools, safety, walkability, the local
          market, and lifestyle — pulled from the open web with sources. Reused across every listing
          in the same area.
        </p>
      )}

      {/* ── Progress (this can run ~a minute) ──────────────────────── */}
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
              Searching the web, reading neighborhood &amp; market pages, and structuring the
              findings. This can take up to a minute.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Not configured ─────────────────────────────────────────── */}
      {notConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <div className="text-sm">
            <p className="font-medium text-foreground">Web research isn&apos;t configured</p>
            <p className="text-muted-foreground mt-0.5">
              Area research needs{' '}
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
          <div className="text-sm text-muted-foreground">
            We couldn&apos;t find enough public data to brief this area. Make sure the property has a
            city &amp; state (or ZIP) set, then try again.
          </div>
        </div>
      )}

      {/* ── Result card ────────────────────────────────────────────── */}
      <AnimatePresence>
        {hasResult && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_APPLE }}
          >
            <AreaResult data={{ ok: true, area: card }} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
