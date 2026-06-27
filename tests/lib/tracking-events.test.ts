/**
 * fireConversionEvents fires a Lead/conversion event on each ad pixel that is
 * actually loaded, and must (a) call the right event for each present pixel,
 * (b) skip absent pixels, and (c) isolate a throwing pixel so it never blocks
 * the others or the form submission that called it. Those guarantees protect
 * conversion tracking AND the submit flow, so pin them with window stubs.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireConversionEvents } from '@/lib/tracking-events';

const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
});

function setWindow(w: Record<string, unknown>) {
  (globalThis as { window?: unknown }).window = w;
}

describe('fireConversionEvents', () => {
  it('fires the correct event on every loaded pixel', () => {
    const fbq = vi.fn();
    const ttqTrack = vi.fn();
    const gtag = vi.fn();
    const twq = vi.fn();
    const lintrk = vi.fn();
    const snaptr = vi.fn();
    setWindow({ fbq, ttq: { track: ttqTrack }, gtag, twq, lintrk, snaptr });

    fireConversionEvents();

    expect(fbq).toHaveBeenCalledWith('track', 'Lead');
    expect(ttqTrack).toHaveBeenCalledWith('SubmitForm');
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead');
    expect(twq).toHaveBeenCalledWith('event', 'tw-conversion', {});
    expect(lintrk).toHaveBeenCalledWith('track', { conversion_id: 'form_submission' });
    expect(snaptr).toHaveBeenCalledWith('track', 'SIGN_UP');
  });

  it('fires only the pixels that are present, skipping the rest', () => {
    const fbq = vi.fn();
    setWindow({ fbq }); // only Meta loaded
    expect(() => fireConversionEvents()).not.toThrow();
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it('does nothing and does not throw when no pixels are loaded', () => {
    setWindow({});
    expect(() => fireConversionEvents()).not.toThrow();
  });

  it('isolates a throwing pixel so later pixels still fire', () => {
    const fbq = vi.fn(() => {
      throw new Error('pixel boom');
    });
    const gtag = vi.fn();
    setWindow({ fbq, gtag });

    expect(() => fireConversionEvents()).not.toThrow();
    expect(fbq).toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead'); // not blocked by fbq throw
  });

  it('ignores a malformed ttq (no track method) without throwing', () => {
    const gtag = vi.fn();
    setWindow({ ttq: {}, gtag });
    expect(() => fireConversionEvents()).not.toThrow();
    expect(gtag).toHaveBeenCalled();
  });
});
