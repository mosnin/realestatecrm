/**
 * GET /api/cma/packet/[id]?slug=<slug> — a pre-listing packet export for a
 * CMA report: cover, the computed numbers, the persisted seller-pitch
 * narrative (if any), and the comps table, as one self-contained, printable
 * HTML document.
 *
 * Deliberately NOT a binary PDF: no new dependency was justified for this
 * track, so the export is a print-friendly HTML page with a scoped
 * `@media print` stylesheet — the realtor uses the browser's own
 * Print → Save as PDF, same approach already shipped for the public
 * /cma/[token] report page. Flagging this as the chosen approach per the
 * track brief.
 *
 * Auth: requireSpaceOwner(slug), then the report is loaded with
 * `.eq('id', id).eq('spaceId', space.id)` — the `.eq('spaceId', ...)` IS the
 * security boundary (see CLAUDE.md); a cross-tenant id resolves to no row,
 * so this 404s rather than leaking whether the report exists.
 *
 * Honest UI: the narrative section only renders when the report has a
 * persisted `narrative` — an ungenerated pitch is omitted, never faked. Same
 * treatment for numbers the CMA doesn't have (suggested range, comp stats):
 * missing values render as "not available" language rather than a blank or
 * a made-up figure.
 *
 * This route returns a raw HTML document, not a Next.js page, so it cannot
 * rely on the app's compiled Tailwind stylesheet — every style here is
 * inline CSS in a self-contained `<style>` block.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { formatCurrency } from '@/lib/formatting';
import type { CmaPayload, CmaComp } from '@/lib/cma-types';
import { DATA_SOURCE_LABEL } from '@/lib/cma-types';
import { FONT_SANS_STACK, FONT_SERIF_STACK } from '@/lib/typography';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

interface ReportRow {
  id: string;
  spaceId: string;
  subjectAddress: string;
  title: string | null;
  status: string;
  payload: CmaPayload;
  narrative: string | null;
  narrativeUpdatedAt: string | null;
  createdAt: string;
}

// ── Small formatting helpers (mirrors app/cma/[token]/page.tsx) ─────────────

function money(n: number | null | undefined): string {
  return n == null ? 'Not available' : formatCurrency(n);
}

function ppsf(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toLocaleString('en-US')}`;
}

function facts(c: { beds: number | null; baths: number | null; squareFeet: number | null }): string {
  const parts: string[] = [];
  if (c.beds != null) parts.push(`${c.beds} bd`);
  if (c.baths != null) parts.push(`${c.baths} ba`);
  if (c.squareFeet != null) parts.push(`${c.squareFeet.toLocaleString('en-US')} sqft`);
  return parts.join(' · ') || '—';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const BASIS_NOTE: Record<CmaPayload['stats']['basis'], string> = {
  sold: 'Based on recent sold prices of comparable homes.',
  list: 'Based on current list prices of comparable homes.',
  mixed: 'Based on a mix of recent sold and current list prices.',
  none: 'Not enough priced comparables to compute a range yet.',
};

// This route builds raw HTML by hand (see file header), so every piece of
// data that originated from user input — addresses, titles, the LLM
// narrative — must be escaped before it lands in the markup.
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compRowHtml(c: CmaComp): string {
  const bedBath = c.beds != null || c.baths != null ? `${c.beds ?? '—'} / ${c.baths ?? '—'}` : '—';
  return `
    <tr>
      <td>
        <span class="addr">${esc(c.address)}</span>
        ${c.city ? `<span class="muted"> · ${esc(c.city)}</span>` : ''}
      </td>
      <td class="num">${esc(bedBath)}</td>
      <td class="num">${c.squareFeet != null ? c.squareFeet.toLocaleString('en-US') : '—'}</td>
      <td class="num">${money(c.price)}</td>
      <td class="num">${ppsf(c.pricePerSqft)}</td>
    </tr>`;
}

function packetHtml(report: ReportRow, brandName: string | null): string {
  const { subject, comps, stats, generatedAt } = report.payload;
  const dataSource = report.payload.dataSource ?? 'crm';
  const subjectLocation = [subject.city, subject.stateRegion].filter(Boolean).join(', ');
  const hasRange = stats.suggestedLow != null && stats.suggestedHigh != null;
  const heading = report.title?.trim() || subject.address;
  const generated = generatedAt ? formatDate(generatedAt) : '';
  const narrativeParagraphs = report.narrative
    ? report.narrative.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    : [];

  const compRows = comps.length
    ? comps.map(compRowHtml).join('')
    : `<tr><td colspan="5" class="empty">No comparable homes on this report.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(heading)} — pre-listing packet</title>
<style>${PACKET_CSS}</style>
</head>
<body>
  <main>
    <div class="brand">${brandName ? esc(brandName) : 'Pre-listing packet'}</div>

    <header class="cover">
      <p class="eyebrow">Pre-listing packet</p>
      <h1>${esc(heading)}</h1>
      <p class="sub">${report.title?.trim() ? esc(subject.address) : esc(subjectLocation) || 'Prepared for the property owner.'}</p>
      ${generated ? `<p class="meta">Prepared ${brandName ? `by ${esc(brandName)} ` : ''}on ${esc(generated)}</p>` : ''}
    </header>

    <section class="range">
      <p class="eyebrow">Suggested list-price range</p>
      ${
        hasRange
          ? `<p class="range-value">${money(stats.suggestedLow)} – ${money(stats.suggestedHigh)}</p>`
          : `<p class="sub">Add priced comparables to compute a range.</p>`
      }
      ${
        stats.estimatedValue != null
          ? `<p class="meta">Automated value estimate <strong>${money(stats.estimatedValue)}</strong></p>`
          : ''
      }
      <p class="meta">${esc(BASIS_NOTE[stats.basis])}</p>
      <p class="meta">Source: ${esc(DATA_SOURCE_LABEL[dataSource])}</p>
    </section>

    <section class="stats">
      <div class="stat"><p class="stat-label">Comparables</p><p class="stat-value">${stats.compCount}</p></div>
      <div class="stat"><p class="stat-label">Low</p><p class="stat-value">${money(stats.low)}</p></div>
      <div class="stat"><p class="stat-label">Median</p><p class="stat-value">${money(stats.median)}</p></div>
      <div class="stat"><p class="stat-label">High</p><p class="stat-value">${money(stats.high)}</p></div>
    </section>

    <section>
      <p class="eyebrow">Subject property</p>
      <div class="card">
        <p class="addr">${esc(subject.address)}</p>
        <p class="sub">${esc(facts(subject))}</p>
        ${subject.listPrice != null ? `<p class="sub">List price <strong>${money(subject.listPrice)}</strong></p>` : ''}
      </div>
    </section>

    ${
      narrativeParagraphs.length > 0
        ? `<section class="avoid-break">
      <p class="eyebrow">Seller pitch</p>
      <div class="card">
        ${narrativeParagraphs.map((p) => `<p class="narrative-p">${esc(p)}</p>`).join('')}
      </div>
    </section>`
        : ''
    }

    <section class="avoid-break">
      <div class="row-between">
        <p class="eyebrow">Comparable homes</p>
        ${stats.avgPricePerSqft != null ? `<p class="meta">Avg <strong>${ppsf(stats.avgPricePerSqft)}</strong>/sqft</p>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Address</th>
            <th class="num">Beds / baths</th>
            <th class="num">Sqft</th>
            <th class="num">Price</th>
            <th class="num">$/sqft</th>
          </tr>
        </thead>
        <tbody>${compRows}</tbody>
      </table>
    </section>

    <footer>
      <p class="meta">This packet is an estimate based on comparable properties, not an appraisal.</p>
      <p class="meta no-print">Use your browser's Print → Save as PDF to keep a copy.</p>
    </footer>
  </main>
</body>
</html>`;
}

const PACKET_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f7f7f8;
  color: #111113;
  font-family: ${FONT_SANS_STACK};
  font-size: 15px;
  line-height: 1.5;
}
main {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px 64px;
}
h1 {
  font-family: ${FONT_SERIF_STACK};
  font-size: 32px;
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 4px 0 2px;
  font-weight: 400;
}
.brand { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6f76; margin-bottom: 28px; }
.eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6f76; margin: 0 0 8px; }
.sub { font-size: 14px; color: #6b6f76; margin: 0; }
.meta { font-size: 12px; color: #6b6f76; margin: 6px 0 0; }
.cover { margin-bottom: 32px; }
section { margin-bottom: 28px; }
.range {
  border: 1px solid #e7e7e9;
  border-radius: 12px;
  background: #ffffff;
  padding: 28px 24px;
  text-align: center;
}
.range-value {
  font-family: ${FONT_SERIF_STACK};
  font-size: 30px;
  letter-spacing: -0.01em;
  margin: 4px 0;
  font-variant-numeric: tabular-nums;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  border: 1px solid #e7e7e9;
  border-radius: 12px;
  overflow: hidden;
  background: #e7e7e9;
}
.stat { background: #ffffff; padding: 14px 16px; }
.stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6f76; margin: 0; }
.stat-value {
  font-family: ${FONT_SERIF_STACK};
  font-size: 22px;
  margin: 4px 0 0;
  font-variant-numeric: tabular-nums;
}
.card { border: 1px solid #e7e7e9; border-radius: 12px; background: #ffffff; padding: 18px 20px; }
.addr { font-weight: 600; margin: 0; }
.narrative-p { font-size: 14px; line-height: 1.65; margin: 0 0 12px; }
.narrative-p:last-child { margin-bottom: 0; }
.row-between { display: flex; align-items: baseline; justify-content: space-between; }
table { width: 100%; border-collapse: collapse; border: 1px solid #e7e7e9; border-radius: 12px; overflow: hidden; background: #ffffff; }
th, td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #e7e7e9; }
th { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6f76; }
tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.muted { color: #6b6f76; }
.empty { text-align: center; color: #6b6f76; padding: 20px; }
footer { border-top: 1px solid #e7e7e9; padding-top: 16px; margin-top: 8px; }
.avoid-break { break-inside: avoid; page-break-inside: avoid; }
@media print {
  @page { margin: 16mm; }
  html, body { background: #ffffff !important; }
  main { max-width: none; padding: 0; }
  .no-print { display: none !important; }
}
`;

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Tenant scoping: the .eq('spaceId', space.id) IS the security boundary —
  // a report id from another workspace resolves to no row, never a leak.
  const { data, error } = await supabase
    .from('CmaReport')
    .select(
      'id, spaceId, subjectAddress, title, status, payload, narrative, narrativeUpdatedAt, createdAt',
    )
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[cma-packet] load failed', { spaceId: space.id, id, err: error.message });
    return NextResponse.json({ error: 'Could not load the report.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const report = data as ReportRow;
  if (!report.payload || !report.payload.stats) {
    return NextResponse.json({ error: 'This report has no analysis to export yet.' }, { status: 400 });
  }

  const html = packetHtml(report, space.name ?? null);

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
