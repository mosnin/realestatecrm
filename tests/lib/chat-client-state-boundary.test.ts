import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  embedSrcFor,
  isTabAvailable,
} from '@/components/chippi/right-panel-embeds';

const ROOT = process.cwd();
const hookSource = readFileSync(
  path.join(ROOT, 'components/ai/hooks/use-agent-task.ts'),
  'utf8',
);
const workspaceSource = readFileSync(
  path.join(ROOT, 'components/chippi/chippi-workspace.tsx'),
  'utf8',
);

describe('chat client-side boundary state', () => {
  it('scopes always-allow session storage by chat surface endpoint and conversation id', () => {
    expect(hookSource).toContain('const STORAGE_PREFIX = `agent-allow:${taskEndpoint}:`;');
    expect(hookSource).toContain('STORAGE_PREFIX + initialConversationId');
    expect(hookSource).toContain('STORAGE_PREFIX + cid');
  });

  it('clears stale transcript state before loading a different conversation', () => {
    expect(workspaceSource).toContain('setActiveConversationId(targetId);');
    expect(workspaceSource).toContain('setMessages([]);');
    expect(workspaceSource).toContain('loadedConvIdRef.current = targetId;');
  });

  it('removes inaccessible conversation ids instead of showing stale history', () => {
    expect(workspaceSource).toContain("next.delete('conversationId')");
    expect(workspaceSource).toContain("router.replace(`${endpoints.routeBase}${qs ? `?${qs}` : ''}`");
  });

  it('encodes conversation ids when building client URLs and message fetches', () => {
    expect(workspaceSource).toContain('conversationId=${encodeURIComponent(convId)}');
    expect(workspaceSource).toContain('conversationId=${encodeURIComponent(conv.id)}');
    expect(workspaceSource).toContain('conversationId=${encodeURIComponent(id)}');
    expect(workspaceSource).toContain('`${conversationItemBase}/${encodeURIComponent(id)}`');
  });

  // The broker split panel is now enabled (feature parity with realtor), but
  // it must embed the BROKERAGE-scoped /broker/* routes — never the realtor
  // space-scoped /s/<slug>/* routes — even when the split-panel state (shared
  // across variants via localStorage) carries a stale realtor tab.
  it('embeds brokerage-scoped routes for the broker split panel, never realtor space routes', () => {
    expect(embedSrcFor('broker', 'people', 'acme')).toBe('/broker/people?embed=1');
    expect(embedSrcFor('broker', 'deals', 'acme')).toBe('/broker/deals?embed=1');
    expect(embedSrcFor('broker', 'properties', 'acme')).toBe('/broker/properties?embed=1');
    // Universal live-work feed → the brokerage-wide activity surface.
    expect(embedSrcFor('broker', 'activity', 'acme')).toBe('/broker/activity?embed=1');
    // No broker URL ever leaks the realtor space slug.
    for (const tab of ['people', 'deals', 'properties', 'activity'] as const) {
      expect(embedSrcFor('broker', tab, 'acme')).not.toContain('/s/');
    }
  });

  it('has no brokerage Documents surface, so the broker panel omits it and falls back to activity', () => {
    // The Documents tab is not offered on the broker variant…
    expect(isTabAvailable('broker', 'documents')).toBe(false);
    expect(isTabAvailable('realtor', 'documents')).toBe(true);
    // …and a stale persisted 'documents' tab has no broker embed URL (null),
    // which the panel treats as a fall-back to the live-work activity feed.
    expect(embedSrcFor('broker', 'documents', 'acme')).toBeNull();
  });

  it('keeps the realtor split panel pointed at space-scoped routes', () => {
    expect(embedSrcFor('realtor', 'people', 'acme')).toBe('/s/acme/contacts?embed=1');
    expect(embedSrcFor('realtor', 'deals', 'acme')).toBe('/s/acme/deals?embed=1');
    expect(embedSrcFor('realtor', 'documents', 'acme')).toBe('/s/acme/documents?embed=1');
    expect(embedSrcFor('realtor', 'activity', 'acme')).toBe('/s/acme/chippi/activity?embed=1');
  });

  it('labels the broker reviews link without realtor draft copy', () => {
    expect(workspaceSource).toContain("href={isBroker ? '/broker/reviews' : `/s/${slug}/chippi/inbox`}");
    expect(workspaceSource).toContain("{isBroker ? 'Reviews' : 'Drafts'}");
  });

  it('hides realtor approval polling chrome on the broker surface', () => {
    expect(workspaceSource).toContain('{!isBroker && <ApprovalsPill />}');
  });

  // Broker @-mentions now resolve through the brokerage-scoped endpoint
  // (/api/broker/mentions — behaviorally covered in tests/api/broker-mentions.test.ts),
  // and the broker branch returns BEFORE the realtor space-scoped fetches, so the
  // broker surface never probes /api/contacts?slug= or /api/deals?slug=.
  it('routes broker @-mentions through the brokerage-scoped endpoint, not realtor space endpoints', () => {
    expect(workspaceSource).toContain('if (isBroker) {');
    expect(workspaceSource).toContain('/api/broker/mentions?search=${encodeURIComponent(query)}');
    // The realtor-only endpoints still exist, but only past the broker branch's return.
    const brokerIdx = workspaceSource.indexOf('/api/broker/mentions?search=');
    const realtorContactsIdx = workspaceSource.indexOf('/api/contacts?slug=');
    expect(brokerIdx).toBeGreaterThan(-1);
    expect(realtorContactsIdx).toBeGreaterThan(brokerIdx);
  });
});
