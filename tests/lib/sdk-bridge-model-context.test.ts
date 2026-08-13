import { describe, expect, it } from 'vitest';
import { MAX_TOOL_MODEL_CONTEXT_BYTES, serialiseResult } from '@/lib/ai-tools/sdk-bridge';

describe('model-only tool context boundary', () => {
  it('passes bounded model context without putting it in UI data', () => {
    expect(serialiseResult({ summary: 'Inspected workbook.', modelContext: 'UNTRUSTED_DATA: {"columns":["Email"]}' }))
      .toContain('UNTRUSTED_DATA');
  });

  it('omits oversized model context instead of replaying it into the agent transcript', () => {
    const result = serialiseResult({ summary: 'Inspected workbook.', modelContext: 'x'.repeat(MAX_TOOL_MODEL_CONTEXT_BYTES + 1) });
    expect(result).toBe('Inspected workbook.');
  });
});
