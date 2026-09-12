'use client';

import { useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import { Building2, Briefcase, Check, ChevronsUpDown, Search, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { triggerAccountSwitch } from './account-switch';
import { workspaceExperience } from '@/lib/workspaces/experience';
import { cn } from '@/lib/utils';
import { workspaceDestination, workspaceRoleLabel, type TeamWorkspace, type WorkspaceKind } from '@/lib/workspaces/navigation';

export interface WorkspaceSwitcherProps {
  currentName: string;
  currentSubtitle: string;
  currentIcon: ComponentType<{ size?: number; className?: string }>;
  slug: string;
  spaceName: string;
  brokerageMemberships: { id: string; name: string; role: string }[];
  activeBrokerageId?: string;
  teams?: TeamWorkspace[];
  teamsUnavailable?: boolean;
  isOnBrokerPage: boolean;
  collapsed?: boolean;
  showQuickCreate?: boolean;
  userEmail?: string | null;
  inDrawer?: boolean;
}

export function NamedWorkspaceSwitcher({ currentName, currentSubtitle, currentIcon: Icon, slug, spaceName, brokerageMemberships, activeBrokerageId, teams = [], teamsUnavailable = false, isOnBrokerPage, collapsed = false, userEmail, inDrawer = false }: WorkspaceSwitcherProps) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const enabled = process.env.NEXT_PUBLIC_CHIPPI_WORKFORCE_ENABLED === 'true';
  const currentBroker = activeBrokerageId ?? brokerageMemberships[0]?.id;
  const rows = [
    ...(slug ? [{ kind: 'personal' as WorkspaceKind, id: slug, name: spaceName, role: 'owner', current: !isOnBrokerPage }] : []),
    ...teams.map(team => ({ ...team, kind: 'team' as WorkspaceKind, current: false })),
    ...brokerageMemberships.map(b => ({ ...b, kind: 'brokerage' as WorkspaceKind, current: isOnBrokerPage && b.id === currentBroker })),
  ];
  const { canSwitch } = workspaceExperience(rows.length, teamsUnavailable);
  if (!canSwitch) return <div className="flex min-h-11 min-w-0 items-center gap-2 p-2" aria-label={`Current workspace: ${currentName}`}>
    <Icon size={17} className="shrink-0 text-muted-foreground" />
    {!collapsed && <span className="min-w-0 truncate text-sm font-medium">{currentName}</span>}
  </div>;
  const groups = [{ kind: 'personal', label: 'Agent workspace', icon: Briefcase }, { kind: 'team', label: 'Teams', icon: Users }, { kind: 'brokerage', label: 'Brokerages', icon: Building2 }] as const;
  const matches = rows.filter(row => `${row.name} ${workspaceRoleLabel(row.role)} ${row.kind === 'personal' ? 'agent' : row.kind}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const content = <div>
    {userEmail && <p className="truncate px-3 py-2 text-xs text-muted-foreground">{userEmail}</p>}
    <div className="relative m-2"><Search size={15} aria-hidden className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Find a workspace" placeholder="Find a workspace…" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" /></div>
    <div className="max-h-[50vh] overflow-y-auto px-1 pb-1">
      {groups.map(group => {
        const entries = matches.filter(row => row.kind === group.kind);
        if (!entries.length) return null;
        const RowIcon = group.icon;
        return <section key={group.kind} aria-label={group.label} className="mb-2 last:mb-0">
          <h3 className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{group.label}</h3>
          {entries.map(row => <a key={`${row.kind}:${row.id}`} href={row.current ? pathname : workspaceDestination(row, pathname)} aria-current={row.current ? 'true' : undefined} onClick={event => { if (row.current) event.preventDefault(); else triggerAccountSwitch(); setOpen(false); }} className={cn('flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', row.current && 'bg-muted')}>
            <RowIcon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{workspaceRoleLabel(row.role)}</span></span>
            {row.current && <Check size={16} aria-hidden className="shrink-0" />}
          </a>)}
        </section>;
      })}
      {!matches.length && <p role="status" className="px-3 py-4 text-sm text-muted-foreground">No matching workspaces.</p>}
      {teamsUnavailable && <p role="status" className="px-3 py-2 text-xs text-destructive">Teams could not be loaded. Reload to retry.</p>}
    </div>
    <div className="border-t p-1">
      {enabled && <a href="/teams" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted">Create or join a team</a>}
      <a href="/brokerage" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted">Create or join a brokerage</a>
    </div>
  </div>;
  const trigger = <button type="button" aria-label={`${currentName} · ${currentSubtitle} · Switch workspace`} aria-expanded={open} onClick={inDrawer ? () => setOpen(!open) : undefined} className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', collapsed && 'justify-center')}>
    <Icon size={17} className="shrink-0 text-muted-foreground" />
    {!collapsed && <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{currentName}</span><span className="block truncate text-xs text-muted-foreground">{currentSubtitle}</span></span><ChevronsUpDown size={14} aria-hidden className="shrink-0 text-muted-foreground" /></>}
  </button>;
  if (inDrawer) return <div>{trigger}{open && content}</div>;
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setQuery(''); }}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" side={collapsed ? 'right' : 'bottom'} sideOffset={6} className="w-[min(21rem,calc(100vw-2rem))] p-0">{content}</PopoverContent></Popover>;
}
