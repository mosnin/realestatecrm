import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWorkbookTransformIntent } from '@/lib/chippi/workbench-intent';
import { getChatTools } from '@/lib/ai-tools/toolsets';

describe('active Workbench follow-up intent', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'true');
  });
  it.each([
    'normalize the emails and phone numbers',
    'remove duplicate rows',
    'trim whitespace in this spreadsheet',
    'rename a column',
    'add a follow-up status column',
    'tag every row',
  ])('recognizes the closed transform request: %s', (message) => {
    expect(isWorkbookTransformIntent(message)).toBe(true);
    const tools = getChatTools(message).map((tool) => tool.name);
    expect(tools).toContain('inspect_workbook');
    expect(tools).toContain('apply_workbook_transformation');
  });

  it.each([
    'hi there',
    'what is on my calendar?',
    'clean up my pipeline',
    'tag every contact',
  ])('does not hijack ordinary CRM language: %s', (message) => {
    expect(isWorkbookTransformIntent(message)).toBe(false);
  });
});
