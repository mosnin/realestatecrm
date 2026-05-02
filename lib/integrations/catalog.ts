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
  | 'communication'
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
}

/**
 * Catalog ordering matters — this is the order the realtor sees them.
 * Group within categories by use-frequency, not alphabetical.
 */
export const INTEGRATIONS: IntegrationApp[] = [
  // ── Email ────────────────────────────────────────────────────────────
  { toolkit: 'gmail', name: 'Gmail', blurb: 'Send drafts and watch for replies.', category: 'communication', promoted: true },
  { toolkit: 'outlook', name: 'Outlook', blurb: 'Send drafts and read replies.', category: 'communication', promoted: true },

  // ── Calendar ─────────────────────────────────────────────────────────
  { toolkit: 'googlecalendar', name: 'Google Calendar', blurb: 'Schedule tours, block time, see availability.', category: 'calendar', promoted: true },
  { toolkit: 'outlook_calendar', name: 'Outlook Calendar', blurb: 'Schedule tours, block time, see availability.', category: 'calendar', promoted: true },
  { toolkit: 'calendly', name: 'Calendly', blurb: 'Sync your booking link with Chippi.', category: 'calendar', promoted: true },
  { toolkit: 'cal', name: 'Cal.com', blurb: 'Open-source booking pages.', category: 'calendar' },

  // ── Team comms ───────────────────────────────────────────────────────
  { toolkit: 'slack', name: 'Slack', blurb: 'Post deals, alerts, and updates to your team channel.', category: 'communication', promoted: true },
  { toolkit: 'discord', name: 'Discord', blurb: 'Post deals and alerts to your team channel.', category: 'communication' },
  { toolkit: 'microsoft_teams', name: 'Microsoft Teams', blurb: 'Post deals and alerts to your team channel.', category: 'communication' },

  // ── Docs ─────────────────────────────────────────────────────────────
  { toolkit: 'notion', name: 'Notion', blurb: 'Capture deals, tours, and notes in your workspace.', category: 'docs', promoted: true },
  { toolkit: 'googledocs', name: 'Google Docs', blurb: 'Open and edit listing descriptions, scripts, briefs.', category: 'docs' },
  { toolkit: 'googlesheets', name: 'Google Sheets', blurb: 'Update lead trackers and pipeline reports.', category: 'docs', promoted: true },

  // ── Storage ──────────────────────────────────────────────────────────
  { toolkit: 'googledrive', name: 'Google Drive', blurb: 'Surface listing photos, contracts, MLS sheets.', category: 'storage' },
  { toolkit: 'onedrive', name: 'OneDrive', blurb: 'Surface listing photos, contracts, MLS sheets.', category: 'storage' },
  { toolkit: 'dropbox', name: 'Dropbox', blurb: 'Surface listing photos, contracts, MLS sheets.', category: 'storage' },

  // ── CRM (general) ────────────────────────────────────────────────────
  { toolkit: 'hubspot', name: 'HubSpot', blurb: 'Sync deals and contacts both ways.', category: 'crm', promoted: true },
  { toolkit: 'salesforce', name: 'Salesforce', blurb: 'Sync deals and contacts both ways.', category: 'crm' },
  { toolkit: 'pipedrive', name: 'Pipedrive', blurb: 'Sync deals and contacts both ways.', category: 'crm' },
  { toolkit: 'zoho', name: 'Zoho CRM', blurb: 'Sync deals and contacts both ways.', category: 'crm' },

  // ── Real estate ──────────────────────────────────────────────────────
  // Follow-up Boss: not a Composio toolkit today. We surface it here as
  // "Coming soon" via the UI and ship a custom adapter in a follow-up.
  { toolkit: 'follow_up_boss', name: 'Follow-up Boss', blurb: 'Sync your real-estate pipeline.', category: 'real-estate', promoted: true },

  // ── Documents + signing ──────────────────────────────────────────────
  { toolkit: 'docusign', name: 'DocuSign', blurb: 'Send contracts and disclosures for signature.', category: 'docs-sign', promoted: true },
  { toolkit: 'dropbox_sign', name: 'Dropbox Sign', blurb: 'Send contracts and disclosures for signature.', category: 'docs-sign' },

  // ── Tasks / project management ───────────────────────────────────────
  { toolkit: 'asana', name: 'Asana', blurb: 'Task list for follow-ups, listing prep, closing checklist.', category: 'tasks' },
  { toolkit: 'trello', name: 'Trello', blurb: 'Boards for prospects, listings, closings.', category: 'tasks' },
  { toolkit: 'linear', name: 'Linear', blurb: 'Track operational issues and team work.', category: 'tasks' },
  { toolkit: 'monday', name: 'Monday', blurb: 'Boards for prospects, listings, closings.', category: 'tasks' },

  // ── Forms / lead intake ──────────────────────────────────────────────
  { toolkit: 'typeform', name: 'Typeform', blurb: 'Pull form responses into Chippi as new leads.', category: 'forms' },
  { toolkit: 'googleforms', name: 'Google Forms', blurb: 'Pull form responses into Chippi as new leads.', category: 'forms' },

  // ── Video / meetings ─────────────────────────────────────────────────
  { toolkit: 'zoom', name: 'Zoom', blurb: 'Schedule virtual showings and broker calls.', category: 'video' },
  { toolkit: 'googlemeet', name: 'Google Meet', blurb: 'Schedule virtual showings and broker calls.', category: 'video' },

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
