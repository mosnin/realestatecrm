import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('dashboard reference aesthetic contract', () => {
  it('uses warm paper tokens, precise hairlines, and shallow card elevation', () => {
    const globals = read('app/globals.css');
    const surfaces = read('components/ui/surface-card.tsx');

    expect(globals).toContain('--background: #f7f7f5;');
    expect(globals).toContain('--surface: #f1f1ef;');
    expect(globals).toContain('--card: #fbfbfa;');
    expect(globals).toContain('--border: #dededb;');

    expect(surfaces).toContain('rounded-2xl border border-border/85 bg-card');
    expect(surfaces).toContain('0_6px_18px_-16px');
    expect(surfaces).not.toContain('bg-gradient-to-br from-[#FF9500]');
  });

  it('keeps selected sidebar rows light, legible, and rounded', () => {
    const nav = read('components/dashboard/sidebar-nav-item.tsx');
    const sidebar = read('components/dashboard/sidebar.tsx');
    const mobileNav = read('components/dashboard/mobile-nav.tsx');
    const type = read('lib/typography.ts');

    expect(nav).toContain(
      'bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-inset ring-sidebar-border/70',
    );
    expect(nav).toContain(
      'bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-inset ring-sidebar-border/60',
    );
    expect(sidebar).toContain(
      'bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-inset ring-sidebar-border/70',
    );
    expect(nav).not.toContain('bg-foreground text-background font-medium');
    expect(sidebar).not.toContain('bg-foreground text-background font-medium');
    expect(mobileNav).toContain('bg-foreground text-background');
    expect(type).toContain('inline-flex items-center gap-1.5 rounded-full');
  });

  it('preserves the real daily-brief outcomes in the new editorial hierarchy', () => {
    const brief = read('components/chippi/brief-dashboard.tsx');

    for (const surface of [
      'Hero',
      'NeedsYouPanel',
      'ActivityPanel',
      'ToursPanel',
      'HotLeadsPanel',
      'EmptyTodayOrientation',
    ]) {
      expect(brief).toContain(surface);
    }
    expect(brief).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4');
    expect(brief).toContain('lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,0.8fr)]');
    expect(brief).toContain('data-chippi-atmosphere="ascii-field"');
    expect(brief).toContain('pendingDrafts');
    expect(brief).toContain("import { Button } from '@/components/ui/button'");
    expect(brief).toContain('variant="ghost"');
    expect(brief).toContain('has-[>svg]:px-0');
    expect(brief).toContain('active:scale-100');
  });
});
