import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resendSendMock, complianceMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(),
  complianceMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: resendSendMock } })),
}));
vi.mock('@/lib/messaging/compliance', () => ({ checkSendAllowed: complianceMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { sendEmailFromCRM } from '@/lib/email';

const savedApiKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = 'resend-test-key';
  complianceMock.mockReset().mockResolvedValue({ allowed: true });
  resendSendMock.mockReset().mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

afterEach(() => {
  if (savedApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedApiKey;
});

describe('sendEmailFromCRM durable execution contract', () => {
  it('forwards the action-scoped key to the Resend Idempotency-Key option', async () => {
    await sendEmailFromCRM({
      audience: 'consumer',
      category: 'marketing',
      spaceId: 'space-1',
      toEmail: 'buyer@example.com',
      fromName: 'Broker',
      subject: 'Hello',
      body: 'Body',
      idempotencyKey: 'work-session-action-0123456789abcdef0123456789abcdef',
    });

    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', subject: 'Hello' }),
      { idempotencyKey: 'work-session-action-0123456789abcdef0123456789abcdef' },
    );
  });

  it('fails closed when a durable send has no provider configuration', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmailFromCRM({
      audience: 'consumer',
      category: 'marketing',
      spaceId: 'space-1',
      toEmail: 'buyer@example.com',
      fromName: 'Broker',
      subject: 'Hello',
      body: 'Body',
      idempotencyKey: 'work-session-action-abcdefabcdefabcdefabcdefabcdefab',
    })).rejects.toMatchObject({
      name: 'EmailSendError',
      durableDisposition: 'terminal_failure',
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('classifies provider payload conflicts as reconciliation and concurrency as retryable', async () => {
    const params = {
      audience: 'consumer' as const,
      category: 'marketing' as const,
      spaceId: 'space-1',
      toEmail: 'buyer@example.com',
      fromName: 'Broker',
      subject: 'Hello',
      body: 'Body',
      idempotencyKey: 'work-session-action-fedcbafedcbafedcbafedcbafedcbafe',
    };
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'invalid_idempotent_request', message: 'payload changed' },
    });
    await expect(sendEmailFromCRM(params)).rejects.toMatchObject({
      name: 'EmailSendError',
      durableDisposition: 'reconciliation_required',
    });

    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'concurrent_idempotent_requests', message: 'request in progress' },
    });
    await expect(sendEmailFromCRM(params)).rejects.toMatchObject({
      name: 'EmailSendError',
      durableDisposition: 'retryable',
    });
  });
});
