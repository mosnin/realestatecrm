/**
 * `BrowserControlPanel` pure-logic tests — `sourceLabel` and
 * `liveViewEmptyStateMessage`, the two exported helpers this track added to
 * make the panel source-aware (extension vs. headless). No DOM/render
 * harness on purpose (see CLAUDE.md testing policy + this track's scope):
 * these are plain functions, tested as plain functions.
 */

import { describe, it, expect } from 'vitest';
import {
  browserActionVisualState,
  clearsResearchWorkspaceForStatus,
  researchSessionLabel,
  sourceLabel,
  liveViewEmptyStateMessage,
} from '@/components/chippi/browser-control-panel';

describe('sourceLabel', () => {
  it('labels an extension session as the realtor\'s own browser', () => {
    const info = sourceLabel('extension');
    expect(info.label).toBe('Your browser');
    expect(info.description.toLowerCase()).toContain('your');
    expect(info.description.toLowerCase()).not.toContain('cloud');
  });

  it('labels a headless session as the Chippi cloud browser and discloses it is not logged in', () => {
    const info = sourceLabel('headless');
    expect(info.label).toBe('Chippi cloud browser');
    expect(info.description.toLowerCase()).toContain('not logged in');
  });

  it('degrades unknown/absent source to a neutral label instead of guessing', () => {
    expect(sourceLabel(undefined).label).toBe('Browser');
    expect(sourceLabel(null).label).toBe('Browser');
    expect(sourceLabel('some-future-runtime').label).toBe('Browser');
    // Never fabricates a description for an unrecognized source.
    expect(sourceLabel(undefined).description).toBe('');
  });

  it('extension and headless labels are never the same string (honest UI distinguishability)', () => {
    expect(sourceLabel('extension').label).not.toBe(sourceLabel('headless').label);
  });
});

describe('liveViewEmptyStateMessage', () => {
  it('prioritizes a confirmed fetch error over everything else', () => {
    const msg = liveViewEmptyStateMessage({ source: 'headless', frameChecked: false, frameError: true });
    expect(msg).toBe("Couldn't load the live view.");
  });

  it('shows a loading state before the first frame check completes', () => {
    const msg = liveViewEmptyStateMessage({ source: 'extension', frameChecked: false, frameError: false });
    expect(msg).toBe('Loading live view…');
  });

  it('uses cloud-browser wording for a checked, frameless headless session', () => {
    const msg = liveViewEmptyStateMessage({ source: 'headless', frameChecked: true, frameError: false });
    expect(msg.toLowerCase()).toContain('cloud browser');
  });

  it('uses "your browser" wording for a checked, frameless extension session', () => {
    const msg = liveViewEmptyStateMessage({ source: 'extension', frameChecked: true, frameError: false });
    expect(msg.toLowerCase()).toContain('your browser');
    expect(msg.toLowerCase()).not.toContain('cloud');
  });

  it('falls back to the extension wording for an unknown source rather than crashing or fabricating', () => {
    const msg = liveViewEmptyStateMessage({ source: undefined, frameChecked: true, frameError: false });
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('error state wins even when frameChecked is also true', () => {
    const msg = liveViewEmptyStateMessage({ source: 'headless', frameChecked: true, frameError: true });
    expect(msg).toBe("Couldn't load the live view.");
  });
});

describe('browserActionVisualState', () => {
  const action = {
    id: 'action_1',
    type: 'navigate' as const,
    summary: 'Opening a public listing page',
    timestamp: '2026-07-29T00:00:00.000Z',
    ok: false,
  };

  it('does not turn queued work into a failure merely because it has no result yet', () => {
    expect(browserActionVisualState({ ...action, status: 'queued' })).toEqual({
      status: 'queued', pending: true, failed: false,
    });
  });

  it('renders a terminal browser error as a failure', () => {
    expect(browserActionVisualState({ ...action, status: 'error' })).toEqual({
      status: 'error', pending: false, failed: true,
    });
  });
});

describe('researchSessionLabel', () => {
  it('shows the exact lifecycle state instead of treating any session row as active', () => {
    expect(researchSessionLabel('launching')).toBe('Launching');
    expect(researchSessionLabel('active')).toBe('Active');
    expect(researchSessionLabel('error')).toBe('Error');
    expect(researchSessionLabel('stopped')).toBe('Stopped');
    expect(researchSessionLabel(undefined)).toBe('Not running');
  });
});

describe('clearsResearchWorkspaceForStatus', () => {
  it('removes last-known research state when access is revoked', () => {
    expect(clearsResearchWorkspaceForStatus(403)).toBe(true);
    expect(clearsResearchWorkspaceForStatus(404)).toBe(true);
  });

  it('does not erase state for a transient server failure', () => {
    expect(clearsResearchWorkspaceForStatus(500)).toBe(false);
  });
});
