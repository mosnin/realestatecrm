/**
 * Pins the chat agent's per-turn tool-call ceiling. The constant lives
 * in `lib/ai-tools/sdk-chat.ts` and gets passed as `maxTurns` to the
 * SDK's `run()`. Without a hard cap a model that decides to spelunk the
 * tool catalog can run our token bill into the ground.
 *
 * If a future refactor changes the ceiling, this test forces the
 * decision to be deliberate: the new value lives in source, the test
 * follows. It must not silently drift.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('sdk-chat tool-call ceiling', () => {
  it('caps tool-call iterations at 6 per turn', () => {
    // Deliberately lowered 15 → 8 → 6 across the agent token redesign: the SDK
    // re-sends the full transcript + every tool schema on EVERY inner step,
    // so cost grows quadratically with the cap. With toolset retrieval and the
    // integration meta-tools (find/call), most real workflows resolve in a
    // couple of calls; 6 still covers genuine multi-step work and deeper jobs
    // belong on delegate_task.
    const source = readFileSync(
      join(__dirname, '..', '..', 'lib', 'ai-tools', 'sdk-chat.ts'),
      'utf-8',
    );
    expect(source).toMatch(/MAX_TURNS_PER_TURN\s*=\s*6\b/);
  });

  it('passes the cap to run() on the fresh-turn path', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'lib', 'ai-tools', 'sdk-chat.ts'),
      'utf-8',
    );
    // Both runChatTurn and resumeChatTurn must thread the cap into the
    // SDK call. If a new entry point gets added, it should also pass it.
    const callsWithCap = source.match(/maxTurns:\s*MAX_TURNS_PER_TURN/g) ?? [];
    expect(callsWithCap.length).toBeGreaterThanOrEqual(2);
  });
});
