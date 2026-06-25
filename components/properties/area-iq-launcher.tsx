'use client';

/**
 * Standalone Area IQ — research ANY area, not tied to a property. Lives in the
 * Properties page header so "research an area" is a first-class action, not a
 * chat-only one. Opens a dialog with a location box (ZIP, "City, ST", or an
 * address); on success it renders the same Area IQ card the chat tool and the
 * property panel use, so the three surfaces stay identical.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { MapPinned, Loader2, AlertTriangle, Info, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toAreaCardData, type AreaCardData } from '@/lib/area-card';
import type { AreaReport } from '@/lib/types';
import { AreaResult } from '@/components/ai/blocks/tool-results/area-result';

type AreaResponse =
  | { status: 'ok'; cached: boolean; report: AreaReport }
  | { status: 'no_evidence'; generatedAt: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; error: string };

export function AreaIqLauncher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [card, setCard] = useState<AreaCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState<string[] | null>(null);
  const [noEvidence, setNoEvidence] = useState(false);

  async function research() {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setNotConfigured(null);
    setNoEvidence(false);
    setCard(null);
    try {
      const res = await fetch('/api/areas/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json().catch(() => null)) as AreaResponse | null;
      if (!data) {
        toast.error("Couldn't research that area. Try again.");
        return;
      }
      if (data.status === 'not_configured') {
        setNotConfigured(data.missing);
        return;
      }
      if (data.status === 'no_evidence') {
        setNoEvidence(true);
        return;
      }
      if (data.status === 'error') {
        toast.error(data.error || "Couldn't research that area.");
        return;
      }
      setCard(toAreaCardData(data.report, data.cached));
    } catch {
      toast.error('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <MapPinned size={14} aria-hidden />
          Area IQ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Research an area</DialogTitle>
          <DialogDescription>
            A ZIP, &ldquo;City, ST&rdquo;, or an address. Get schools, safety, walkability, the local
            market, and lifestyle, with sources.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void research();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Austin, TX 78704"
              aria-label="Area to research"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : 'Research'}
          </Button>
        </form>

        {loading && (
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
            <div className="text-sm text-muted-foreground">
              Searching the web and structuring the findings. This can take up to a minute.
            </div>
          </div>
        )}

        {notConfigured && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 text-amber-600 dark:text-amber-500" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-foreground">Web research isn&apos;t configured</p>
              <p className="text-muted-foreground mt-0.5">
                Area research needs {notConfigured.join(' and ')} set on the server. Ask your
                administrator to add {notConfigured.length === 1 ? 'this key' : 'these keys'}.
              </p>
            </div>
          </div>
        )}

        {noEvidence && (
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <Info size={16} className="mt-0.5 text-muted-foreground" aria-hidden />
            <div className="text-sm text-muted-foreground">
              We couldn&apos;t find enough public data for that area. Try a ZIP, or a city and state.
            </div>
          </div>
        )}

        {card && (
          <div className="max-h-[60vh] overflow-y-auto">
            <AreaResult data={{ ok: true, area: card }} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
