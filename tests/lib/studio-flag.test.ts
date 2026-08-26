import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStudioEnabled } from '@/lib/chippi/studio-flag';
import { getChatTools } from '@/lib/ai-tools/toolsets';
import { realtorNavItems } from '@/lib/nav-items';

afterEach(() => vi.unstubAllEnvs());

describe('Studio pause', () => {
  it('stays off unless the opt-in flag is exactly true', () => {
    delete process.env.NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED;
    expect(isStudioEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', '1');
    expect(isStudioEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', 'true');
    expect(isStudioEnabled()).toBe(true);
  });

  it('does not attach generate_studio_image while Studio is paused', () => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', 'false');
    const names = getChatTools('Generate a listing image for 10 Main Street').map(
      (tool) => tool.name,
    );
    expect(names).not.toContain('generate_studio_image');
  });

  it('hides Studio from the sidebar while paused', () => {
    expect(realtorNavItems.some((item) => item.href === '/studio')).toBe(false);
  });
});
