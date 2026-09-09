'use client';
import '@/components/dashboard/sicarii/theme.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, ArrowRight, Plus } from 'lucide-react';
type Team = { id: string; name: string; role: 'owner' | 'admin' | 'member' };
type Parent = { name: string; href: string; role: string };
type Member = { userId: string; role: 'admin' | 'member'; User: { name: string } | { name: string }[] | null };
export function TeamsClient({ initialMode = null, sharedRecordsEnabled = false }: { initialMode?: 'create' | 'join' | null; sharedRecordsEnabled?: boolean }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'create' | 'join' | null>(initialMode);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<{ teamId: string; code: string } | null>(null);
  const [selected, setSelected] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teams', { cache: 'no-store' });
      if (!response.ok) throw new Error('Your teams could not be loaded.');
      const data = await response.json();
      setTeams(data.teams); setParents(data.parents);
      setParent(current => current || data.parents[0]?.href || '');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function action(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      return data;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }
  async function manage(team: Team) {
    setBusy(true); setError(''); setSelected(null); setMembers([]);
    try {
      const response = await fetch(`/api/teams?teamId=${encodeURIComponent(team.id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Team members could not be loaded.');
      setMembers((await response.json()).members); setSelected(team);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="app-theme min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <Link href="/auth/redirect?intent=realtor" className="text-sm text-muted-foreground hover:text-foreground">Back to workspace</Link>
      <header className="mb-8 mt-8 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Teams</h1><p className="mt-2 text-sm text-muted-foreground">A shared place for your people, agents, and work.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setMode('join')}>Join a team</Button><Button onClick={() => setMode('create')}><Plus size={16} className="mr-2" />New team</Button></div>
      </header>
      {error && <div role="alert" className="mb-5 rounded-lg border border-destructive/30 p-4 text-sm">{error} <Button variant="ghost" size="sm" onClick={() => void refresh()}>Reload</Button></div>}
      {mode && <form className="mb-8 grid gap-4 rounded-xl border bg-card p-5" onSubmit={async e => {
        e.preventDefault();
        const parts = parent.split('/');
        const data = await action(mode === 'join' ? { action: 'join', code } : { action: 'create', name, parentKind: parts[2], parentRouteId: decodeURIComponent(parts[3] || '') });
        if (data) { setMode(null); setName(''); setCode(''); await refresh(); }
      }}>
        <h2 className="font-medium">{mode === 'create' ? 'Create a team' : 'Join a team'}</h2>
        {mode === 'create' ? <>
          <label className="grid gap-2 text-sm">Team name<Input value={name} onChange={e => setName(e.target.value)} maxLength={120} required autoComplete="organization" /></label>
          <label className="grid gap-2 text-sm">Account<select value={parent} onChange={e => setParent(e.target.value)} required className="h-10 rounded-md border bg-background px-3">{parents.map(p => <option key={p.href} value={p.href}>{p.name} · {p.role}</option>)}</select></label>
          <p className="text-xs text-muted-foreground">Your selected account provides access. Private CRM records stay in their current workspace.</p>
        </> : <label className="grid gap-2 text-sm">Invitation code<Input value={code} onChange={e => setCode(e.target.value)} required maxLength={32} autoComplete="off" /></label>}
        <div className="flex gap-2"><Button disabled={busy || (mode === 'create' && !parent)}>{busy ? 'Saving…' : mode === 'create' ? 'Create team' : 'Join team'}</Button><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
      </form>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading teams…</p> : teams.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><Users className="mx-auto mb-3 text-muted-foreground" size={24} /><h2 className="font-medium">Bring your team together</h2><p className="mt-2 text-sm text-muted-foreground">Create a workspace or join with an invitation code.</p></div> : <div className="divide-y rounded-xl border bg-card">{teams.map(team => <section key={team.id} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 max-w-full"><h2 className="break-words font-medium">{team.name}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{team.role}</p></div><div className="flex flex-wrap gap-2">
          {team.role !== 'member' && <><Button variant="ghost" disabled={busy} onClick={() => void manage(team)}>Members</Button><Button variant="outline" disabled={busy} onClick={async () => { const data = await action({ action: 'invite', teamId: team.id }); if (data) setInvite({ teamId: team.id, code: data.code }); }}>Invite</Button></>}
          {sharedRecordsEnabled && <Button variant="outline" asChild><Link href={`/teams/${encodeURIComponent(team.id)}/work`}>Team work</Link></Button>}
          {sharedRecordsEnabled && <Button variant="outline" asChild><Link href={`/teams/${encodeURIComponent(team.id)}/records`}>Shared records</Link></Button>}
          <Button asChild><Link href={`/workforce/team/${team.id}/app`}>Open workspace<ArrowRight size={14} className="ml-2" /></Link></Button>
        </div></div>
        {invite?.teamId === team.id && <div className="mt-4 rounded-lg bg-muted p-4"><label className="grid gap-2 text-sm">Invitation code<Input readOnly value={invite.code} onFocus={e => e.target.select()} /></label><p className="mt-2 text-xs text-muted-foreground">Share with people who should access this team’s conversations, files, and computer. Expires in 7 days. Creating another code replaces this one.</p></div>}
      </section>)}</div>}
      {selected && <section className="mt-6 rounded-xl border bg-card p-5"><div className="mb-4 flex justify-between"><h2 className="font-medium">{selected.name} · Members</h2><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>
        {!members.length && <p className="text-sm text-muted-foreground">Only the owner has joined.</p>}
        {members.map(member => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><span className="text-sm">{(Array.isArray(member.User) ? member.User[0] : member.User)?.name || 'Team member'}</span>{selected.role === 'owner' ? <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={async () => { if (await action({ action: 'member', teamId: selected.id, userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' })) await manage(selected); }}>{member.role === 'admin' ? 'Make member' : 'Make admin'}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={async () => { if (!window.confirm('Remove this person from the team?')) return; if (await action({ action: 'member', teamId: selected.id, userId: member.userId, role: 'remove' })) await manage(selected); }}>Remove</Button></div> : <span className="text-xs capitalize text-muted-foreground">{member.role}</span>}</div>)}
      </section>}
    </div>
  </main>;
}
