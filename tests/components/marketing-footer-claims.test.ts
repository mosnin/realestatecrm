import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('marketing claims', () => {
  it('does not present unverified compliance certifications', () => {
    const source = readFileSync('components/marketing/giga/footer.tsx', 'utf8');

    expect(source).not.toContain("'SOC 2'");
    expect(source).not.toContain("'ISO 27001'");
    expect(source).not.toContain("'GDPR'");
    expect(source).not.toMatch(/>\s*Compliant\s*</);
    expect(source).toContain('Security controls');
  });

  it('does not publish sample testimonials as customer quotes', () => {
    const homepage = readFileSync('app/(marketing)/page.tsx', 'utf8');

    expect(homepage).not.toContain('TestimonialsBand');
  });

  it('does not imply unapproved customer relationships', () => {
    const hero = readFileSync('components/marketing/giga/hero.tsx', 'utf8');

    expect(hero).not.toContain('Trusted across modern brokerages');
    expect(hero).not.toContain("'Compass'");
    expect(hero).not.toContain("'RE/MAX'");
    expect(hero).toContain('Built for modern brokerages');
  });

  it('does not publish illustrative job openings', () => {
    const careers = readFileSync('app/(marketing)/careers/page.tsx', 'utf8');

    expect(careers).not.toContain('Head of PR, Europe');
    expect(careers).not.toContain('Head of Growth Marketing');
    expect(careers).toContain('No open roles right now.');
  });

  it('does not publish sample research as completed studies', () => {
    const research = readFileSync('app/(marketing)/research/page.tsx', 'utf8');

    expect(research).not.toContain('1,200 Inbound Inquiries');
    expect(research).not.toContain('540 shadowed hours');
    expect(research).not.toContain('Interviews with 80 agents');
    expect(research).toContain('Publication in progress.');
  });
});
