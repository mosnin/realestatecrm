export type WorkspaceKind = 'personal' | 'team' | 'brokerage';
export type TeamWorkspace = { id: string; name: string; role: 'owner' | 'admin' | 'member' };
export type WorkspaceDestination = { kind: WorkspaceKind; id: string; role?: string };

const sections = {
  people: { personal: 'contacts', brokerage: 'people' },
  deals: { personal: 'deals', brokerage: 'deals' },
  properties: { personal: 'properties', brokerage: 'properties' },
  messages: { personal: 'communication', brokerage: 'messages' },
} as const;

/** Preserve the type of work, never another workspace's record IDs or filters. */
export function workspaceDestination(target: WorkspaceDestination, pathname: string): string {
  if (target.kind === 'team') return `/workforce/team/${encodeURIComponent(target.id)}/app`;
  const cleanPath = pathname.split(/[?#]/)[0];
  const source = cleanPath.startsWith('/broker/') ? cleanPath.split('/')[2] : /^\/s\/[^/]+\/([^/]+)/.exec(cleanPath)?.[1];
  const section = Object.values(sections).find(value => source === value.personal || source === value.brokerage);
  if (target.kind === 'personal') return `/s/${encodeURIComponent(target.id)}/${section?.personal ?? 'chippi/brief'}`;
  const admin = ['broker_owner', 'broker_admin'].includes(target.role ?? '');
  const page = admin ? section?.brokerage ?? 'brief' : section?.brokerage === 'people' ? 'my-leads' : section?.brokerage === 'messages' ? 'messages' : 'brief';
  return `/broker/switch/${encodeURIComponent(target.id)}?next=${encodeURIComponent(`/broker/${page}`)}`;
}

/** The switch endpoint accepts only known list destinations, never arbitrary redirects. */
export function brokerageSwitchDestination(next: string | null, role: string): string {
  const shared = ['/broker/brief', '/broker/my-leads', '/broker/messages', '/broker/templates', '/broker/leaderboard'];
  const admin = ['broker_owner', 'broker_admin'].includes(role);
  const allowed = admin ? [...shared, '/broker/people', '/broker/deals', '/broker/properties'] : shared;
  return next && allowed.includes(next) ? next : '/broker';
}

export function workspaceRoleLabel(role: string): string {
  return ({ broker_owner: 'Owner', broker_admin: 'Admin', realtor_member: 'Agent', owner: 'Owner', admin: 'Admin', member: 'Member' } as Record<string, string>)[role] ?? 'Member';
}
