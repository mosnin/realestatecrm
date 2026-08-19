import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PermissionPromptView } from '@/components/ai/blocks/permission-prompt-view';

describe('PermissionPromptView human copy', () => {
  it('asks about the deal move and hides raw JSON ids', () => {
    vi.stubGlobal('React', React);
    try {
      const html = renderToStaticMarkup(createElement(PermissionPromptView, {
        prompt: {
          requestId: 'req_1',
          callId: 'call_1',
          name: 'create_deal',
          summary: 'Create deal "Oak Street"',
          args: {
            title: 'Oak Street',
            value: 450000,
            dealId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          },
        },
        onApprove: async () => undefined,
        onDeny: async () => undefined,
      }));
      expect(html).toContain('Create this deal?');
      expect(html).toContain('Oak Street');
      expect(html).toContain('$450,000');
      expect(html).toMatch(/Don(&#x27;|')t/);
      expect(html).not.toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(html).not.toContain('Allow this tool to run?');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
