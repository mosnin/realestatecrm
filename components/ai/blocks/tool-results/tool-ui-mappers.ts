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
import type {
  SerializableQuestionFlow,
  SerializableUpfrontMode,
  SerializableProgressiveMode,
} from '@/components/tool-ui/question-flow/schema';
import type { SerializableOptionList } from '@/components/tool-ui/option-list/schema';
import type { SerializableEmailDraft } from '@/components/tool-ui/message-draft/schema';

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

// ── ask_realtor (option-list) → OptionList ──────────────────────────────────
//
// The agent emits a lean `option-list` payload when it wants the realtor to
// pick from a small set of choices. We rebuild it into the strict serializable
// shape — dropping any stray non-serializable fields (icon / value), defaulting
// the action set, and clamping selection bounds — so the dispatch can validate
// with `safeParseSerializableOptionList` before render. OptionList's schema is
// `.strict()`, so anything we forward must be exactly the allowed keys.

export interface OptionListInput {
  id?: string;
  options: Array<{ id: string; label: string; description?: string | null }>;
  selectionMode?: 'single' | 'multi';
  minSelections?: number | null;
  maxSelections?: number | null;
  actions?: Array<{
    id: string;
    label: string;
    variant?: 'default' | 'destructive' | 'secondary' | 'ghost' | 'outline' | null;
  }> | null;
}

export function buildOptionList(input: OptionListInput): SerializableOptionList {
  const options = input.options.map((o) => ({
    id: o.id,
    label: o.label,
    ...(o.description ? { description: o.description } : {}),
  }));

  // Default to a single Confirm action (plus the component's own Clear) when
  // the agent doesn't specify any — keeps the round-trip discoverable.
  const actions =
    input.actions && input.actions.length > 0
      ? input.actions.map((a) => ({
          id: a.id,
          label: a.label,
          ...(a.variant ? { variant: a.variant } : {}),
        }))
      : [{ id: 'confirm', label: 'Confirm', variant: 'default' as const }];

  const payload: SerializableOptionList = {
    id: input.id ?? 'option-list',
    options,
    selectionMode: input.selectionMode ?? 'single',
    actions,
  };
  if (input.minSelections != null) payload.minSelections = Math.max(0, input.minSelections);
  if (input.maxSelections != null) payload.maxSelections = Math.max(1, input.maxSelections);
  return payload;
}

/** Look up an option's label by id so the round-trip prompt names the choice,
 *  not its opaque id. */
export function optionLabelMap(input: OptionListInput): Map<string, string> {
  return new Map(input.options.map((o) => [o.id, o.label]));
}

// ── ask_realtor (question-flow) → QuestionFlow ──────────────────────────────
//
// Two shapes the agent can emit:
//   - `steps: [...]`  → upfront multi-step flow (collect all answers, then
//     `onComplete` fires once).
//   - a single `step` (number) + title/options → progressive mode (one
//     question at a time; `onSelect` fires per step).
// We rebuild whichever was provided into the serializable union and let
// `safeParseSerializableQuestionFlow` gate it before render.

export interface QuestionFlowStepInput {
  id: string;
  title: string;
  description?: string | null;
  options: Array<{ id: string; label: string; description?: string | null }>;
  selectionMode?: 'single' | 'multi';
}

export interface QuestionFlowInput {
  id?: string;
  /** Upfront mode: the full list of steps. */
  steps?: QuestionFlowStepInput[];
  /** Progressive mode: a single step's fields (with a 1-based step number). */
  step?: number;
  title?: string;
  description?: string | null;
  options?: Array<{ id: string; label: string; description?: string | null }>;
  selectionMode?: 'single' | 'multi';
}

function buildFlowOptions(
  options: Array<{ id: string; label: string; description?: string | null }>,
) {
  return options.map((o) => ({
    id: o.id,
    label: o.label,
    ...(o.description ? { description: o.description } : {}),
  }));
}

export function buildQuestionFlow(input: QuestionFlowInput): SerializableQuestionFlow | null {
  const id = input.id ?? 'question-flow';

  // Upfront multi-step: prefer this when `steps` is present and non-empty.
  if (Array.isArray(input.steps) && input.steps.length > 0) {
    const payload: SerializableUpfrontMode = {
      id,
      steps: input.steps.map((s) => ({
        id: s.id,
        title: s.title,
        ...(s.description ? { description: s.description } : {}),
        options: buildFlowOptions(s.options),
        ...(s.selectionMode ? { selectionMode: s.selectionMode } : {}),
      })),
    };
    return payload;
  }

  // Progressive single-step: needs a step number, title, and options.
  if (input.title && Array.isArray(input.options) && input.options.length > 0) {
    const payload: SerializableProgressiveMode = {
      id,
      step: input.step && input.step >= 1 ? input.step : 1,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      options: buildFlowOptions(input.options),
      ...(input.selectionMode ? { selectionMode: input.selectionMode } : {}),
    };
    return payload;
  }

  return null;
}

/**
 * Format the realtor's QuestionFlow answers as one clear line the agent can
 * read on the next turn, e.g. "Answers — Budget: Under $500k; Timeline: 3-6
 * months". Maps step + option ids back to their human labels (the callbacks
 * carry only ids). Steps with no selection are skipped.
 */
export function formatQuestionFlowAnswers(
  steps: QuestionFlowStepInput[],
  answers: Record<string, string[]>,
): string {
  const parts: string[] = [];
  for (const step of steps) {
    const picked = answers[step.id] ?? [];
    if (picked.length === 0) continue;
    const labelById = new Map(step.options.map((o) => [o.id, o.label]));
    const labels = picked.map((pid) => labelById.get(pid) ?? pid);
    parts.push(`${step.title}: ${labels.join(', ')}`);
  }
  return parts.length > 0 ? `Answers — ${parts.join('; ')}` : 'No answers selected.';
}

// ── draft_message / draft_email (message-draft) → MessageDraft ──────────────
//
// An email draft awaiting approval. We only render the email channel here
// (the realtor chat drafts emails); the body/subject/to come from the draft
// row (or the compose result). `outcome` is set to "sent" once the realtor
// approves so a reloaded conversation shows the receipt, not live buttons.

export interface EmailDraftInput {
  id?: string;
  subject: string;
  body: string;
  to: string[];
  from?: string | null;
  cc?: string[] | null;
  bcc?: string[] | null;
  outcome?: 'sent' | 'cancelled' | null;
}

export function buildEmailDraft(input: EmailDraftInput): SerializableEmailDraft {
  const to = input.to.filter((t) => t && t.trim().length > 0);
  const payload: SerializableEmailDraft = {
    id: input.id ?? 'message-draft',
    channel: 'email',
    subject: input.subject,
    body: input.body,
    to: to.length > 0 ? to : ['(recipient)'],
  };
  if (input.from) payload.from = input.from;
  if (input.cc && input.cc.length > 0) payload.cc = input.cc;
  if (input.bcc && input.bcc.length > 0) payload.bcc = input.bcc;
  if (input.outcome) payload.outcome = input.outcome;
  return payload;
}
