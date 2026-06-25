'use client';

/**
 * Renders a `display: 'area'` tool result — the Property IQ Area card.
 *
 * Shows the grounded neighborhood brief: a metric chip row (schools, walk score,
 * median price, market trend), the prose summary, per-dimension sections each
 * linking its source, the highlights, and the sources consulted. The payload is
 * the flat AreaCardData built by lib/area-card.ts, so this component only lays
 * out primitives — no parsing, no fetching.
 */

import { MapPin, ExternalLink } from 'lucide-react';
import type { AreaCardData } from '@/lib/area-card';

function isAreaCard(data: unknown): data is { ok: true; area: AreaCardData } {
  if (!data || typeof data !== 'object') return false;
  const d = data as { ok?: unknown; area?: unknown };
  if (d.ok !== true || !d.area || typeof d.area !== 'object') return false;
  const a = d.area as Record<string, unknown>;
  return typeof a.label === 'string' && Array.isArray(a.metrics) && Array.isArray(a.sections);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function AreaResult({ data }: { data: unknown }) {
  if (!isAreaCard(data)) return null;
  const area = data.area;

  return (
    <div className="mt-2 max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card">
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
          <MapPin className="h-3.5 w-3.5 text-foreground/70" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
            Area IQ
          </div>
          <div className="truncate text-[15px] font-semibold text-foreground">{area.label}</div>
        </div>
      </div>

      {/* Metric chips */}
      {area.metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {area.metrics.map((m) => (
            <span
              key={`${m.label}:${m.value}`}
              className="inline-flex items-baseline gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[12px]"
            >
              <span className="text-foreground/50">{m.label}</span>
              <span className="font-medium text-foreground">{m.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {area.summary && (
        <p className="px-4 pt-3 text-[13.5px] leading-relaxed text-foreground/85">{area.summary}</p>
      )}

      {/* Sections */}
      {area.sections.length > 0 && (
        <div className="mt-3 divide-y divide-border/50 border-t border-border/50">
          {area.sections.map((s) => (
            <div key={s.title} className="px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-foreground/80">{s.title}</span>
                {s.source && (
                  <a
                    href={s.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground/35 transition-colors hover:text-foreground/70"
                    title={hostOf(s.source)}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/75">{s.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Highlights */}
      {area.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-4 py-3">
          {area.highlights.map((h) => (
            <span
              key={h}
              className="inline-flex rounded-md bg-foreground/[0.05] px-2 py-0.5 text-[12px] text-foreground/70"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Sources */}
      {area.sources.length > 0 && (
        <div className="border-t border-border/50 px-4 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">
            Sources
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {area.sources.slice(0, 8).map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-foreground/55 transition-colors hover:text-foreground/85"
              >
                {hostOf(src.url)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
