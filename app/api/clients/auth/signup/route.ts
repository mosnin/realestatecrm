import { NextResponse, type NextRequest } from 'next/server';
import {
  createClientUser,
  findClientByEmail,
  issueCode,
  setClientPassword,
} from '@/lib/client-auth';
import { sendClientCode } from '@/lib/client-email';
import { logger } from '@/lib/logger';
import { authRateLimit, normalizeEmail, readJson, validPassword } from '../_shared';

export const runtime = 'nodejs';

/**
 * POST /api/clients/auth/signup — create an account, issue a verify code.
 *
 * Never leaks whether an email already exists: if it does we respond with the
 * same { ok, next:'verify' } shape and re-issue a verify code, so an attacker
 * can't enumerate accounts here.
 *
 * Unverified rows are last-signup-wins: the password is rotated to this
 * request's password. Otherwise an attacker who pre-registers the address
 * keeps the password after the real owner verifies and can log into every
 * realtor workspace tied to that email. A verified account is never rotated
 * here — login still needs the existing password (or a reset).
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const name = typeof body.name === 'string' ? body.name.slice(0, 120) : undefined;
  const phone = typeof body.phone === 'string' ? body.phone.slice(0, 40) : undefined;

  if (!email) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (!validPassword(password)) {
    return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 });
  }

  const limited = await authRateLimit(req, 'signup', email);
  if (limited) return limited;

  const existing = await findClientByEmail(email);
  if (!existing) {
    const created = await createClientUser({ email, password, name, phone });
    if (!created) {
      // Unique-constraint race or DB hiccup — treat as the generic path so we
      // don't leak existence and don't 500 on a duplicate.
      logger.warn('[clients/signup] createClientUser returned null');
    }
  } else if (!existing.emailVerifiedAt) {
    // Pre-registration takeover: first writer used to keep the password
    // forever. Rotate until the inbox is proven.
    await setClientPassword(email, password);
  }

  const code = await issueCode(email, 'verify');
  if (code) await sendClientCode({ to: email, code, purpose: 'verify' });

  return NextResponse.json({ ok: true, next: 'verify' });
}
