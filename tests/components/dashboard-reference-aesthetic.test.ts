import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MobileNav } from '@/components/dashboard/mobile-nav';
const path = vi.hoisted(() => ({ current: '/s/oak/chippi/brief' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));
vi.stubGlobal('React', React);

describe('Daily mobile navigation', () => {
  it('keeps Today visible and selected on the daily screen with visible labels', () => {
    path.current = '/s/oak/chippi/brief';
    const html = renderToStaticMarkup(React.createElement(MobileNav, { slug: 'oak' }));
    for (const label of ['Today', 'People', 'Deals', 'Calendar', 'Settings']) expect(html).toContain(`>${label}</span>`);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/s\/oak\/chippi\/brief"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
  it('lets the chat composer own the bottom edge only on the chat root', () => {
    path.current = '/s/oak/chippi';
    expect(renderToStaticMarkup(React.createElement(MobileNav, { slug: 'oak' }))).toBe('');
    path.current = '/s/oak/chippi/activity';
    expect(renderToStaticMarkup(React.createElement(MobileNav, { slug: 'oak' }))).toContain('>Today</span>');
  });
  it('gives brokerages labeled lead and team destinations', () => {
    path.current = '/broker/brief';
    const html = renderToStaticMarkup(React.createElement(MobileNav, { slug: 'oak', isBroker: true }));
    expect(html).toContain('href="/broker/leads"');
    expect(html).toContain('>Team</span>');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/broker\/brief"/);
  });
});
