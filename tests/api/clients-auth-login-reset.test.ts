/**
 * Client-portal login / reset / resend — leftover auth gates after #576
 * covered signup + verify takeover.
 *
 * These routes are the remaining password-entry surface. A regression here
 * either opens a session without a verified inbox, enumerates accounts, or
 * mutates a password without consuming a reset code.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findClientByEmail,
  issueCode,
  consumeCode,
  setClientPassword,
  markEmailVerified,
  startSession,
  verifyPassword,
  sendClientCode,
  checkRateLimit,
} = vi.hoisted(() => ({
  findClientByEmail: vi.fn(),
  issueCode: vi.fn(),
  consumeCode: vi.fn(),
  setClientPassword: vi.fn(),
  markEmailVerified: vi.fn(),
  startSession: vi.fn(),
  verifyPassword: vi.fn(),
  sendClientCode: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/client-auth', () => ({
  findClientByEmail,
  issueCode,
  consumeCode,
  setClientPassword,
  markEmailVerified,
  startSession,
  verifyPassword,
}));

vi.mock('@/lib/client-email', () => ({
  sendClientCode,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { POST as login } from '@/app/api/clients/auth/login/route';
import { POST as requestReset } from '@/app/api/clients/auth/request-reset/route';
import { POST as resend } from '@/app/api/clients/auth/resend/route';
import { POST as reset } from '@/app/api/clients/auth/reset/route';

function jsonReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const UNVERIFIED = {
  id: 'cu_1',
  email: 'owner@example.com',
  emailLower: 'owner@example.com',
  name: null,
  phone: null,
  emailVerifiedAt: null,
  passwordHash: 'hash',
};

const VERIFIED = {
  ...UNVERIFIED,
  emailVerifiedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  issueCode.mockResolvedValue('123456');
  consumeCode.mockResolvedValue(true);
  setClientPassword.mockResolvedValue(undefined);
  markEmailVerified.mockResolvedValue(undefined);
  startSession.mockResolvedValue(undefined);
  sendClientCode.mockResolvedValue(undefined);
});

describe('POST /api/clients/auth/login', () => {
  it('returns the same 401 for missing credentials and never looks up the account', async () => {
    const res = await login(
      jsonReq('http://localhost/api/clients/auth/login', { email: 'not-an-email', password: '' }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong email or password.' });
    expect(findClientByEmail).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('returns the same 401 for an unknown email and a wrong password', async () => {
    findClientByEmail.mockResolvedValue(null);
    const unknown = await login(
      jsonReq('http://localhost/api/clients/auth/login', {
        email: 'missing@example.com',
        password: 'password1',
      }),
    );
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: 'Wrong email or password.' });
    expect(startSession).not.toHaveBeenCalled();

    findClientByEmail.mockResolvedValue(VERIFIED);
    verifyPassword.mockReturnValue(false);
    const wrong = await login(
      jsonReq('http://localhost/api/clients/auth/login', {
        email: 'Owner@Example.com',
        password: 'guess-wrong',
      }),
    );
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'Wrong email or password.' });
    expect(findClientByEmail).toHaveBeenCalledWith('owner@example.com');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('does not open a session for a correct password on an unverified row', async () => {
    findClientByEmail.mockResolvedValue(UNVERIFIED);
    verifyPassword.mockReturnValue(true);
    const res = await login(
      jsonReq('http://localhost/api/clients/auth/login', {
        email: 'owner@example.com',
        password: 'password1',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: 'verify' });
    expect(issueCode).toHaveBeenCalledWith('owner@example.com', 'verify');
    expect(sendClientCode).toHaveBeenCalledWith({
      to: 'owner@example.com',
      code: '123456',
      purpose: 'verify',
    });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('opens a session only after a verified email + matching password', async () => {
    findClientByEmail.mockResolvedValue(VERIFIED);
    verifyPassword.mockReturnValue(true);
    const res = await login(
      jsonReq('http://localhost/api/clients/auth/login', {
        email: 'owner@example.com',
        password: 'password1',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: 'dashboard' });
    expect(startSession).toHaveBeenCalledWith(VERIFIED);
    expect(issueCode).not.toHaveBeenCalled();
  });

  it('rate-limits before the user lookup', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await login(
      jsonReq('http://localhost/api/clients/auth/login', {
        email: 'owner@example.com',
        password: 'password1',
      }),
    );
    expect(res.status).toBe(429);
    expect(findClientByEmail).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/clients/auth/request-reset', () => {
  it('rejects an invalid email without probing the directory', async () => {
    const res = await requestReset(
      jsonReq('http://localhost/api/clients/auth/request-reset', { email: 'nope' }),
    );
    expect(res.status).toBe(400);
    expect(findClientByEmail).not.toHaveBeenCalled();
    expect(issueCode).not.toHaveBeenCalled();
  });

  it('returns the same ok body whether or not the account exists', async () => {
    findClientByEmail.mockResolvedValue(null);
    const missing = await requestReset(
      jsonReq('http://localhost/api/clients/auth/request-reset', { email: 'missing@example.com' }),
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ ok: true });
    expect(issueCode).not.toHaveBeenCalled();
    expect(sendClientCode).not.toHaveBeenCalled();

    findClientByEmail.mockResolvedValue(VERIFIED);
    const known = await requestReset(
      jsonReq('http://localhost/api/clients/auth/request-reset', { email: 'Owner@Example.com' }),
    );
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ ok: true });
    expect(issueCode).toHaveBeenCalledWith('owner@example.com', 'reset');
    expect(sendClientCode).toHaveBeenCalledWith({
      to: 'owner@example.com',
      code: '123456',
      purpose: 'reset',
    });
  });
});

describe('POST /api/clients/auth/resend', () => {
  it('never enumerates and only issues a verify code for an unverified row', async () => {
    findClientByEmail.mockResolvedValue(null);
    const missing = await resend(
      jsonReq('http://localhost/api/clients/auth/resend', { email: 'missing@example.com' }),
    );
    expect(await missing.json()).toEqual({ ok: true });
    expect(issueCode).not.toHaveBeenCalled();

    findClientByEmail.mockResolvedValue(VERIFIED);
    const verified = await resend(
      jsonReq('http://localhost/api/clients/auth/resend', { email: 'owner@example.com' }),
    );
    expect(await verified.json()).toEqual({ ok: true });
    expect(issueCode).not.toHaveBeenCalled();

    findClientByEmail.mockResolvedValue(UNVERIFIED);
    const unverified = await resend(
      jsonReq('http://localhost/api/clients/auth/resend', { email: 'owner@example.com' }),
    );
    expect(await unverified.json()).toEqual({ ok: true });
    expect(issueCode).toHaveBeenCalledWith('owner@example.com', 'verify');
    expect(sendClientCode).toHaveBeenCalledWith({
      to: 'owner@example.com',
      code: '123456',
      purpose: 'verify',
    });
  });
});

describe('POST /api/clients/auth/reset', () => {
  it('rejects a malformed code or short password without consuming the code', async () => {
    const badCode = await reset(
      jsonReq('http://localhost/api/clients/auth/reset', {
        email: 'owner@example.com',
        code: '12a456',
        password: 'password1',
      }),
    );
    expect(badCode.status).toBe(400);
    expect(consumeCode).not.toHaveBeenCalled();

    const short = await reset(
      jsonReq('http://localhost/api/clients/auth/reset', {
        email: 'owner@example.com',
        code: '123456',
        password: 'short',
      }),
    );
    expect(short.status).toBe(400);
    expect(consumeCode).not.toHaveBeenCalled();
    expect(setClientPassword).not.toHaveBeenCalled();
  });

  it('does not rotate the password when the reset code is wrong or expired', async () => {
    consumeCode.mockResolvedValue(false);
    const res = await reset(
      jsonReq('http://localhost/api/clients/auth/reset', {
        email: 'owner@example.com',
        code: '123456',
        password: 'new-password',
      }),
    );
    expect(res.status).toBe(400);
    expect(consumeCode).toHaveBeenCalledWith('owner@example.com', '123456', 'reset');
    expect(setClientPassword).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('sets the password, marks the inbox verified, and opens a session', async () => {
    findClientByEmail.mockResolvedValue(VERIFIED);
    const res = await reset(
      jsonReq('http://localhost/api/clients/auth/reset', {
        email: 'Owner@Example.com',
        code: ' 123456 ',
        password: 'new-password',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(consumeCode).toHaveBeenCalledWith('owner@example.com', '123456', 'reset');
    expect(setClientPassword).toHaveBeenCalledWith('owner@example.com', 'new-password');
    expect(markEmailVerified).toHaveBeenCalledWith('owner@example.com');
    expect(startSession).toHaveBeenCalledWith(VERIFIED);
  });
});
