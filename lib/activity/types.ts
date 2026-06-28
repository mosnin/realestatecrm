/**
 * Unified activity timeline — shared types.
 *
 * The "what Chippi did" feed merges eight independent sources (agent actions,
 * run dispatches, drafts, workflow runs, scheduled messages, integration
 * events, routine runs, and agent-origin outbound sends) into one chronological
 * stream. Each source has its own table, sort column, and status vocabulary;
 * this module defines the single normalized shape every source maps onto so the
 * query layer can merge + sort them and the (future) UI can render one list.
 *
 * Design notes:
 *  - `id` is GLOBALLY unique: every normalizer prefixes the source's row id with
 *    a source tag (e.g. `draft:${id}`) so two sources can never collide on a raw
 *    uuid. The feed uses it as a React key and a cursor-free dedupe anchor.
 *  - `link` is a STRUCTURED HINT, not an href. The data layer has no slug (a
 *    space's URL prefix), so baking a path here would be wrong. The UI resolves
 *    `{ kind, id }` against the active space's slug.
 *  - No raw payloads. Normalizers copy only curated text columns (title,
 *    summary, reasoning, instruction…) into `title`/`summary` — never the raw
 *    jsonb `payload`/`metadata`/`triggerEvent`, which may hold secrets.
 */

/** One discriminator per source kind. Drives the UI's icon/label per item. */
export type ActivityKind =
  | 'agent_action'
  | 'agent_dispatch'
  | 'draft'
  | 'workflow_run'
  | 'scheduled_message'
  | 'integration_event'
  | 'routine_run'
  | 'outbound_message';

/** The eight source tables, camelCased. One ActivitySource per ActivityKind. */
export type ActivitySource =
  | 'agentActivityLog'
  | 'agentRunLedger'
  | 'agentDraft'
  | 'workflowRun'
  | 'scheduledMessage'
  | 'integrationEvent'
  | 'routine'
  | 'contactActivity';

/** Unified status: every source's status vocabulary collapses onto these five. */
export type ActivityStatus = 'success' | 'pending' | 'failed' | 'skipped' | 'info';

/** Visual tone the UI maps to a color. One tone per ActivityStatus (info→muted). */
export type ActivityTone = 'green' | 'amber' | 'rose' | 'muted';

/**
 * A structured link hint. The data layer never knows the space slug, so it emits
 * the intent (jump to a contact / deal / workflow / inbox / integrations /
 * routines view) and an optional id; the UI builds the slug-scoped href.
 */
export interface ActivityLink {
  kind: 'contact' | 'deal' | 'workflow' | 'inbox' | 'integrations' | 'routines';
  id?: string;
}

/**
 * One normalized timeline entry. Every source normalizer returns this shape.
 * Optional fields are present only when the source row carried them.
 */
export interface UnifiedActivityItem {
  /** Globally-unique, source-prefixed id, e.g. `draft:${rowId}`. */
  id: string;
  source: ActivitySource;
  kind: ActivityKind;
  /** One-line human title. Curated text only — never a raw payload. */
  title: string;
  /** Optional supporting detail. Curated text only. */
  summary?: string;
  status: ActivityStatus;
  tone: ActivityTone;
  /** ISO timestamp the feed sorts by (the source's sort column, as ISO). */
  occurredAt: string;
  toolkit?: string;
  channel?: string;
  relatedContactId?: string;
  relatedDealId?: string;
  relatedWorkflowId?: string;
  link?: ActivityLink;
}
