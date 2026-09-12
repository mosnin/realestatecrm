import { afterEach, expect, it, vi } from 'vitest';
const listTeams = vi.hoisted(() => vi.fn());
vi.mock('@/lib/teams/server', () => ({ listTeams }));
import { workspaceTeams } from '@/lib/workspaces/teams';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('does not read unapplied team tables while disabled', async () => {
  vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'false');
  expect(await workspaceTeams('user-a')).toEqual({ teams: [], teamsUnavailable: false });
  expect(listTeams).not.toHaveBeenCalled();
});
it('passes only membership identity needed for navigation to the browser', async () => {
  vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'true');
  listTeams.mockResolvedValue([{ id: 'team-a', name: 'Harbor', role: 'member', ownerId: 'other-user', parentRouteId: 'sponsor' }]);
  expect(await workspaceTeams('user-a')).toEqual({ teams: [{ id: 'team-a', name: 'Harbor', role: 'member' }], teamsUnavailable: false });
  expect(listTeams).toHaveBeenCalledWith('user-a');
});
it('reports a directory failure rather than pretending the user has no teams', async () => {
  vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'true');
  listTeams.mockRejectedValue(new Error('database unavailable'));
  expect(await workspaceTeams('user-a')).toEqual({ teams: [], teamsUnavailable: true });
});
