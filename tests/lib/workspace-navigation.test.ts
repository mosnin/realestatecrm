import { describe, expect, it } from 'vitest';
import { brokerageSwitchDestination, workspaceDestination } from '@/lib/workspaces/navigation';

describe('workspace switching preserves work without carrying tenant records', () => {
  it.each([
    ['/s/old/contacts/person-secret?pipeline=old#notes', '/broker/people'],
    ['/s/old/deals/deal-secret?owner=old', '/broker/deals'],
    ['/s/old/properties/property-secret', '/broker/properties'],
    ['/s/old/calendar', '/broker/brief'],
  ])('maps %s to the authorized destination list', (path, destination) => {
    const href = workspaceDestination({ kind: 'brokerage', id: 'new', role: 'broker_admin' }, path);
    expect(new URL(href, 'https://example.test').searchParams.get('next')).toBe(destination);
    expect(href).not.toContain('secret');
  });
  it('uses assigned leads for a brokerage member and never offers their admin deal list', () => {
    const target = { kind: 'brokerage' as const, id: 'new', role: 'realtor_member' };
    expect(workspaceDestination(target, '/s/old/contacts')).toContain('my-leads');
    expect(workspaceDestination(target, '/s/old/deals')).toContain('brief');
  });
  it('opens agent list destinations and sends unsupported sections to Today', () => {
    expect(workspaceDestination({ kind: 'personal', id: 'solo' }, '/broker/people/person')).toBe('/s/solo/contacts');
    expect(workspaceDestination({ kind: 'personal', id: 'solo' }, '/broker/billing')).toBe('/s/solo/chippi/brief');
  });
  it('opens team operational work without pretending to provide a shared CRM', () => {
    expect(workspaceDestination({ kind: 'team', id: 'team-a' }, '/s/old/deals/private')).toBe('/workforce/team/team-a/app');
  });
});

describe('brokerage redirect allowlist', () => {
  it.each(['https://evil.test', '//evil.test', '/broker/people/private', '/broker/people?owner=other', '/broker/people#private', '/api/admin/delete'])('rejects unsafe or record-specific next %s', next => {
    expect(brokerageSwitchDestination(next, 'broker_owner')).toBe('/broker');
  });
  it('uses target membership and preserves the existing default', () => {
    expect(brokerageSwitchDestination('/broker/deals', 'broker_admin')).toBe('/broker/deals');
    expect(brokerageSwitchDestination('/broker/deals', 'realtor_member')).toBe('/broker');
    expect(brokerageSwitchDestination('/broker/my-leads', 'realtor_member')).toBe('/broker/my-leads');
    expect(brokerageSwitchDestination(null, 'broker_owner')).toBe('/broker');
  });
});
