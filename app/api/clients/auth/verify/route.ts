import { NextResponse, type NextRequest } from 'next/server';
import {
  consumeCode,
  findClientByEmail,
  markEmailVerified,
  startSession,
  verifyPassword,
} from '@/lib/client-auth';
import { authRateLimit, normalizeEmail, readJson, validCode, validPassword } from '../_shared';

export const runtime = 'nodejs';

/**
 * POST /api/clients/auth/verify — consume a verify code, mark the email
 * verified, and open a session. Generic failure copy on a bad/expired code
 * or a wrong password.
 *
 * Password is required in addition to the inbox code. A code emailed to the
 * address is not enough to activate an account an attacker pre-registered
 * with their own password — the real owner would otherwise click Verify and
 * leave the attacker's password in place.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const code = body.code;
  const password = body.password;

  if (!email || !validCode(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }
  if (!validPassword(password)) {
    return NextResponse.json({ error: 'Enter your password.' }, { status: 400 });
  }

  const limited = await authRateLimit(req, 'verify', email);
  if (limited) return limited;

  const user = await findClientByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 400 });
  }

  const ok = await consumeCode(email, code.trim(), 'verify');
  if (!ok) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 400 });
  }

  await markEmailVerified(email);
  await startSession(user);
  return NextResponse.json({ ok: true });
}
