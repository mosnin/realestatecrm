import { describe, expect, it } from 'vitest';
import { pausedRunActiveWorkbookFields } from '@/lib/ai-tools/sdk-chat-stream';
import type { ToolContext } from '@/lib/ai-tools/types';

const base: ToolContext = {
  userId: 'u1',
  space: { id: 's1', slug: 'demo', name: 'Demo', ownerId: 'u1' },
  signal: new AbortController().signal,
};

describe('paused Workbench authority persistence', () => {
  it('does not add a new column to ordinary feature-off pause inserts', () => {
    expect(pausedRunActiveWorkbookFields(base)).toEqual({});
  });

  it('persists only the server-derived workbook identity for a Workbench pause', () => {
    expect(pausedRunActiveWorkbookFields({
      ...base,
      activeWorkbook: { artifactId: 'artifact-1', versionNumber: 2, title: 'buyers.csv' },
    })).toEqual({
      activeWorkbookContext: { artifactId: 'artifact-1', versionNumber: 2, title: 'buyers.csv' },
    });
  });
});
