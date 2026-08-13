import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Today dashboard system release contract', () => {
  it('makes Today the authenticated default while preserving broker chat deep links', () => {
    const realtorRoot = read('app/s/[slug]/page.tsx');
    const brokerRoot = read('app/broker/page.tsx');
    const brokerChat = read('app/broker/chippi/page.tsx');

    expect(realtorRoot).toContain('/chippi/brief');
    expect(brokerRoot).toContain("'/broker/brief'");
    expect(brokerRoot).toContain('`/broker/chippi?${serialized}`');
    expect(brokerChat).toContain('variant="broker"');
    expect(brokerChat).toContain("redirect('/broker/brief')");
  });

  it('applies the canonical warm Today canvas to realtor and broker dashboard shells', () => {
    const realtorShell = read('components/dashboard/layout-shell.tsx');
    const brokerShell = read('components/broker/broker-main.tsx');
    const globals = read('app/globals.css');

    for (const source of [realtorShell, brokerShell]) {
      expect(source).toContain('data-premium-dashboard');
      expect(source).toContain('chippi-dashboard-canvas');
    }
    expect(globals).toContain("[data-premium-dashboard] [data-slot='card']");
    expect(globals).toContain('border-radius: 1.75rem');
  });

  it('documents Today as the one realtor and brokerage visual source of truth', () => {
    expect(read('DESIGN.md')).toContain('**Today** page');
    expect(read('DESIGN.md')).toContain('collapsed: a true `56px` Scalar-style nav strip');
    expect(read('docs/ui/STYLESHEET.md')).toContain('The live **Today** page');
  });

  it('uses the supplied dark WebGL Aurora only for the accepted Today Work launch', () => {
    const effect = read('components/effects/aurora-glow.tsx');
    const today = read('components/chippi/brief-dashboard.tsx');
    const workspace = read('components/chippi/chippi-workspace.tsx');

    expect(effect).toContain("alpha: false");
    expect(effect).toContain("powerPreference: 'high-performance'");
    expect(effect).toContain('uTime * -4.9');
    expect(effect).toContain('ripple + delta * 0.52');
    expect(effect).toContain("prefers-reduced-motion: reduce");
    expect(effect).toContain('destroy()');
    expect(today).toContain('data-work-launch="aurora"');
    expect(today).toContain('data-aura-origin');
    expect(today).toContain('stageWorkDraftHandoff');
    expect(workspace).toContain(
      "handleSendRef.current(handoff.text, [], undefined, 'work')",
    );
    expect(workspace).toContain(
      'if (!accepted) setPrefill({ text: handoff.text, nonce: Date.now() })',
    );
  });
});
