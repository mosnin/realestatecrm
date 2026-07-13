import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('offboarded access route', () => {
  it('renders a real destination for review-page access gates', () => {
    const listPage = readFileSync('app/s/[slug]/reviews/page.tsx', 'utf8');
    const detailPage = readFileSync('app/s/[slug]/reviews/[id]/page.tsx', 'utf8');

    expect(listPage).toContain("redirect('/offboarded')");
    expect(detailPage).toContain("redirect('/offboarded')");
    expect(existsSync('app/offboarded/page.tsx')).toBe(true);
  });

  it('offers a safe sign-out path and support contact', () => {
    const page = readFileSync('app/offboarded/page.tsx', 'utf8');

    expect(page).toContain("signOut({ redirectUrl: '/login/realtor' })");
    expect(page).toContain('mailto:help@usechippi.com');
  });
});
