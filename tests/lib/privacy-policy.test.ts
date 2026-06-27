/**
 * generatePrivacyPolicy renders a privacy-policy HTML doc with the realtor /
 * brokerage's name embedded. That name is USER-PROVIDED, so it must be HTML-
 * escaped before interpolation — an unescaped "<script>" name would be a stored
 * XSS on every page that renders the policy. Pin the escaping, the entity-type
 * branching + default names, and that the doc names the right controller/
 * processor relationship (the legal substance the template exists for).
 */

import { describe, it, expect } from 'vitest';
import { generatePrivacyPolicy } from '@/lib/privacy-policy-template';

describe('generatePrivacyPolicy', () => {
  it('HTML-escapes a user-provided entity name (XSS defense)', () => {
    const html = generatePrivacyPolicy('<script>alert(1)</script> & "Acme"', 'brokerage');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;Acme&quot;');
  });

  it('embeds a clean name verbatim', () => {
    expect(generatePrivacyPolicy('Summit Realty', 'realtor')).toContain('Summit Realty');
  });

  it('defaults the name by entity type when empty', () => {
    expect(generatePrivacyPolicy('', 'brokerage')).toContain('Our Brokerage');
    expect(generatePrivacyPolicy('', 'realtor')).toContain('Our Office');
  });

  it('names the controller/processor relationship (legal substance)', () => {
    const html = generatePrivacyPolicy('Summit Realty', 'realtor');
    expect(html).toMatch(/data controller/i);
    expect(html).toMatch(/data processor/i);
    expect(html).toMatch(/Chippi/);
    expect(html).toMatch(/Privacy Policy/);
    expect(html).toMatch(/Last updated:/);
  });
});
