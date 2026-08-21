/**
 * Tenant-guard enforcement + registry completeness.
 *
 * The security audit's headline finding: tenant isolation rests on ~1,900
 * hand-written .eq() filters, and the guard built to back that up was
 * telemetry-only in production (it logged an unscoped read and then served
 * it) with seven real tenant tables missing from its registry entirely. These
 * pin both halves of the fix.
 */

import { describe, it, expect } from 'vitest';
import { TENANT_TABLES, isTenantTable, scopeColumnFor } from '@/lib/tenant-db';

describe('TENANT_TABLES registry completeness', () => {
  it('covers the sharing surfaces the audit found missing', () => {
    // These are actively queried tenant tables that were absent, leaving the
    // guard blind to tokenised CMA payloads, packet docs, and portal messages.
    for (const t of [
      'CmaReport',
      'PropertyPacket',
      'ClientMessage',
      'ApplicationMessage',
      'ApplicationStatusUpdate',
      'SpaceSetting',
    ]) {
      expect(isTenantTable(t), `${t} must be a registered tenant table`).toBe(true);
      expect(scopeColumnFor(t)).toBe('spaceId');
    }
  });

  it('covers the tables added by this session’s features', () => {
    for (const t of ['MessagingSuppression', 'MessagingConsent', 'WorkSessionAction']) {
      expect(isTenantTable(t), `${t} must be registered`).toBe(true);
    }
  });

  it('covers chat, artifacts, tokens, and billing tables the guard was blind to', () => {
    for (const t of [
      'Message',
      'Artifact',
      'ArtifactVersion',
      'ContactDocument',
      'GoogleCalendarToken',
      'McpApiKey',
      'ChatUsage',
      'Offer',
      'OfferEvent',
      'TourPropertyProfile',
      'TourAvailabilityOverride',
      'WorkspaceRun',
      'WorkspaceRunFile',
      'AgentPausedRun',
      'SavedView',
      'IntegrationEvent',
      'PushSubscription',
    ]) {
      expect(isTenantTable(t), `${t} must be a registered tenant table`).toBe(true);
      expect(scopeColumnFor(t)).toBe('spaceId');
    }
    expect(scopeColumnFor('BrokerMessage')).toBe('brokerageId');
  });

  it('covers cycle-2 request-path tables with a verified scope column', () => {
    for (const t of [
      'WorkflowRun',
      'ConversationTurn',
      'ChannelMessage',
      'MessageTemplate',
      'NotificationPreference',
      'TourWaitlist',
      'TourFeedback',
      'StudioGeneration',
      'StudioBrand',
      'DripEnrollment',
      'DripSequence',
      'ClientDocument',
      'ClientInfoRequest',
      'CommissionSplit',
      'McpAuthCode',
      'CalendarEvent',
    ]) {
      expect(isTenantTable(t), `${t} must be a registered tenant table`).toBe(true);
    }
    expect(scopeColumnFor('ChannelMessage')).toBe('brokerageId');
    expect(scopeColumnFor('BrokerageIntegrationConnection')).toBe('brokerageId');
  });

  it('does not register DealContact as space-scoped (junction has no spaceId)', () => {
    expect(isTenantTable('DealContact')).toBe(false);
  });

  it('does not register ChannelMember as brokerage-scoped (junction has no brokerageId)', () => {
    expect(isTenantTable('ChannelMember')).toBe(false);
  });

  it('every registered table scopes by a real tenant column', () => {
    for (const [table, col] of Object.entries(TENANT_TABLES)) {
      expect(['spaceId', 'brokerageId'], `${table} has an invalid scope column`).toContain(col);
    }
  });

  it('does not classify genuinely global tables as tenant tables', () => {
    for (const t of ['User', 'Space', 'Brokerage']) {
      expect(isTenantTable(t), `${t} should not be scope-guarded as a tenant table`).toBe(false);
    }
  });
});
