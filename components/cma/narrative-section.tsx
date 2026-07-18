'use client';

/**
 * NarrativeSection — turns a built CMA into a seller-facing pre-listing pitch.
 *
 * One intent: the realtor clicks Generate, gets a grounded three-paragraph
 * narrative citing the CMA's real numbers, and copies it into wherever they're
 * writing the listing. Nothing is persisted server-side yet (CmaReport has no
 * narrative column — see app/api/cma/narrative/route.ts) so this component
 * owns the only copy of the generated text; it's lost on refresh, which the
 * copy button exists to prevent mattering.
 *
 * Honest UI: hidden entirely when the CMA has no estimate to narrate
 * (stats.insufficientData) — there's nothing true to pitch yet. Loading is a
 * calm shimmer, not a spinner, matching the thinking-indicator's restraint
 * elsewhere in the app. A failed generation surfaces as a plain retry, never
 * a fabricated narrative.
 */

import { useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SURFACE_CARD, SURFACE_CARD_PAD, CARD_TITLE } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION } from '@/lib/typography';
import { toastError } from '@/lib/toast-helpers';
import type { CmaPayload } from '@/lib/cma-types';

interface NarrativeSectionProps {
  slug: string;
  reportId: string;
  payload: CmaPayload;
}

export function NarrativeSection({ slug, reportId, payload }: NarrativeSectionProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thin, setThin] = useState(false);

  // Honest UI: no estimate, nothing to pitch — the section doesn't exist.
  if (payload.stats.insufficientData) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setThin(false);
    try {
      const res = await fetch('/api/cma/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, id: reportId }),
      });
      const data = (await res.json()) as {
        narrative?: string | null;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        toastError(data.error ?? 'Could not generate the narrative. Try again.');
        return;
      }
      if (!data.narrative) {
        setThin(true);
        return;
      }
      setNarrative(data.narrative);
    } catch {
      toastError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!narrative) return;
    try {
      await navigator.clipboard.writeText(narrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toastError('Could not copy the narrative.');
    }
  };

  const paragraphs = narrative ? narrative.split(/\n+/).filter((p) => p.trim()) : [];

  return (
    <section className={cn(SURFACE_CARD, SURFACE_CARD_PAD, 'space-y-4')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.75} className="text-[#F25A00]" />
          <h2 className={CARD_TITLE}>Seller pitch</h2>
        </div>
        {!loading && (
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            {narrative ? 'Regenerate' : 'Generate'}
          </Button>
        )}
      </div>

      {!narrative && !loading && !thin && (
        <p className={cn(BODY_MUTED)}>
          Turn this analysis into a short, grounded pitch you can hand a seller —
          citing the range and comps above, nothing invented.
        </p>
      )}

      {thin && !loading && (
        <p className={cn(BODY_MUTED)}>
          There isn&apos;t enough comparable data yet to write an honest pitch. Add
          more priced comparables and try again.
        </p>
      )}

      {loading && (
        <div className="space-y-2 animate-pulse" aria-live="polite" aria-label="Generating narrative">
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-11/12 rounded bg-muted/40" />
          <div className="h-3 w-4/5 rounded bg-muted/40" />
          <div className="h-3 w-full rounded bg-muted/30 mt-3" />
          <div className="h-3 w-3/4 rounded bg-muted/30" />
        </div>
      )}

      {narrative && !loading && (
        <div className="space-y-4">
          <div className="space-y-3">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">
                {p}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check size={14} /> Copied
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy
                </>
              )}
            </Button>
            <p className={cn(CAPTION)}>AI-generated — review before sending.</p>
          </div>
        </div>
      )}
    </section>
  );
}
