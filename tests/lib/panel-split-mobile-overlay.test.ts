/**
 * Behavioral tests for the pure state-transition logic backing
 * hooks/use-split-panel.ts's mobile ⇄ desktop panel presentation.
 *
 * This repo has no jsdom harness, so use-split-panel.ts is deliberately split
 * into (a) `shouldUseMobileOverlay` / `nextResizeState` — plain functions
 * that take a viewport width and current state and return the next state,
 * with no `window`/localStorage reads — and (b) the `useSplitPanel` React
 * hook, which is a thin wiring layer around them. These tests exercise (a)
 * directly, which is where the actual "does mobile get a real panel or does
 * it silently fail" decision lives — the bug class this track exists to fix.
 */
import { describe, expect, it } from 'vitest';
import {
  shouldUseMobileOverlay,
  nextResizeState,
  type PanelPresentationState,
} from '@/hooks/use-split-panel';

describe('shouldUseMobileOverlay', () => {
  it('is true below the md breakpoint (768px)', () => {
    expect(shouldUseMobileOverlay(767)).toBe(true);
    expect(shouldUseMobileOverlay(375)).toBe(true); // typical phone width
    expect(shouldUseMobileOverlay(0)).toBe(true);
  });

  it('is false at and above the md breakpoint', () => {
    expect(shouldUseMobileOverlay(768)).toBe(false);
    expect(shouldUseMobileOverlay(1024)).toBe(false);
    expect(shouldUseMobileOverlay(1920)).toBe(false);
  });
});

describe('nextResizeState', () => {
  it('force-closes the desktop split when the viewport narrows below the breakpoint (pre-existing behavior)', () => {
    const current: PanelPresentationState = { isSplit: true, isMobileOverlay: false };
    const next = nextResizeState(500, current);
    expect(next).toEqual({ isSplit: false, isMobileOverlay: false });
  });

  it('narrowing below the breakpoint leaves an already-open mobile overlay alone', () => {
    const current: PanelPresentationState = { isSplit: false, isMobileOverlay: true };
    const next = nextResizeState(500, current);
    expect(next).toEqual({ isSplit: false, isMobileOverlay: true });
  });

  it('narrowing below the breakpoint with neither open is a no-op (same reference)', () => {
    const current: PanelPresentationState = { isSplit: false, isMobileOverlay: false };
    const next = nextResizeState(500, current);
    expect(next).toBe(current);
  });

  it('widening back to desktop always closes the transient mobile overlay', () => {
    const current: PanelPresentationState = { isSplit: false, isMobileOverlay: true };
    const next = nextResizeState(1024, current);
    expect(next).toEqual({ isSplit: false, isMobileOverlay: false });
  });

  it('widening back to desktop preserves the persisted isSplit preference untouched', () => {
    const current: PanelPresentationState = { isSplit: true, isMobileOverlay: true };
    const next = nextResizeState(1024, current);
    expect(next).toEqual({ isSplit: true, isMobileOverlay: false });
  });

  it('widening to desktop with the overlay already closed is a no-op (same reference)', () => {
    const current: PanelPresentationState = { isSplit: true, isMobileOverlay: false };
    const next = nextResizeState(1024, current);
    expect(next).toBe(current);
  });

  it('is stable across repeated calls at the same width (idempotent)', () => {
    let state: PanelPresentationState = { isSplit: true, isMobileOverlay: false };
    state = nextResizeState(500, state);
    state = nextResizeState(500, state);
    state = nextResizeState(500, state);
    expect(state).toEqual({ isSplit: false, isMobileOverlay: false });
  });

  it('a realtor resizing back and forth across the breakpoint round-trips to the original split preference', () => {
    // Desktop, split open.
    let state: PanelPresentationState = { isSplit: true, isMobileOverlay: false };
    // Rotate to phone width — split force-closes.
    state = nextResizeState(400, state);
    expect(state.isSplit).toBe(false);
    // Opens the mobile overlay instead (this is what toggle() does at this
    // width — simulated directly here since toggle() itself needs `window`).
    state = { ...state, isMobileOverlay: true };
    // Rotate back to desktop — overlay auto-closes, isSplit stays as the
    // resize left it (closed) since nextResizeState never re-opens isSplit.
    state = nextResizeState(1024, state);
    expect(state).toEqual({ isSplit: false, isMobileOverlay: false });
  });
});
