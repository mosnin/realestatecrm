import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const recover = vi.hoisted(() => vi.fn());

vi.mock('@/lib/chat/turn-control', () => ({
  recoverExpiredConversationTurns: recover,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/cron-monitor', () => ({
  monitorCron: (_slug: string, _schedule: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/cron/conversation-turn-recovery/route';

const savedSecret = process.env.CRON_SECRET;
const savedDisabled = process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED;

describe('ConversationTurn recovery cron', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    delete process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED;
    recover.mockReset().mockResolvedValue([
      { previousStatus: 'running' },
      { previousStatus: 'paused' },
    ]);
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
    if (savedDisabled === undefined) delete process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED;
    else process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED = savedDisabled;
  });

  it('fails closed without exact cron authority', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new NextRequest('http://localhost/api/cron/conversation-turn-recovery'))).status)
      .toBe(500);
    process.env.CRON_SECRET = 'cron-secret';
    expect((await GET(new NextRequest('http://localhost/api/cron/conversation-turn-recovery'))).status)
      .toBe(401);
    expect(recover).not.toHaveBeenCalled();
  });

  it('reports only durable recovery transitions', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/cron/conversation-turn-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      scanned: 2,
      running: 1,
      paused: 1,
      durationMs: expect.any(Number),
    });
    expect(recover).toHaveBeenCalledWith({}, 100);
  });

  it('honors the kill switch and exposes dependency failure', async () => {
    process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED = '1';
    const disabled = await GET(new NextRequest(
      'http://localhost/api/cron/conversation-turn-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(await disabled.json()).toMatchObject({ skipped: 'kill-switch on' });
    expect(recover).not.toHaveBeenCalled();

    delete process.env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED;
    recover.mockRejectedValueOnce(new Error('database unavailable'));
    const failed = await GET(new NextRequest(
      'http://localhost/api/cron/conversation-turn-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Conversation turn recovery failed' });
  });
});
