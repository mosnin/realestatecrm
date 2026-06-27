/**
 * Brokerage RBAC predicates. These gate who can assign leads, edit settings,
 * and change other members' roles, so each branch is a security boundary. The
 * nuanced one is canChangeRole: a broker_owner is untouchable, an owner can
 * change anyone else, and a broker_admin can promote a realtor_member but
 * CANNOT demote a peer admin (no admin-on-admin escalation). Pin every branch.
 */

import { describe, it, expect } from 'vitest';
import {
  canManageLeads,
  canEditSettings,
  canManageRoles,
  canChangeRole,
} from '@/lib/permissions';

describe('role capability predicates', () => {
  it('only broker_owner / broker_admin manage leads, edit settings, manage roles', () => {
    for (const fn of [canManageLeads, canEditSettings, canManageRoles]) {
      expect(fn('broker_owner')).toBe(true);
      expect(fn('broker_admin')).toBe(true);
      expect(fn('realtor_member')).toBe(false);
      expect(fn('')).toBe(false);
      expect(fn('superadmin')).toBe(false); // unknown role is never privileged
    }
  });
});

describe('canChangeRole', () => {
  it('never lets anyone change a broker_owner (owners are untouchable)', () => {
    expect(canChangeRole('broker_owner', 'broker_owner')).toBe(false);
    expect(canChangeRole('broker_admin', 'broker_owner')).toBe(false);
  });

  it('lets a broker_owner change any non-owner role', () => {
    expect(canChangeRole('broker_owner', 'broker_admin')).toBe(true);
    expect(canChangeRole('broker_owner', 'realtor_member')).toBe(true);
  });

  it('lets a broker_admin promote a realtor_member but not touch a peer admin', () => {
    expect(canChangeRole('broker_admin', 'realtor_member')).toBe(true);
    expect(canChangeRole('broker_admin', 'broker_admin')).toBe(false); // no admin-on-admin
  });

  it('denies a realtor_member (or unknown actor) changing anyone', () => {
    expect(canChangeRole('realtor_member', 'realtor_member')).toBe(false);
    expect(canChangeRole('', 'realtor_member')).toBe(false);
  });
});
