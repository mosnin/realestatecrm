import type { InvitationStatus } from '@/lib/types';

export function effectiveInvitationStatus(
  status: InvitationStatus,
  expiresAt: string,
  now = new Date(),
): InvitationStatus {
  if (status !== 'pending') return status;

  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return status;

  return expiry <= now.getTime() ? 'expired' : status;
}
