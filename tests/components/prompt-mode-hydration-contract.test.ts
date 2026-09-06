import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredChatMode } from '@/components/chippi/chippi-workspace';
afterEach(() => vi.unstubAllGlobals());
describe('Restoring conversation capability', () => {
  it('preserves an explicit saved choice and migrates the old agent value', () => {
    const getItem = vi.fn(() => 'chat');
    vi.stubGlobal('window', { sessionStorage: { getItem } });
    expect(readStoredChatMode('existing')).toBe('chat');
    expect(readStoredChatMode(null)).toBe('work');
    getItem.mockReturnValue('agent');
    expect(readStoredChatMode('existing')).toBe('work');
  });
  it('keeps a fresh task usable when browser storage is unavailable', () => {
    vi.stubGlobal('window', { sessionStorage: { getItem: () => { throw new Error('unavailable'); } } });
    expect(readStoredChatMode(null)).toBe('work');
    expect(readStoredChatMode('existing')).toBe('chat');
  });
});
