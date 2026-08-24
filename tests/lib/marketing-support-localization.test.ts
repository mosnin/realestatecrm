import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';

const PRIMARY_PAGES = [
  'agents',
  'brokerages',
  'chippi',
  'integrations',
  'company',
  'careers',
  'demo',
] as const;

const source = (path: string) => readFileSync(path, 'utf8');

describe('supporting marketing localization', () => {
  it('ships complete Spanish and Russian dictionaries for every primary page', () => {
    for (const page of PRIMARY_PAGES) {
      expect(MARKETING_PAGE_DICTS.es[page]).toBeDefined();
      expect(MARKETING_PAGE_DICTS.ru[page]).toBeDefined();
      expect(JSON.stringify(MARKETING_PAGE_DICTS.es[page])).not.toBe(
        JSON.stringify(MARKETING_PAGE_DICTS.en[page]),
      );
      expect(JSON.stringify(MARKETING_PAGE_DICTS.ru[page])).not.toBe(
        JSON.stringify(MARKETING_PAGE_DICTS.en[page]),
      );
    }
  });

  it('settles body copy and shared chrome from the middleware language', () => {
    const layout = source('app/(marketing)/layout.tsx');
    expect(layout).toContain('getRequestLang');
    expect(layout).toContain('lang ?? (await getRequestLang())');
    expect(layout).toContain('<SiteHeader lang={resolvedLang} />');
    expect(layout).toContain('<SiteFooter lang={resolvedLang} />');

    for (const page of PRIMARY_PAGES) {
      const body = source(`app/(marketing)/${page}/page.tsx`);
      expect(body).toContain('MARKETING_PAGE_DICTS');
      expect(body).toContain('getRequestLang');
    }
  });

  it('forces a full document navigation when the visitor changes language', () => {
    const switcher = source('components/marketing/local-price.tsx');
    expect(switcher).toContain('window.location.assign(href)');
  });

  it('keeps supporting page prices annual first and local currency aware', () => {
    const teaser = source('components/marketing/giga/pricing-teaser.tsx');
    expect(teaser).toContain('ANNUAL_FACTOR = 0.8');
    expect(teaser).toContain('useDisplayCurrency');
    expect(teaser).toContain('CurrencyNote');
    expect(teaser).toContain("localizedPath('/pricing', lang)");
    expect(teaser).toContain('billedAnnually');
    expect(teaser).not.toContain("price: '$");
  });
});
