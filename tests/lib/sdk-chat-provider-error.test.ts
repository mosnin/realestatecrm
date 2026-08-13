import { describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import {
  logProviderTurnFailure,
  providerTurnErrorLogContext,
} from '@/lib/ai-tools/sdk-chat-stream';

describe('provider turn error logging', () => {
  it('classifies a reasoning replay 400 without returning provider or user content', () => {
    const error = Object.assign(new Error('outer message contains sk-secret-123'), {
      status: 400,
      code: 'invalid_request_error',
      type: 'invalid_request_error',
      requestID: 'req_abc-123',
      error: {
        message:
          'Missing reasoning_details after tool calls for jane@example.com; args={"scoreLabel":"hot"}; Bearer private-token',
      },
    });

    const context = providerTurnErrorLogContext(error);
    const serialized = JSON.stringify(context);

    expect(context).toMatchObject({
      providerErrorClass: 'reasoning_replay_rejected',
      providerStatus: 400,
      providerCode: 'invalid_request_error',
      providerType: 'invalid_request_error',
      providerRequestId: 'req_abc-123',
      errorName: 'Error',
    });
    expect(context.providerBodySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(context.providerBodyBytes).toBeGreaterThan(0);
    expect(serialized).not.toContain('reasoning_details');
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('scoreLabel');
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('sk-secret');
  });

  it('drops unsafe provider metadata fields instead of logging them', () => {
    const context = providerTurnErrorLogContext({
      statusCode: 502,
      code: 'bad code with user content',
      requestId: 'request id with spaces and jane@example.com',
      message: 'upstream failed',
    });

    expect(context).toMatchObject({
      providerErrorClass: 'provider_server_error',
      providerStatus: 502,
    });
    expect(context).not.toHaveProperty('providerCode');
    expect(context).not.toHaveProperty('providerRequestId');
  });

  it('never passes the raw provider exception to logger or observability', () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const rawSecret = 'jane@example.com args={"scoreLabel":"hot"} Bearer private-token';

    logProviderTurnFailure(
      'stream pump crashed',
      { conversationId: 'conversation-1', model: 'qwen/qwen3.7-plus' },
      Object.assign(new Error(rawSecret), {
        status: 400,
        error: { message: `Missing reasoning_details ${rawSecret}` },
      }),
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(log.mock.calls[0])).not.toContain(rawSecret);
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      providerErrorClass: 'reasoning_replay_rejected',
      providerStatus: 400,
    });
  });
});
