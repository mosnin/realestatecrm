/**
 * Client-portal signup/verify — pre-registration account takeover.
 *
 * An attacker who POSTs /signup with the victim's email used to keep that
 * password after the victim verified. The portal then authorizes by verified
 * email across every realtor workspace. These tests lock the two gates:
 *
 *   1. Signup on an UNVERIFIED row rotates the password (last signup wins).
 *   2. Signup on a VERIFIED row does not touch the password.
 *   3. Verify requires the current password — an inbox code alone is not
 *      enough to activate a pre-registered account.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findClientByEmail,
  createClientUser,
  setClientPassword,
  issueCode,
  consumeCode,
  markEmailVerified,
  startSession,
  verifyPassword,
} = vi.hoisted(() => ({
  findClientByEmail: vi.fn(),
  createClientUser: vi.fn(),
  setClientPassword: vi.fn(),
  issueCode: vi.fn(),
  consumeCode: vi.fn(),
  markEmailVerified: vi.fn(),
  startSession: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('@/lib/client-auth', () => ({
  findClientByEmail,
  createClientUser,
  setClientPassword,
  issueCode,
  consumeCode,
  markEmailVerified,
  startSession,
  verifyPassword,
}));

vi.mock('@/lib/client-email', () => ({
  sendClientCode: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST as signup } from '@/app/api/clients/auth/signup/route';
import { POST as verify } from '@/app/api/clients/auth/verify/route';

function jsonReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const UNVERIFIED = {
  id: 'cu_1',
  email: 'victim@example.com',
  emailLower: 'victim@example.com',
  name: null,
  phone: null,
  emailVerifiedAt: null,
  passwordHash: 'attacker-hash',
};

const VERIFIED = {
  ...UNVERIFIED,
  emailVerifiedAt: '2026-01-01T00:00:00Z',
  passwordHash: 'owner-hash',
};

beforeEach(() => {
  vi.clearAllMocks();
  issueCode.mockResolvedValue('123456');
  consumeCode.mockResolvedValue(true);
  setClientPassword.mockResolvedValue(undefined);
  markEmailVerified.mockResolvedValue(undefined);
  startSession.mockResolvedValue(undefined);
  createClientUser.mockResolvedValue({ ...UNVERIFIED, passwordHash: undefined });
});

describe('POST /api/clients/auth/signup — pre-registration', () => {
  it('creates a new account when the email is unknown', async () => {
    findClientByEmail.mockResolvedValue(null);
    const res = await signup(
      jsonReq('http://localhost/api/clients/auth/signup', {
        email: 'victim@example.com',
        password: 'attacker-password',
      }),
    );
    expect(res.status).toBe(200);
    expect(createClientUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'victim@example.com',
        password: 'attacker-password',
      }),
    );
    expect(setClientPassword).not.toHaveBeenCalled();
    expect(issueCode).toHaveBeenCalledWith('victim@example.com', 'verify');
  });

  it('rotates the password when the existing row is still unverified', async () => {
    findClientByEmail.mockResolvedValue(UNVERIFIED);
    const res = await signup(
      jsonReq('http://localhost/api/clients/auth/signup', {
        email: 'Victim@Example.com',
        password: 'owner-password',
      }),
    );
    expect(res.status).toBe(200);
    expect(createClientUser).not.toHaveBeenCalled();
    expect(setClientPassword).toHaveBeenCalledWith('victim@example.com', 'owner-password');
    expect(issueCode).toHaveBeenCalledWith('victim@example.com', 'verify');
  });

  it('does not rotate the password of a verified account', async () => {
    findClientByEmail.mockResolvedValue(VERIFIED);
    const res = await signup(
      jsonReq('http://localhost/api/clients/auth/signup', {
        email: 'victim@example.com',
        password: 'attacker-password',
      }),
    );
    expect(res.status).toBe(200);
    expect(createClientUser).not.toHaveBeenCalled();
    expect(setClientPassword).not.toHaveBeenCalled();
  });
});

describe('POST /api/clients/auth/verify — password required', () => {
  it('rejects verify without a password and does not consume the code', async () => {
    const res = await verify(
      jsonReq('http://localhost/api/clients/auth/verify', {
        email: 'victim@example.com',
        code: '123456',
      }),
    );
    expect(res.status).toBe(400);
    expect(consumeCode).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('rejects a wrong password without consuming the code', async () => {
    findClientByEmail.mockResolvedValue(UNVERIFIED);
    verifyPassword.mockReturnValue(false);
    const res = await verify(
      jsonReq('http://localhost/api/clients/auth/verify', {
        email: 'victim@example.com',
        code: '123456',
        password: 'guess-wrong',
      }),
    );
    expect(res.status).toBe(400);
    expect(consumeCode).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('verifies and opens a session when password and code both match', async () => {
    findClientByEmail.mockResolvedValue(UNVERIFIED);
    verifyPassword.mockReturnValue(true);
    const res = await verify(
      jsonReq('http://localhost/api/clients/auth/verify', {
        email: 'victim@example.com',
        code: '123456',
        password: 'owner-password',
      }),
    );
    expect(res.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith('owner-password', 'attacker-hash');
    expect(consumeCode).toHaveBeenCalledWith('victim@example.com', '123456', 'verify');
    expect(markEmailVerified).toHaveBeenCalledWith('victim@example.com');
    expect(startSession).toHaveBeenCalledWith(UNVERIFIED);
  });
});
