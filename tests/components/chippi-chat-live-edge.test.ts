import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHAT_LIVE_EDGE_THRESHOLD_PX,
  distanceFromChatLiveEdge,
  isAtChatLiveEdge,
} from '@/components/chippi/use-chat-live-edge';

describe('Chippi chat live edge', () => {
  it('measures remaining transcript distance without returning negatives', () => {
    expect(
      distanceFromChatLiveEdge({
        scrollHeight: 1000,
        scrollTop: 600,
        clientHeight: 300,
      }),
    ).toBe(100);
    expect(
      distanceFromChatLiveEdge({
        scrollHeight: 500,
        scrollTop: 240,
        clientHeight: 300,
      }),
    ).toBe(0);
  });

  it('follows only while the reader remains near the newest message', () => {
    expect(
      isAtChatLiveEdge({
        scrollHeight: 1000,
        scrollTop: 1000 - 500 - CHAT_LIVE_EDGE_THRESHOLD_PX,
        clientHeight: 500,
      }),
    ).toBe(true);
    expect(
      isAtChatLiveEdge({
        scrollHeight: 1000,
        scrollTop: 300,
        clientHeight: 500,
      }),
    ).toBe(false);
  });

  it('uses ResizeObserver follow ownership and exposes one jump action', () => {
    const hook = readFileSync(
      'components/chippi/use-chat-live-edge.ts',
      'utf8',
    );
    const workspace = readFileSync(
      'components/chippi/chippi-workspace.tsx',
      'utf8',
    );

    expect(hook).toContain("node.addEventListener('wheel', releaseFollow");
    expect(hook).toContain("['ArrowUp', 'PageUp', 'Home']");
    expect(hook).toContain('new ResizeObserver');
    expect(workspace).toContain('useChatLiveEdge');
    expect(workspace).toContain('Jump to latest');
    expect(workspace).not.toContain("bottomRef.current?.scrollIntoView({ behavior: 'smooth' })");
  });
});
