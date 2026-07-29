// Pure routing helpers for the Chippi RightPanel embeds — no React, no DOM —
// so the realtor and broker variants resolve their embed URLs and visible tabs
// the same way, and the logic is unit-testable without rendering the panel.
import type { RightPanelTab } from './right-panel-tabs';

export type RightPanelVariant = 'realtor' | 'broker';

// Every tab except 'browser' embeds an internal dashboard page.
export type EmbedTab = Exclude<RightPanelTab, 'browser' | 'workbench' | 'research' | 'workspace'>;

// `?embed=1` flips the dashboard layout into chrome-stripped mode so the iframe
// shows ONLY the page content (the People list, Deals kanban, Properties grid,
// Documents editor) — no nested sidebar, no nested header, no nested chat bar.
// The outer Chippi already owns all of those. See `EmbedDetector` (mounted in
// app/s/[slug]/layout.tsx AND app/broker/layout.tsx) and the
// `[data-chippi-embed='true']` rules in app/globals.css.
const REALTOR_TAB_PATHS: Record<EmbedTab, (slug: string) => string> = {
  // The default: Chippi's live work — the realtime activity feed of what it's
  // doing, drafting, and touching right now (not static CRM navigation).
  activity: (slug) => `/s/${slug}/chippi/activity?embed=1`,
  people: (slug) => `/s/${slug}/contacts?embed=1`,
  deals: (slug) => `/s/${slug}/deals?embed=1`,
  properties: (slug) => `/s/${slug}/properties?embed=1`,
  documents: (slug) => `/s/${slug}/documents?embed=1`,
};

// Broker embeds the brokerage-scoped routes. `activity` points at the
// brokerage-wide activity feed (/broker/activity). There is NO brokerage
// Documents surface, so 'documents' is intentionally absent here — and also
// omitted from the broker tab bar (OMITTED_TABS) so it can never be selected.
const BROKER_TAB_PATHS: Partial<Record<EmbedTab, () => string>> = {
  activity: () => `/broker/activity?embed=1`,
  people: () => `/broker/people?embed=1`,
  deals: () => `/broker/deals?embed=1`,
  properties: () => `/broker/properties?embed=1`,
};

/** Tabs a variant deliberately omits from the RightPanel tab bar. Broker has
 *  no brokerage-scoped Documents surface. */
export const OMITTED_TABS: Record<RightPanelVariant, ReadonlySet<RightPanelTab>> = {
  realtor: new Set<RightPanelTab>(),
  broker: new Set<RightPanelTab>(['documents']),
};

/** Whether a tab is offered for the given variant. */
export function isTabAvailable(variant: RightPanelVariant, tab: RightPanelTab): boolean {
  return !OMITTED_TABS[variant].has(tab);
}

/**
 * Resolve the embed URL for a tab under the active variant. Returns null when
 * the variant has no surface for that tab (e.g. broker + documents), so the
 * caller can fall back to the always-present live-work activity feed.
 */
export function embedSrcFor(
  variant: RightPanelVariant,
  tab: EmbedTab,
  slug: string,
): string | null {
  if (variant === 'broker') {
    const fn = BROKER_TAB_PATHS[tab];
    return fn ? fn() : null;
  }
  return REALTOR_TAB_PATHS[tab](slug);
}
