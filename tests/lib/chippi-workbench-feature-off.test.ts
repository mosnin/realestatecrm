import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChatTools } from '@/lib/ai-tools/toolsets';
import { openSpreadsheetInWorkbenchTool } from '@/lib/ai-tools/tools/open-spreadsheet-in-workbench';
import type { ToolContext } from '@/lib/ai-tools/types';
import { isExplicitWorkbenchIntent } from '@/lib/chippi/workbench-intent';

const ctx: ToolContext = { userId: 'u', space: { id: 's', slug: 's', name: 'S', ownerId: 'u' }, signal: new AbortController().signal, attachmentIds: ['a'] };

afterEach(() => vi.unstubAllEnvs());

describe('feature-off Workbench', () => {
  it('does not advertise the Workbench tool while disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'false');
    expect(getChatTools('open this spreadsheet in workbench').map((tool) => tool.name)).not.toContain('open_spreadsheet_in_workbench');
  });

  it('fails closed before looking up an attachment while disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'false');
    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'a', attachmentFilename: 'a.csv' }, ctx);
    expect(result.display).toBe('warning');
    expect(result.summary).toMatch(/not enabled/i);
  });

  it('only overrides normal routing for explicit open/edit Workbench intent', () => {
    expect(isExplicitWorkbenchIntent('Open this CSV in Workbench')).toBe(true);
    expect(isExplicitWorkbenchIntent('Edit this spreadsheet')).toBe(true);
    expect(isExplicitWorkbenchIntent('Summarize this CSV')).toBe(false);
    expect(isExplicitWorkbenchIntent('What is in this spreadsheet?')).toBe(false);
  });
});
