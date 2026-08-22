import { describe, expect, it } from 'vitest';
import { briefEmailHtml } from '@/lib/briefing/email-template';
import { FONT_SANS_STACK, FONT_SERIF_STACK } from '@/lib/typography';
import type { Brief } from '@/lib/briefing/types';

const brief: Brief = {
  headline: 'Three tours need a confirm.',
  subheadline: 'Drafted the check-ins.',
  cards: [],
  tip: null,
  momentum: null,
  tomorrow: null,
  emptyState: null,
  sourcesUsed: [],
};

describe('briefEmailHtml', () => {
  it('uses the product Times + system-sans stacks', () => {
    const html = briefEmailHtml({
      brief,
      spaceSlug: 'jane',
      briefDate: '2026-08-19',
      appOrigin: 'https://www.usechippi.com',
      unsubscribeUrl: 'https://www.usechippi.com/unsub',
      businessName: 'Jane Realty',
    });
    expect(html).toContain(`font-family:${FONT_SANS_STACK}`);
    expect(html).toContain(`font-family:${FONT_SERIF_STACK}`);
    expect(html).toContain('Three tours need a confirm.');
  });
});
