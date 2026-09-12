import { describe, expect, it } from 'vitest';
import { accountLanding, workspaceExperience } from '@/lib/workspaces/experience';
describe('progressive workspace experience', () => {
  it('shows switching only when another workspace exists or discovery failed', () => {
    expect(workspaceExperience(1).canSwitch).toBe(false);
    expect(workspaceExperience(2).canSwitch).toBe(true);
    expect(workspaceExperience(1, true).canSwitch).toBe(true);
  });
  it('lands a solo agent directly on Today', () => {
    expect(accountLanding({ personalSlug: 'solo', hasBrokerAccess: false, brokerOnly: false })).toBe('/s/solo/chippi/brief');
  });
  it('does not let brokerage authority replace an existing personal business', () => {
    expect(accountLanding({ intent: 'realtor', personalSlug: 'solo', hasBrokerAccess: true, brokerOnly: false })).toBe('/s/solo/chippi/brief');
    expect(accountLanding({ intent: 'broker', personalSlug: 'solo', hasBrokerAccess: true, brokerOnly: false })).toBe('/broker');
  });
  it('preserves invited administrators and explicit brokerage setup', () => {
    expect(accountLanding({ hasBrokerAccess: true, brokerOnly: false })).toBe('/broker');
    expect(accountLanding({ hasBrokerAccess: false, brokerOnly: true })).toBe('/broker');
    expect(accountLanding({ intent: 'broker', personalSlug: 'solo', hasBrokerAccess: false, brokerOnly: false })).toBe('/brokerage');
    expect(accountLanding({ hasBrokerAccess: false, brokerOnly: false })).toBe('/setup');
  });
});
