/**
 * The catalog of third-party apps Chippi can connect to. One entry per app
 * the realtor sees in the integrations panel. Composio's catalog has 100+
 * toolkits — we curate the subset that matters for a real-estate workflow
 * and surface those by name. The rest are reachable but not promoted.
 *
 * Curation principles (Jobs lens):
 *   - Default-promote the apps a realtor would already pay for. No "browse
 *     all 100" wall.
 *   - One entry per app, one connect button per entry. No multi-step
 *     wizards inside an entry.
 *   - Categories are guidance, not a filter dropdown — they help the
 *     realtor scan, not configure.
 *
 * The `toolkit` slug is what Composio knows the app as. We pass it
 * verbatim to `composio.toolkits.get(slug)` and to `composio.tools.list({
 * toolkits: [slug] })`. Don't change a slug without verifying against
 * Composio's live catalog.
 */

export type IntegrationCategory =
  | 'email'
  | 'messaging'
  | 'calendar'
  | 'docs'
  | 'crm'
  | 'real-estate'
  | 'docs-sign'
  | 'tasks'
  | 'forms'
  | 'video'
  | 'storage';

export interface IntegrationApp {
  /** Composio toolkit slug — the canonical id we pass to the SDK. */
  toolkit: string;
  /** Display name shown to the realtor. */
  name: string;
  /** One-line description. Realtor language, no marketing fluff. */
  blurb: string;
  category: IntegrationCategory;
  /**
   * Promoted apps appear at the top of the integrations panel. Non-
   * promoted apps still connect but live in a "More" section. Default
   * true — anything in this catalog is at least curated.
   */
  promoted?: boolean;
  /**
   * True for apps we surface in the catalog but don't yet have a Composio
   * toolkit (or custom adapter) for. The UI renders a disabled
   * "Coming soon" pill instead of a Connect button. The connect route
   * 501s the slug as a defense-in-depth check — even if a stale client
   * sends a request, the route names the app and refuses cleanly.
   *
   * No active OAuth path → no IntegrationConnection row → these slugs
   * never reach the chat agent's tool list. Zero risk to the runtime.
   */
  comingSoon?: boolean;
}

/**
 * Slugs that exist in the catalog but have no Composio toolkit (or custom
 * adapter) behind them yet. The connect route 501s these and the UI renders
 * them as a disabled "Coming soon" pill. Single source of truth so the
 * route and the catalog can't drift.
 */
export const COMING_SOON_TOOLKITS = new Set<string>([
  'follow_up_boss',
  'compass',
  'boomtown',
  'kvcore',
  'real_geeks',
]);

/**
 * Catalog ordering matters — this is the order the realtor sees them.
 * Group within categories by use-frequency, not alphabetical.
 */
export const INTEGRATIONS: IntegrationApp[] = [
  // ── Email ────────────────────────────────────────────────────────────
  { toolkit: 'gmail', name: 'Gmail', blurb: 'Send drafts and watch for replies.', category: 'email', promoted: true },
  { toolkit: 'outlook', name: 'Outlook', blurb: 'Same, for Microsoft accounts.', category: 'email', promoted: true },

  // ── Calendar ─────────────────────────────────────────────────────────
  { toolkit: 'googlecalendar', name: 'Google Calendar', blurb: 'Schedule tours, block time, see availability.', category: 'calendar', promoted: true },
  { toolkit: 'outlook_calendar', name: 'Outlook Calendar', blurb: 'Same, for Microsoft accounts.', category: 'calendar', promoted: true },
  { toolkit: 'calendly', name: 'Calendly', blurb: 'Sync your booking link with Chippi.', category: 'calendar', promoted: true },
  { toolkit: 'cal', name: 'Cal.com', blurb: 'Open-source booking pages.', category: 'calendar' },

  // ── Messaging ────────────────────────────────────────────────────────
  { toolkit: 'slack', name: 'Slack', blurb: 'Post deals, alerts, and updates to your team channel.', category: 'messaging', promoted: true },
  { toolkit: 'discord', name: 'Discord', blurb: 'Same, for Discord servers.', category: 'messaging' },
  { toolkit: 'microsoft_teams', name: 'Microsoft Teams', blurb: 'Same, for Teams channels.', category: 'messaging' },

  // ── Docs ─────────────────────────────────────────────────────────────
  { toolkit: 'notion', name: 'Notion', blurb: 'Capture deals, tours, and notes in your workspace.', category: 'docs', promoted: true },
  { toolkit: 'googledocs', name: 'Google Docs', blurb: 'Open and edit listing descriptions, scripts, briefs.', category: 'docs' },
  { toolkit: 'googlesheets', name: 'Google Sheets', blurb: 'Update lead trackers and pipeline reports.', category: 'docs', promoted: true },

  // ── Storage ──────────────────────────────────────────────────────────
  { toolkit: 'googledrive', name: 'Google Drive', blurb: 'Pull listing photos and disclosures Chippi can attach to drafts.', category: 'storage' },
  { toolkit: 'onedrive', name: 'OneDrive', blurb: 'Same, for Microsoft accounts.', category: 'storage' },
  { toolkit: 'dropbox', name: 'Dropbox', blurb: 'Same, for Dropbox.', category: 'storage' },

  // ── CRM (general) ────────────────────────────────────────────────────
  // HubSpot is the one most realtors land on. The rest are here for the
  // brokerage that already lives inside Salesforce/Pipedrive/Zoho — we
  // call out what's distinct so the row doesn't read as catalog padding.
  { toolkit: 'hubspot', name: 'HubSpot', blurb: 'Sync deals and contacts both ways.', category: 'crm', promoted: true },
  { toolkit: 'salesforce', name: 'Salesforce', blurb: 'Mirror to your brokerage Salesforce org.', category: 'crm' },
  { toolkit: 'pipedrive', name: 'Pipedrive', blurb: 'Push pipeline stages into Pipedrive.', category: 'crm' },
  { toolkit: 'zoho', name: 'Zoho CRM', blurb: 'Two-way sync with Zoho.', category: 'crm' },

  // ── Real estate ──────────────────────────────────────────────────────
  // None of these have a Composio toolkit today. We surface them in the
  // catalog so the realtor sees their working set is recognized, render a
  // disabled "Coming soon" pill, and ship custom adapters in follow-ups.
  // Slugs are the canonical name in `snake_case` to match `follow_up_boss`.
  { toolkit: 'follow_up_boss', name: 'Follow-up Boss', blurb: 'Sync your Follow-up Boss pipeline into Chippi.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'compass', name: 'Compass', blurb: 'Sync your Compass pipeline.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'boomtown', name: 'BoomTown', blurb: 'Pull BoomTown leads into Chippi.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'kvcore', name: 'kvCORE', blurb: 'Pull kvCORE leads and tasks into Chippi.', category: 'real-estate', promoted: true, comingSoon: true },
  { toolkit: 'real_geeks', name: 'Real Geeks', blurb: 'Pull Real Geeks leads into Chippi.', category: 'real-estate', comingSoon: true },

  // ── Documents + signing ──────────────────────────────────────────────
  { toolkit: 'docusign', name: 'DocuSign', blurb: 'Send contracts and disclosures for signature.', category: 'docs-sign', promoted: true },
  { toolkit: 'dropbox_sign', name: 'Dropbox Sign', blurb: 'Same, for Dropbox Sign.', category: 'docs-sign' },

  // ── Tasks / project management ───────────────────────────────────────
  { toolkit: 'asana', name: 'Asana', blurb: 'Task list for follow-ups, listing prep, closing checklist.', category: 'tasks' },
  { toolkit: 'trello', name: 'Trello', blurb: 'Boards for prospects, listings, closings.', category: 'tasks' },

  // ── Forms / lead intake ──────────────────────────────────────────────
  { toolkit: 'typeform', name: 'Typeform', blurb: 'Pull form responses into Chippi as new leads.', category: 'forms' },
  { toolkit: 'googleforms', name: 'Google Forms', blurb: 'Same, for Google Forms.', category: 'forms' },

  // ── Video / meetings ─────────────────────────────────────────────────
  { toolkit: 'zoom', name: 'Zoom', blurb: 'Schedule virtual showings and broker calls.', category: 'video' },
  { toolkit: 'googlemeet', name: 'Google Meet', blurb: 'Same, for Google Meet.', category: 'video' },

  // ── Spreadsheets / lists ─────────────────────────────────────────────
  { toolkit: 'airtable', name: 'Airtable', blurb: 'Two-way sync for custom pipelines and lists.', category: 'docs' },
];

/** Look up by slug. Returns undefined for unknown toolkits. */
export function findIntegration(toolkit: string): IntegrationApp | undefined {
  return INTEGRATIONS.find((a) => a.toolkit === toolkit);
}

/** All toolkit slugs Composio knows about for our app. */
export function allToolkitSlugs(): string[] {
  return INTEGRATIONS.map((a) => a.toolkit);
}

/** Toolkits we surface in the Connect panel's primary section. */
export function promotedIntegrations(): IntegrationApp[] {
  return INTEGRATIONS.filter((a) => a.promoted);
}

/** Group by category for the integrations panel. */
export function integrationsByCategory(): Record<IntegrationCategory, IntegrationApp[]> {
  const grouped = {} as Record<IntegrationCategory, IntegrationApp[]>;
  for (const app of INTEGRATIONS) {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  }
  return grouped;
}
