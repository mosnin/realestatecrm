/**
 * Pure data-mapping helpers from Chippi tool results → tool-ui serializable
 * payloads (DataTable / ItemCarousel / StatsDisplay / WeatherWidget).
 *
 * These are deliberately framework-free (no JSX, no React) so they can be
 * unit-tested in the node vitest environment and reused by the dispatch in
 * `tool-call-block-view.tsx` / `tool-group-block-view.tsx`.
 *
 * Contract notes:
 *   - DataTable `data` rows must be PRIMITIVES only (string | number | boolean
 *     | null) — no nested objects, no Date instances. Dates are passed as ISO
 *     strings and rendered via a `{ kind: 'date', dateFormat: 'relative' }`
 *     column format. Status/stage strings get a `statusMap` so the table shows
 *     a toned badge instead of raw enum text.
 *   - Every shape is constructed to pass the component's
 *     `safeParseSerializable*` validator; the dispatch validates before render
 *     and falls back to the legacy card stack if a payload is malformed.
 */

import type { SerializableDataTable } from '@/components/tool-ui/data-table/schema';
import type { SerializableStatsDisplay } from '@/components/tool-ui/stats-display/schema';
import type { SerializableItemCarousel } from '@/components/tool-ui/item-carousel/schema';
import type {
  WeatherWidgetPayload,
  WeatherConditionCode,
} from '@/components/tool-ui/weather-widget/schema-runtime';

// ── Contacts → DataTable ────────────────────────────────────────────────────

export interface ContactRowInput {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  leadType?: string | null;
  scoreLabel?: string | null;
  leadScore?: number | null;
  /** ISO timestamp of the most recent touch / next follow-up. */
  followUpAt?: string | null;
  lastContactedAt?: string | null;
}

/** Lead-score tiers → badge tone. Hot reads as a positive signal (green),
 *  cold as a caution (amber), unscored as neutral. */
const CONTACT_STATUS_MAP: Record<
  string,
  { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label?: string }
> = {
  hot: { tone: 'success', label: 'Hot' },
  warm: { tone: 'info', label: 'Warm' },
  cold: { tone: 'warning', label: 'Cold' },
  unscored: { tone: 'neutral', label: 'Unscored' },
};

/** Title-case a lead type for the secondary column (rental → Rental). */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildContactsTable(
  contacts: ContactRowInput[],
  id = 'contacts',
): SerializableDataTable {
  const data = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    // Normalize to the statusMap keys; fall back to 'unscored' so the badge
    // always renders rather than showing a bare/empty cell.
    status: (c.scoreLabel ?? 'unscored').toLowerCase(),
    leadType: c.leadType ? titleCase(c.leadType) : null,
    lastActivity: c.lastContactedAt ?? c.followUpAt ?? null,
  }));

  return {
    id,
    columns: [
      { key: 'name', label: 'Name', priority: 'primary', truncate: true },
      { key: 'email', label: 'Email', priority: 'primary', truncate: true },
      { key: 'phone', label: 'Phone', priority: 'secondary' },
      {
        key: 'status',
        label: 'Stage',
        priority: 'primary',
        format: { kind: 'status', statusMap: CONTACT_STATUS_MAP },
      },
      { key: 'leadType', label: 'Lead type', priority: 'secondary' },
      {
        key: 'lastActivity',
        label: 'Last activity',
        priority: 'secondary',
        format: { kind: 'date', dateFormat: 'relative' },
      },
    ],
    data,
    rowIdKey: 'id',
  };
}

// ── Deals → DataTable ───────────────────────────────────────────────────────

export interface DealRowInput {
  id: string;
  title: string;
  value?: number | null;
  /** Stage label (already resolved from stageId by the tool). */
  stageName?: string | null;
  status?: string | null;
  contact_name?: string | null;
  contactName?: string | null;
  /** ISO date the deal is expected to close. */
  close_date?: string | null;
  closeDate?: string | null;
}

const DEAL_STATUS_MAP: Record<
  string,
  { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label?: string }
> = {
  active: { tone: 'info', label: 'Active' },
  won: { tone: 'success', label: 'Won' },
  lost: { tone: 'danger', label: 'Lost' },
  on_hold: { tone: 'warning', label: 'On hold' },
};

export function buildDealsTable(deals: DealRowInput[], id = 'deals'): SerializableDataTable {
  const data = deals.map((d) => ({
    id: d.id,
    title: d.title,
    // Stage is the primary movement signal; show it as a neutral badge so it
    // reads as a chip, not raw text. We key the badge colorMap loosely — stage
    // names are workspace-defined, so unknown stages fall back to neutral.
    stage: d.stageName ?? null,
    status: (d.status ?? 'active').toLowerCase(),
    value: d.value ?? null,
    contact: d.contact_name ?? d.contactName ?? null,
    closeDate: d.close_date ?? d.closeDate ?? null,
  }));

  return {
    id,
    columns: [
      { key: 'title', label: 'Deal', priority: 'primary', truncate: true },
      { key: 'stage', label: 'Stage', priority: 'primary', format: { kind: 'badge' } },
      {
        key: 'status',
        label: 'Status',
        priority: 'secondary',
        format: { kind: 'status', statusMap: DEAL_STATUS_MAP },
      },
      {
        key: 'value',
        label: 'Value',
        priority: 'primary',
        align: 'right',
        format: { kind: 'currency', currency: 'USD', decimals: 0 },
      },
      { key: 'contact', label: 'Contact', priority: 'secondary', truncate: true },
      {
        key: 'closeDate',
        label: 'Close date',
        priority: 'secondary',
        format: { kind: 'date', dateFormat: 'short' },
      },
    ],
    data,
    rowIdKey: 'id',
  };
}

// ── Properties → ItemCarousel ───────────────────────────────────────────────

export interface PropertyItemInput {
  id: string;
  address: string;
  listPrice?: number | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  /** Photo URL if the property has one. Only http(s) URLs are kept. */
  image?: string | null;
  photo?: string | null;
  photoUrl?: string | null;
}

/** Compose the carousel subtitle, e.g. "$650,000 · 3bd/2ba". Pieces are
 *  omitted when absent so a bare address still reads cleanly. */
export function propertySubtitle(p: PropertyItemInput): string | undefined {
  const parts: string[] = [];
  const price = p.listPrice ?? p.price;
  if (price != null) {
    parts.push(
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(price),
    );
  }
  const bb: string[] = [];
  if (p.beds != null) bb.push(`${p.beds}bd`);
  if (p.baths != null) bb.push(`${p.baths}ba`);
  if (bb.length > 0) parts.push(bb.join('/'));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Keep only safe absolute image URLs; the carousel schema requires a valid
 *  URL and we never want to surface a relative/garbage src. */
function safeImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function buildPropertiesCarousel(
  properties: PropertyItemInput[],
  opts: { id?: string; withActions?: boolean } = {},
): SerializableItemCarousel {
  const { id = 'properties', withActions = false } = opts;
  return {
    id,
    items: properties.map((p) => {
      const image = safeImageUrl(p.image ?? p.photo ?? p.photoUrl);
      return {
        id: p.id,
        name: p.address,
        ...(propertySubtitle(p) ? { subtitle: propertySubtitle(p) } : {}),
        ...(image ? { image } : {}),
        ...(withActions
          ? { actions: [{ id: 'view', label: 'View' }] }
          : {}),
      };
    }),
  };
}

// ── Weather (WMO codes) → WeatherWidget ─────────────────────────────────────

/**
 * Map an Open-Meteo WMO weather-interpretation code to the widget's 13-value
 * conditionCode enum. Reference: WMO 4677 as exposed by Open-Meteo.
 * Unmapped/edge codes fall back to the nearest sensible bucket.
 */
export function wmoToConditionCode(code: number): WeatherConditionCode {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 56 || code === 57) return 'sleet'; // freezing drizzle
  if (code === 61 || code === 63) return 'rain';
  if (code === 65) return 'heavy-rain';
  if (code === 66 || code === 67) return 'sleet'; // freezing rain
  if (code === 71 || code === 73 || code === 75 || code === 77) return 'snow';
  if (code === 80 || code === 81) return 'rain';
  if (code === 82) return 'heavy-rain';
  if (code === 85 || code === 86) return 'snow';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'hail'; // thunderstorm w/ hail
  return 'cloudy';
}
