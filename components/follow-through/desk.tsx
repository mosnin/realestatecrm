'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, X } from 'lucide-react';
import { commitmentState, type Commitment } from '@/lib/follow-through/model';

interface Person { id: string; name: string; email: string | null; phone: string | null }
interface Coverage { key: string; title: string; description: string; enabled: boolean; lastRunAt?: string; lastRunStatus?: string }
const control = 'min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground';

export function FollowThroughDesk({ slug }: { slug: string }) {
  const [items, setItems] = useState<Commitment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [coverageError, setCoverageError] = useState('');
  const loadVersion = useRef(0);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('commitment');
  const [showClosed, setShowClosed] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const requestId = useRef<string | null>(null);
  const load = useCallback(async (query = '') => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [work, routines] = await Promise.allSettled([
        fetch(`/api/follow-through?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}`).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }),
        fetch(`/api/follow-through/coverage?slug=${encodeURIComponent(slug)}`).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }),
      ]);
      if (version !== loadVersion.current) return;
      if (work.status === 'fulfilled') { setItems(work.value.items); setPeople(work.value.contacts); setError(''); }
      else setError('Client work could not be refreshed. Previously loaded work may be outdated.');
      if (routines.status === 'fulfilled') { setCoverage(routines.value.coverage); setCoverageError(''); }
      else setCoverageError('Automatic coverage status unavailable. Client commitments remain available.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Follow-through is unavailable.'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [slug]);
  useEffect(() => { void load(); return () => { loadVersion.current += 1; }; }, [load]);
  async function mutate(url: string, method: string, body: unknown) {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save changes.');
      await load(search); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.'); return false; }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = new Date(String(data.get('dueAt')));
    if (!Number.isFinite(date.getTime())) { setError('Choose a valid due date.'); return; }
    requestId.current ??= crypto.randomUUID();
    const ok = await mutate('/api/follow-through', 'POST', { slug, commitment: {
      id: requestId.current, contactId: data.get('contactId'), title: data.get('title'), instruction: data.get('instruction'),
      dueAt: date.toISOString(), kind, channel: kind === 'handoff' ? null : data.get('channel') || null,
    } });
    if (ok) { requestId.current = null; setAdding(false); }
  }
  const closed = (i: Commitment) => ['Sent', 'Completed', 'Canceled'].includes(commitmentState(i));
  const visible = items.filter(i => showClosed || !closed(i)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Client follow-through">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">Client follow-through</h2><p className="mt-1 text-sm text-muted-foreground">Promises, replies and handoffs—with a next step.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={control} onClick={() => setConfigure(!configure)} aria-expanded={configure}>Automatic coverage</button>
        <button className={`${control} inline-flex items-center gap-2`} onClick={() => { requestId.current = null; setAdding(!adding); }} aria-expanded={adding}><Plus size={16} />Add commitment</button>
      </div>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 p-3 text-sm"><span>{error}</span><button className="underline" disabled={loading} onClick={() => void load(search)}>Try again</button></div>}
    {coverageError && <p role="alert" className="text-sm text-destructive">{coverageError}</p>}
    {configure && <div className="space-y-3 border-y border-border py-4">
      <p className="text-sm text-muted-foreground">Turning on a routine authorizes its messages to run automatically. Existing opt-outs and sending limits still apply.</p>
      {coverage.map(c => <div key={c.key} className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-medium">{c.title}</h3><p className="mt-1 text-sm text-muted-foreground">{c.description}</p><p className="mt-1 text-xs text-muted-foreground">{c.lastRunStatus === 'error' ? 'Last run needs attention. Open activity to inspect it.' : c.lastRunAt ? `Last run: ${new Date(c.lastRunAt).toLocaleString()}` : 'No run recorded yet.'}</p></div><button role="switch" aria-checked={c.enabled} aria-label={c.title} disabled={busy || loading || Boolean(coverageError)} className={`${control} shrink-0 ${c.enabled ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => void mutate('/api/follow-through/coverage', 'POST', { slug, key: c.key, enabled: !c.enabled })}>{c.enabled ? 'On' : 'Off'}</button></div>)}
      <Link className="inline-block text-sm underline" href={`/s/${slug}/automations/settings`}>Sending policies and limits</Link>
    </div>}
    {adding && <form onSubmit={create} className="grid gap-3 rounded-lg bg-muted/30 p-4 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2"><h3 className="font-medium">A specific promise, with a due date</h3><button type="button" aria-label="Close commitment form" onClick={() => setAdding(false)}><X size={18} /></button></div>
      <div className="flex gap-2 sm:col-span-2"><input aria-label="Search people" className={`${control} min-w-0 flex-1`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a client by name" /><button type="button" className={control} disabled={loading} onClick={() => void load(search)}>Search</button></div>
      <label className="grid gap-1 text-sm">Person<select name="contactId" required className={control}><option value="">Choose a person</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.email ? ` · ${p.email}` : ''}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Work type<select className={control} value={kind} onChange={e => setKind(e.target.value)}><option value="commitment">Client commitment</option><option value="handoff">Human handoff</option></select></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Promise or next step<input className={control} name="title" required maxLength={200} placeholder="Send the inspection update to Jordan" /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Details and instructions<textarea className={control} name="instruction" required maxLength={4000} rows={3} placeholder="What should happen? Include the facts the client needs." /></label>
      <label className="grid gap-1 text-sm">Due (your local time)<input className={control} type="datetime-local" name="dueAt" required /></label>
      {kind === 'commitment' && <label className="grid gap-1 text-sm">Execution<select name="channel" className={control}><option value="">I will handle it</option><option value="email">Chippi sends an email automatically</option><option value="sms">Chippi sends a text automatically</option></select></label>}
      <p className="text-xs text-muted-foreground sm:col-span-2">Automatic messages are composed from your instructions and processed when due by the sending service. Scheduled is not sent. Human work belongs to this workspace’s owner.</p>
      <button disabled={busy} className={`${control} bg-primary text-primary-foreground sm:col-span-2`}>{busy ? 'Saving…' : 'Save commitment'}</button>
    </form>}
    <div className="flex items-center justify-between gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />Include completed work</label><button aria-label="Refresh follow-through" disabled={loading} onClick={() => void load(search)}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
    {loading && !items.length ? <p className="text-sm text-muted-foreground" role="status">Loading client work…</p> : !error && !visible.length ? <p className="py-3 text-sm text-muted-foreground">No open commitments. Add a promise or turn on coverage for future replies.</p> : null}
    <ul className="divide-y divide-border">{visible.slice(0, visibleCount).map(item => <li key={item.id} className="space-y-2 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link className="text-sm font-medium hover:underline break-words" href={`/s/${slug}/contacts/${item.contactId}`}>{item.title}</Link><p className="mt-1 text-xs text-muted-foreground">{new Date(item.dueAt).toLocaleString()} · {commitmentState(item)}</p></div>
      {!closed(item) && <div className="flex flex-wrap gap-2">{!item.scheduledMessageId && item.status === 'open' && <button disabled={busy} className={control} onClick={() => void mutate('/api/follow-through', 'PATCH', { slug, id: item.id, action: 'accept' })}>Accept</button>}{!item.scheduledMessageId && <button className={control} onClick={() => { setClosing(item.id); setNote(''); }}>Record outcome</button>}<button disabled={busy} className={control} onClick={() => void mutate('/api/follow-through', 'PATCH', { slug, id: item.id, action: 'cancel' })}>Cancel</button></div>}</div>
      <p className="break-words text-sm text-muted-foreground">{item.instruction}</p>
      {item.completionNote && <p className="text-sm">Outcome: {item.completionNote}</p>}
      {closing === item.id && <form className="flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); if (await mutate('/api/follow-through', 'PATCH', { slug, id: item.id, action: 'complete', note })) setClosing(null); }}><input className={`${control} min-w-0 flex-1`} aria-label="Completed outcome" required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="What was completed?" /><button disabled={busy} className={control}>Save outcome</button></form>}
    </li>)}</ul>
    {visible.length > visibleCount && <button className={control} onClick={() => setVisibleCount(count => count + 20)}>Show more commitments ({visible.length - visibleCount} remaining)</button>}
    {showClosed && <p className="text-xs text-muted-foreground">Includes the 20 most recently closed commitments.</p>}
  </section>;
}
