import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompactResultList } from '@/components/ai/blocks/tool-results/compact-result-list';

describe('CompactResultList', () => {
  it('previews three rows and offers to open the rest', () => {
    vi.stubGlobal('React', React);
    try {
      const html = renderToStaticMarkup(createElement(CompactResultList, {
        noun: 'person',
        plural: 'people',
        items: [
          { id: '1', title: 'Sam Chen', subtitle: 'Hot' },
          { id: '2', title: 'Jane Ortiz', subtitle: 'Warm' },
          { id: '3', title: 'Lee Park' },
          { id: '4', title: 'Riley Ng' },
          { id: '5', title: 'Chris Adeyemi' },
        ],
        children: createElement('div', null, 'full table'),
      }));
      expect(html).toContain('Sam Chen');
      expect(html).toContain('Show all 5 people');
      expect(html).toContain('full table');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
