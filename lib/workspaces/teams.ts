import 'server-only';
import { listTeams } from '@/lib/teams/server';
import type { TeamWorkspace } from './navigation';

export async function workspaceTeams(userId: string): Promise<{ teams: TeamWorkspace[]; teamsUnavailable: boolean }> {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') return { teams: [], teamsUnavailable: false };
  try {
    const teams = await listTeams(userId);
    return { teams: teams.map(({ id, name, role }) => ({ id, name, role })), teamsUnavailable: false };
  } catch {
    return { teams: [], teamsUnavailable: true };
  }
}
