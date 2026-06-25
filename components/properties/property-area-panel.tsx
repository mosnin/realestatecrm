'use client';

/**
 * Property IQ panel on the property detail page — researches the neighborhood /
 * local market for THIS property's address and renders the Area IQ card.
 *
 * Mirrors PropertyAnalysisPanel's posture (button → POST → states) but hits
 * /api/areas/analyze with the propertyId. The report is cached per area, so
 * opening Area IQ on a second listing in the same ZIP is instant.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { MapPinned, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SECTION_LABEL } from '@/lib/typography';
import { timeAgo } from '@/lib/formatting';
import { toAreaCardData, type AreaCardData } from '@/lib/area-card';
import type { AreaReport } from '@/lib/types';
import { AreaResult } from '@/components/ai/blocks/tool-results/area-result';

type AreaResponse =
  | { status: 'ok'; cached: boolean; report: AreaReport }
  | { status: 'no_evidence'; generatedAt: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; error: string };

export function PropertyAreaPanel({ propertyId }: { propertyId: string }) {
  const [card, setCard] = useState<AreaCardData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
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
    } catch {
      toast.error("Couldn't research this area. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-foreground/60" />
          <span className={SECTION_LABEL}>Area IQ</span>
          {generatedAt && (
            <span className="text-[12px] text-foreground/45">researched {timeAgo(generatedAt)}</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => research(Boolean(card))} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : card ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <MapPinned className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">{card ? 'Refresh' : 'Research area'}</span>
        </Button>
      </div>

      {!card && !loading && !notConfigured && !noEvidence && (
        <p className="mt-2 text-[13px] text-foreground/55">
          Research the neighborhood for this address: schools, safety, walkability, the local
          market, and lifestyle, with sources.
        </p>
      )}

      {notConfigured && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[13px] text-foreground/75">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Area research is not configured on this workspace yet ({notConfigured.join(', ')}).
          </span>
        </div>
      )}

      {noEvidence && (
        <p className="mt-3 text-[13px] text-foreground/60">
          Researched, but there wasn&apos;t enough public data to brief this area.
        </p>
      )}

      {card && <AreaResult data={{ ok: true, area: card }} />}
    </div>
  );
}
