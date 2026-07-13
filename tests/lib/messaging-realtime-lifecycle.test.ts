import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REALTIME_PATHS = [
  'lib/messaging/index.ts',
  'app/api/messages/channels/[id]/typing/route.ts',
  'app/api/messages/dm/route.ts',
  'app/api/messages/channels/route.ts',
];

describe('messaging realtime lifecycle', () => {
  it.each(REALTIME_PATHS)('%s does not abandon Ably publishes after a response', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).not.toMatch(/void publish(?:Message|User)Event\(/);
  });
});
