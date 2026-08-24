import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('marketing claims', () => {
  it('does not present unverified compliance certifications', () => {
    const footer = readFileSync('components/marketing/giga/footer.tsx', 'utf8');
    const chromeCopy = readFileSync('lib/i18n/dictionaries/chrome.ts', 'utf8');
    const source = `${footer}\n${chromeCopy}`;

    expect(source).not.toContain("'SOC 2'");
    expect(source).not.toContain("'ISO 27001'");
    expect(source).not.toContain("'GDPR'");
    expect(source).not.toMatch(/>\s*Compliant\s*</);
    expect(source).toContain('Built for control');
  });

  it('does not publish sample testimonials as customer quotes', () => {
    const homepage = readFileSync('app/(marketing)/page.tsx', 'utf8');

    expect(homepage).not.toContain('TestimonialsBand');
  });

  it('does not imply unapproved customer relationships', () => {
    const hero = readFileSync('components/marketing/giga/hero.tsx', 'utf8');
    const homeCopy = readFileSync('lib/i18n/dictionaries/home.ts', 'utf8');
    const source = `${hero}\n${homeCopy}`;

    expect(source).not.toContain('Trusted across modern brokerages');
    expect(source).not.toContain("'Compass'");
    expect(source).not.toContain("'RE/MAX'");
    expect(source).toContain('Your AI lead conversion teammate');
  });

  it('does not publish illustrative job openings', () => {
    const careers = readFileSync('app/(marketing)/careers/page.tsx', 'utf8');
    const marketingCopy = readFileSync(
      'lib/i18n/dictionaries/marketing-pages.ts',
      'utf8',
    );
    const source = `${careers}\n${marketingCopy}`;

    expect(source).not.toContain('Head of PR, Europe');
    expect(source).not.toContain('Head of Growth Marketing');
    expect(careers).toContain('MARKETING_PAGE_DICTS[lang].careers');
    expect(marketingCopy).toContain(
      "openingsHeadline: 'No open roles right now.'",
    );
    expect(marketingCopy).toContain(
      "openingsHeadline: 'No hay puestos abiertos ahora.'",
    );
    expect(marketingCopy).toContain(
      "openingsHeadline: 'Сейчас открытых позиций нет.'",
    );
  });

  it('does not publish sample research as completed studies', () => {
    const research = readFileSync('app/(marketing)/research/page.tsx', 'utf8');

    expect(research).not.toContain('1,200 Inbound Inquiries');
    expect(research).not.toContain('540 shadowed hours');
    expect(research).not.toContain('Interviews with 80 agents');
    expect(research).toContain('Publication in progress.');
  });
});
