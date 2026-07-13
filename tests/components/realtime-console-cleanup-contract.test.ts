import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production console cleanup', () => {
  it('absorbs Ably subscription rejection when navigation closes the client', () => {
    const source = readFileSync('hooks/use-messaging.ts', 'utf8');

    expect(source).toContain('void presence.presence.subscribe(onPresence).catch(() => {})');
    expect(source).toContain("void userLane.subscribe('inbox', onInbox).catch(() => {})");
    expect(source).toContain("void userLane.subscribe('channel_added', onInbox).catch(() => {})");
    expect(source).toContain("void chan.subscribe('message', onMessage).catch(() => {})");
    expect(source).toContain("void chan.subscribe('read', onRead).catch(() => {})");
    expect(source).toContain("void chan.subscribe('typing', onTyping).catch(() => {})");
  });

  it('gives the admin chart a valid server-side initial dimension', () => {
    const source = readFileSync('app/admin/components/signup-chart.tsx', 'utf8');

    expect(source).toContain('initialDimension={{ width: 640, height: 200 }}');
  });
});
