'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CrmLinkButton({ slug, externalId }: { slug: string; externalId: string }) {
  const [busy, setBusy] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function link() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/integrations/follow-up-boss/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, externalId, writeBack: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setContactId(data.contactId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not link contact'); }
    finally { setBusy(false); }
  }
  return <div className="max-w-64 text-sm">{contactId ? <Link className="underline" href={`/s/${slug}/contacts/${contactId}`}>Open in People</Link> : <button disabled={busy} onClick={() => void link()} className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">{busy ? 'Linking…' : 'Link + sync activity'}</button>}{error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}</div>;
}
interface LinkRow { id: string; externalId: string; contactId: string; writeBack: boolean }
interface Receipt { id: string; status: string; error: string | null }
export function CrmFollowThroughStatus({ slug }: { slug: string }) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const res = await fetch(`/api/integrations/follow-up-boss/contacts?slug=${encodeURIComponent(slug)}`);
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setLinks(data.links); setReceipts(data.receipts); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'CRM status unavailable'); }
  }
  useEffect(() => { void load(); /* owner scope is carried by slug */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  async function stop(link: LinkRow) {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/follow-up-boss/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, linkId: link.id, writeBack: false }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not stop sync'); }
    finally { setBusy(false); }
  }
  const pending = receipts.filter(r => r.status === 'pending').length;
  const attention = receipts.filter(r => ['sending', 'unconfirmed', 'blocked'].includes(r.status)).length;
  return <section className="space-y-3 rounded-xl border border-border p-4 text-sm">
    <h2 className="font-semibold">Follow-through in your existing CRM</h2>
    <p className="text-muted-foreground">Link selected people to use them in Chippi. Linking enables future communication, meeting and follow-up activity to be written back as Follow Up Boss notes. Private notes are excluded. Importing a person does not authorize outreach or start a campaign.</p>
    {error ? <p role="alert">{error}</p> : <p>{links.filter(l => l.writeBack).length} linked for activity sync · {pending} pending · {attention} need checking in Follow Up Boss. Counts cover the latest 50 write-backs.</p>}
    <button className="underline" onClick={() => void load()}>Refresh sync status</button>
    {links.filter(l => l.writeBack).map(l => <div key={l.id} className="flex flex-wrap justify-between gap-2"><Link className="underline" href={`/s/${slug}/contacts/${l.contactId}`}>Linked person #{l.externalId}</Link><button disabled={busy} className="underline" onClick={() => void stop(l)}>Stop activity sync</button></div>)}
  </section>;
}
