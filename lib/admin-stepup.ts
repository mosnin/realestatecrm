/**
 * Step-up validation for destructive admin actions (SOC2 CC6.1 / CC7.3).
 *
 * A destructive action must carry TWO extra proofs of intent beyond being an
 * authorized admin:
 *   1. reason           — a non-empty free-text justification (>= 10 chars) so
 *                         the audit trail records WHY, not just what.
 *   2. confirm          — a typed confirmation that must exactly equal an
 *                         action-specific token (the target user's email, or a
 *                         literal like 'DELETE' / 'SEND'). Forces the operator
 *                         to consciously retype the target, defeating fat-finger
 *                         and blind-replay of a memorized request body.
 *
 * Route usage:
 *   const step = requireStepUp(body, { expectedConfirmation: target.email });
 *   if (step instanceof NextResponse) return step;          // 400 with reason
 *   // ...proceed, then persist step.reason / step.confirm via logAdminAction.
 */

import { NextResponse } from 'next/server';

export const MIN_REASON_LENGTH = 10;

export interface StepUpResult {
  reason: string;
  confirm: string;
}

/**
 * Validate the step-up fields on a parsed JSON body. Returns the normalized
 * { reason, confirm } on success, or a 400 NextResponse describing the first
 * failure. Comparison of `confirm` is case-sensitive and trimmed on both sides
 * (a literal token like 'DELETE' and an email are both exact-match by design).
 */
export function requireStepUp(
  body: unknown,
  opts: { expectedConfirmation: string },
): StepUpResult | NextResponse {
  const b = (body ?? {}) as { reason?: unknown; confirm?: unknown };

  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `A reason of at least ${MIN_REASON_LENGTH} characters is required for this action.`,
        stepUp: 'reason',
      },
      { status: 400 },
    );
  }

  const confirm = typeof b.confirm === 'string' ? b.confirm.trim() : '';
  const expected = opts.expectedConfirmation.trim();
  if (!confirm || confirm !== expected) {
    return NextResponse.json(
      {
        error: `Confirmation does not match. Type "${expected}" to confirm.`,
        stepUp: 'confirm',
        expected,
      },
      { status: 400 },
    );
  }

  return { reason, confirm };
}
