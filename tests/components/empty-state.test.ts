import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders an href action as one link control', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: 'Nothing here yet.',
        action: { label: 'Create something', href: '/create' },
      }),
    );

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/create"');
    expect(html).not.toContain('<a href="/create"><button');
    expect(html).not.toContain('<button');
  });
});
