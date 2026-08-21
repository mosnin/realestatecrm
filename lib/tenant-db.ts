/**
 * Tenant-scope registry + positive query helper.
 *
 * This codebase enforces tenant isolation on the SERVER by manual
 * `.eq('spaceId', …)` / `.eq('brokerageId', …)` filters on the service-role
 * client — "the .eq() IS the security boundary" (CLAUDE.md). RLS is only a
 * backstop for the browser anon path. The past confirmed IDORs
 * (tests/api/tenant-isolation-idor.test.ts) were queries that forgot the
 * filter.
 *
 * TENANT_TABLES is the single source of truth for which tables hold tenant
 * data and which column scopes them. It powers:
 *   - lib/supabase-guard.ts   (runtime observer that flags unscoped reads)
 *   - scripts/audit-tenant-scope.mjs (CI regression gate)
 *   - tenantTable() below     (positive affordance for new code)
 *
 * Every scope column here is verified against the table's CREATE TABLE
 * migration (or, for the Prisma-baseline core tables, against the RLS
 * migrations that scope them). Omitting a table is safe (less coverage);
 * a WRONG column is the only real hazard, so only add verified entries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ScopeColumn = 'spaceId' | 'brokerageId';

/**
 * Table name → the column that scopes it to a tenant. A row in one of these
 * tables belongs to exactly one tenant, identified by this column.
 */
export const TENANT_TABLES: Record<string, ScopeColumn> = {
  // ── space-scoped (the realtor workspace) ────────────────────────────────
  Contact: 'spaceId',
  ContactActivity: 'spaceId',
  Deal: 'spaceId',
  DealStage: 'spaceId',
  DealActivity: 'spaceId',
  DealChecklistItem: 'spaceId',
  DealDocument: 'spaceId',
  Tour: 'spaceId',
  Property: 'spaceId',
  Pipeline: 'spaceId',
  Note: 'spaceId',
  File: 'spaceId',
  Brief: 'spaceId',
  Conversation: 'spaceId',
  AreaReport: 'spaceId',
  Attachment: 'spaceId',
  SignatureRequest: 'spaceId',
  ProfilePage: 'spaceId',
  CustomAgent: 'spaceId',
  IntegrationConnection: 'spaceId',
  StudioPost: 'spaceId',
  CallLog: 'spaceId',
  InboxThread: 'spaceId',
  InboxMessage: 'spaceId',
  Workflow: 'spaceId',
  Routine: 'spaceId',
  ScheduledMessage: 'spaceId',
  WorkSession: 'spaceId',
  SwarmRun: 'spaceId',
  AgentDraft: 'spaceId',
  AgentTask: 'spaceId',
  AgentActivityLog: 'spaceId',
  AgentMemory: 'spaceId',
  AppNotification: 'spaceId',
  ReviewCampaign: 'spaceId',
  BrowserLink: 'spaceId',
  BrowserPairingCode: 'spaceId',
  BrowserSession: 'spaceId',
  BrowserAction: 'spaceId',
  // Added after the security audit found these ACTIVELY QUERIED tenant tables
  // absent from the registry — meaning the scope guard was blind to exactly
  // the most sensitive sharing surfaces (tokenised CMA payloads, packet
  // documents, portal messages).
  CmaReport: 'spaceId',
  PropertyPacket: 'spaceId',
  ClientMessage: 'spaceId',
  ApplicationMessage: 'spaceId',
  ApplicationStatusUpdate: 'spaceId',
  SpaceSetting: 'spaceId',
  MessagingSuppression: 'spaceId',
  MessagingConsent: 'spaceId',
  WorkSessionAction: 'spaceId',
  // Chat + agent deliverables (highest PII / secret surface after Contact).
  // DealContact is intentionally omitted: it is a junction with no spaceId
  // column (scoped through Deal/Contact), so registering spaceId here would
  // be a WRONG column — the only real hazard this registry can introduce.
  Message: 'spaceId',
  Artifact: 'spaceId',
  ArtifactVersion: 'spaceId',
  ContactDocument: 'spaceId',
  GoogleCalendarToken: 'spaceId',
  McpApiKey: 'spaceId',
  ChatUsage: 'spaceId',
  Offer: 'spaceId',
  OfferEvent: 'spaceId',
  TourPropertyProfile: 'spaceId',
  TourAvailabilityOverride: 'spaceId',
  WorkspaceRun: 'spaceId',
  WorkspaceRunFile: 'spaceId',
  AgentPausedRun: 'spaceId',
  SavedView: 'spaceId',
  IntegrationEvent: 'spaceId',
  PushSubscription: 'spaceId',

  // ── brokerage-scoped (the broker/team surface) ──────────────────────────
  BrokerNotification: 'brokerageId',
  BrokerConversation: 'brokerageId',
  BrokerRoutine: 'brokerageId',
  DealReviewRequest: 'brokerageId',
  DealReviewComment: 'brokerageId',
  DealRoutingRule: 'brokerageId',
  BrokerageTemplate: 'brokerageId',
  Channel: 'brokerageId',
  ChannelMember: 'brokerageId',
  BrokerMessage: 'brokerageId',
};

export function isTenantTable(table: string): boolean {
  return Object.prototype.hasOwnProperty.call(TENANT_TABLES, table);
}

export function scopeColumnFor(table: string): ScopeColumn | null {
  return TENANT_TABLES[table] ?? null;
}

type Scope = { spaceId: string } | { brokerageId: string };

/**
 * Positive affordance: open a query on a tenant table with the scope filter
 * ALREADY applied, so it can't be forgotten. Use in NEW code and when
 * touching an old route — it returns the same PostgREST builder, so chain
 * `.select()/.update()/.delete()` as usual and the tenant `.eq` is guaranteed.
 *
 *   const { data } = await tenantTable(supabase, 'Contact', { spaceId })
 *     .select('id, name');
 *
 * Throws if the table isn't a known tenant table or the scope key doesn't
 * match the table's scope column (a spaceId scope on a brokerage table is a
 * bug worth failing loudly on). For the legitimate non-eq patterns
 * (post-fetch ownership check, capability token, verified-email portal,
 * admin cross-tenant), keep calling `supabase.from(...)` directly.
 */
// A minimally-typed view of a PostgREST builder. Using this instead of the
// full SupabaseClient generics is deliberate: passing tenantTable's ~40-literal
// table union into supabase-js's heavily-overloaded `.from()` signatures makes
// tsc instantiate the generic per-literal and OOM. This keeps inference O(1).
interface LooseBuilder {
  select: (columns?: string, options?: unknown) => LooseFilter;
  update: (values: Record<string, unknown>) => LooseFilter;
  delete: () => LooseFilter;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => any;
}
interface LooseFilter {
  // Return `any` so callers can keep chaining `.eq('id', …).maybeSingle()`
  // after the pre-applied tenant scope — the real PostgREST builder supports
  // that; a tighter type here blocked tenantTable() adoption.
  eq: (column: string, value: string) => any;
}
interface LooseClient {
  from: (table: string) => LooseBuilder;
}

export function tenantTable(client: SupabaseClient, table: string, scope: Scope) {
  const column = TENANT_TABLES[table];
  if (!column) {
    throw new Error(`tenantTable: "${table}" is not a registered tenant table`);
  }
  const value =
    column === 'spaceId'
      ? (scope as { spaceId?: string }).spaceId
      : (scope as { brokerageId?: string }).brokerageId;
  if (typeof value !== 'string' || !value) {
    throw new Error(
      `tenantTable: "${table}" is scoped by ${column}, but no ${column} was provided`,
    );
  }

  // PostgREST applies filters AFTER the operation is chosen, so the scope
  // `.eq` is threaded onto each operation's builder rather than the bare
  // `.from()`. `insert` takes no filter — instead we assert the payload
  // carries the correct scope so a row can't be written into another tenant.
  const base = (client as unknown as LooseClient).from(table);
  return {
    select: (columns?: string, options?: unknown) => base.select(columns, options).eq(column, value),
    update: (values: Record<string, unknown>) => base.update(values).eq(column, value),
    delete: () => base.delete().eq(column, value),
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(values) ? values : [values];
      for (const row of rows) {
        if (row[column] !== value) {
          throw new Error(
            `tenantTable: insert into "${table}" must set ${column}=${value} on every row`,
          );
        }
      }
      return base.insert(values);
    },
  };
}
