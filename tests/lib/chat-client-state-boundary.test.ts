import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

  it('prevents persisted realtor split-panel state from rendering on broker chat', () => {
    expect(workspaceSource).toContain('const effectiveIsSplit = !isBroker && isSplit;');
    expect(workspaceSource).toContain("style={{ width: effectiveIsSplit ? `${leftWidthPercent}%` : '100%' }}");
    expect(workspaceSource).toContain('{effectiveIsSplit && (');
  });

  it('labels the broker reviews link without realtor draft copy', () => {
    expect(workspaceSource).toContain("href={isBroker ? '/broker/reviews' : `/s/${slug}/chippi/inbox`}");
    expect(workspaceSource).toContain("{isBroker ? 'Reviews' : 'Drafts'}");
  });

  it('hides realtor approval polling chrome on the broker surface', () => {
    expect(workspaceSource).toContain('{!isBroker && <ApprovalsPill />}');
  });

  it('does not call realtor mention-search endpoints from the broker surface', () => {
    expect(workspaceSource).toContain('if (isBroker) {');
    expect(workspaceSource).toContain('broker-specific mentions should use dedicated');
    expect(workspaceSource).toContain('return results;');
    expect(workspaceSource).toContain('[isBroker, slug, mentionApps]');
  });
});
