import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

describe('brokerage integrations RSC boundary', () => {
  it('keeps route builders inside a Client Component', () => {
    const page = readFileSync(resolve(root, 'app/broker/integrations/page.tsx'), 'utf8');
    const adapter = readFileSync(resolve(root, 'components/broker/broker-connected-apps-section.tsx'), 'utf8');

    expect(page).toContain('<BrokerConnectedAppsSection callbackResult={callbackResult} />');
    expect(page).not.toContain('connect: (toolkit)');
    expect(adapter).toMatch(/^'use client';/);
    expect(adapter).toContain('connect: (toolkit)');
  });
});
