import { describe, expect, it } from 'vitest';
import { BrowserActionResult, LiveFrame } from '@/lib/browser-control/protocol';

describe('browser-control payload bounds', () => {
  it('rejects oversized action result fields before they can reach durable storage', () => {
    expect(BrowserActionResult.safeParse({ ok: true, dom: 'x'.repeat(40_001) }).success).toBe(false);
    expect(BrowserActionResult.safeParse({ ok: false, error: 'x'.repeat(2_001) }).success).toBe(false);
    expect(BrowserActionResult.safeParse({ ok: true, pageUrl: 'x'.repeat(2_049) }).success).toBe(false);
    expect(BrowserActionResult.safeParse({ ok: true, pageTitle: 'x'.repeat(513) }).success).toBe(false);
  });

  it('rejects a frame that exceeds the live-monitoring budget', () => {
    expect(LiveFrame.safeParse({ image: 'x'.repeat(400_001) }).success).toBe(false);
    expect(LiveFrame.safeParse({ image: 'x', pageUrl: 'x'.repeat(2_049) }).success).toBe(false);
    expect(LiveFrame.safeParse({ image: 'x', pageTitle: 'x'.repeat(513) }).success).toBe(false);
  });
});
