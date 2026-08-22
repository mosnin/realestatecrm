import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('Chippi draft inbox surface', () => {
  const page = read('app/s/[slug]/chippi/inbox/page.tsx');
  const inbox = read('components/agent/agent-draft-inbox.tsx');

  it('routes the Chippi Inbox to the pending AgentDraft queue', () => {
    expect(page).toContain('greeting="Inbox."');
    expect(page).toContain("`${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} ready.`");
    expect(page).toContain(".from('AgentDraft')");
    expect(page).toContain(".eq('status', 'pending')");
    expect(page).toContain('<AgentDraftInbox slug={slug} />');
    expect(page).not.toContain(".from('AgentTask')");
  });

  it('keeps the inbox scan-first and exposes only the row actions', () => {
    expect(inbox).toContain('StaggerList className="divide-y divide-border/60 pt-4"');
    expect(inbox).toContain('Approve & send');
    expect(inbox).toContain('Edit');
    expect(inbox).toContain('Dismiss');
    expect(inbox).not.toContain('group-hover/row:opacity-100');

    // Copy is still used for the explicit delivery fallback notice, but it is
    // not a per-message control in the inbox row.
    expect(inbox).not.toContain('aria-label="Copy message"');
    expect(inbox).not.toContain('copyContent');
    expect(inbox).not.toContain('group-hover/content:opacity-100');
  });
});
