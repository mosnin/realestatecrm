import { describe, expect, it } from 'vitest';
import { effectiveInvitationStatus } from '@/lib/invitation-status';

const now = new Date('2026-07-14T00:00:00.000Z');

describe('effectiveInvitationStatus', () => {
  it('treats elapsed pending invitations as expired', () => {
    expect(
      effectiveInvitationStatus('pending', '2026-04-10T00:00:00.000Z', now),
    ).toBe('expired');
  });

  it('keeps unexpired pending and terminal statuses unchanged', () => {
    expect(
      effectiveInvitationStatus('pending', '2026-07-20T00:00:00.000Z', now),
    ).toBe('pending');
    expect(
      effectiveInvitationStatus('accepted', '2026-04-10T00:00:00.000Z', now),
    ).toBe('accepted');
  });
});
