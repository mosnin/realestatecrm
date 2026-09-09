'use client';
import '@/components/dashboard/sicarii/theme.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {SharedRecordEditor} from './record-editor';
import {EDITABLE_RECORD_DESCRIPTION} from '@/lib/teams/record-edit-policy';
import type { RecordKind, SharedRecord } from '@/lib/teams/shared-records';
const labels = { contact: 'People', deal: 'Deals', property: 'Properties' };
const descriptions = {
  contact: 'Name, email, phone, and buyer/seller/rental type.',
  deal: 'Title, status, value, and expected close date.',
  property: 'Address, city, listing status, price, bedrooms, and bathrooms.',
};
const fieldLabels: Record<string,string> = {name:'Name',email:'Email',phone:'Phone',leadType:'Type',title:'Title',status:'Status',value:'Value',closeDate:'Close date',address:'Address',city:'City',listingStatus:'Listing status',listPrice:'List price',beds:'Bedrooms',baths:'Bathrooms'};
type Candidate = Record<string, unknown> & { id: string };
function fields(record: Record<string,unknown>) {
  return Object.entries(record).filter(([key,value])=>key!=='id' && value!==null && value!=='' && value!==undefined).map(([key,value])=>`${fieldLabels[key]??key}: ${String(value)}`).join(' · ');
}
export function SharedRecordsClient({teamId,teamName}:{teamId:string;teamName:string}) {
  const endpoint=`/api/teams/${encodeURIComponent(teamId)}/records`;
  const [kind,setKind]=useState<RecordKind>('contact');
  const [records,setRecords]=useState<SharedRecord[]>([]);
  const [offset,setOffset]=useState(0);
  const [next,setNext]=useState<number|null>(null);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [adding,setAdding]=useState(false);
  const [brokerageAvailable,setBrokerageAvailable]=useState(false);
  const [brokerageSource,setBrokerageSource]=useState(false);
  const [editingAvailable,setEditingAvailable]=useState(false);
  const [allowEdits,setAllowEdits]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [spaceId,setSpaceId]=useState('');
  const [resolvedSpaceId,setResolvedSpaceId]=useState('');
  const [spaces,setSpaces]=useState<{id:string;name:string}[]>([]);
  const [search,setSearch]=useState('');
  const [candidateOffset,setCandidateOffset]=useState(0);
  const [candidateNext,setCandidateNext]=useState<number|null>(null);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [candidateLoading,setCandidateLoading]=useState(false);
  const [selected,setSelected]=useState<Candidate|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setRecords([]);setError('');
    fetch(`${endpoint}?kind=${kind}&offset=${offset}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Shared records could not be loaded.');
      const data=await response.json();if(controller.signal.aborted)return;setRecords(data.records);setNext(data.nextOffset);setBrokerageAvailable(Boolean(data.brokerageSharingAvailable));setEditingAvailable(Boolean(data.editingAvailable));
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[endpoint,kind,offset,revision]);
  useEffect(()=>{
    if(!adding)return;
    const controller=new AbortController();setCandidateLoading(true);setCandidates([]);setSelected(null);
    const timer=setTimeout(()=>{
      const query=new URLSearchParams({mode:brokerageSource?'brokerage_candidates':'candidates',kind,search,offset:String(candidateOffset)});if(spaceId&&!brokerageSource)query.set('spaceId',spaceId);
      fetch(`${endpoint}?${query}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
        if(!response.ok)throw new Error('Your records could not be loaded.');
        const data=await response.json();if(controller.signal.aborted)return;setSpaces(data.spaces);setCandidates(data.records);setCandidateNext(data.nextOffset);setResolvedSpaceId(data.spaceId??'');
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setCandidateLoading(false);});
    },200);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[adding,endpoint,kind,search,spaceId,candidateOffset,revision,brokerageSource]);
  async function mutate(body:Record<string,unknown>) {
    setBusy(true);setError('');
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'The change could not be saved. Check your access and try again.');}
      setSelected(null);setAdding(false);setRevision(value=>value+1);return true;
    } catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  }
  return <main className="app-theme min-h-screen bg-background text-foreground"><div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
    <Link href="/teams" className="text-sm text-muted-foreground">Back to teams</Link>
    <header className="my-8 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{teamName}</p><h1 className="mt-1 text-2xl font-semibold">Shared records</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Selected records your team and Chippi can read. Originals stay with their owner.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/workforce/team/${encodeURIComponent(teamId)}/app`}>Open Chippi</Link></Button><Button onClick={()=>{setAdding(true);setSelected(null);setAllowEdits(false);}} disabled={busy}>Share a record</Button></div></header>
    <nav aria-label="Record types" className="mb-6 flex gap-2">{(Object.keys(labels) as RecordKind[]).map(value=><Button key={value} aria-pressed={kind===value} variant={kind===value?'default':'outline'} disabled={busy} onClick={()=>{setKind(value);setOffset(0);setCandidateOffset(0);setSelected(null);setAllowEdits(false);}}>{labels[value]}</Button>)}</nav>
    {error&&<div role="alert" className="mb-4 rounded-lg border border-destructive/30 p-4 text-sm">{error}<Button variant="ghost" onClick={()=>setRevision(value=>value+1)}>Retry</Button></div>}
    {adding&&<section aria-label="Share a record" className="mb-6 space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="font-medium">Choose from your {labels[kind].toLowerCase()}</h2><Button variant="ghost" disabled={busy} onClick={()=>setAdding(false)}>Cancel</Button></div>
      <p className="text-sm text-muted-foreground">Shared fields: {descriptions[kind]} Notes, messages, files, and other linked records stay private.</p>
      {brokerageAvailable&&<label className="grid gap-2 text-sm">Record owner<select className="h-10 rounded-md border bg-background px-3" value={brokerageSource?'brokerage':'personal'} disabled={busy} onChange={e=>{setBrokerageSource(e.target.value==='brokerage');setCandidateOffset(0);setSelected(null);setAllowEdits(false);}}><option value="personal">My workspace</option><option value="brokerage">Brokerage</option></select></label>}
      {!brokerageSource&&spaces.length>1&&<label className="grid gap-2 text-sm">Source workspace<select value={spaceId||resolvedSpaceId} disabled={busy} onChange={e=>{setSpaceId(e.target.value);setCandidateOffset(0);setSelected(null);setAllowEdits(false);}} className="h-10 rounded-md border bg-background px-3">{spaces.map(space=><option key={space.id} value={space.id}>{space.name}</option>)}</select></label>}
      <Input aria-label="Find your records" placeholder="Search by name or address" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setCandidateOffset(0);setSelected(null);setAllowEdits(false);}}/>
      {candidateLoading?<p role="status" className="text-sm">Loading your records…</p>:!candidates.length?<p className="text-sm text-muted-foreground">No matching records in your workspace.</p>:<div className="divide-y">{candidates.map(record=><button key={record.id} type="button" aria-pressed={selected?.id===record.id} disabled={busy} onClick={()=>{setSelected(record);setAllowEdits(false);}} className="block w-full rounded-md p-3 text-left hover:bg-muted aria-pressed:bg-muted"><span className="block text-sm font-medium">{String(record.name??record.title??record.address??'Untitled')}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{fields(record)}</span></button>)}</div>}
      <div className="flex gap-2">{candidateOffset>0&&<Button variant="ghost" disabled={busy||candidateLoading} onClick={()=>setCandidateOffset(Math.max(0,candidateOffset-25))}>Previous records</Button>}{candidateNext!==null&&<Button variant="ghost" disabled={busy||candidateLoading} onClick={()=>setCandidateOffset(candidateNext)}>More records</Button>}</div>
      {editingAvailable&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowEdits} disabled={busy} onChange={event=>setAllowEdits(event.target.checked)}/><span>Allow team members to edit these details: {EDITABLE_RECORD_DESCRIPTION[kind]}</span></label>}
      {selected&&<div className="space-y-3 border-t pt-4"><p className="text-sm">Share this record&apos;s listed fields with everyone in {teamName}, including Chippi? You can stop sharing later.</p><Button disabled={busy||candidateLoading} onClick={()=>void mutate({...((brokerageSource?{action:'share_brokerage',kind,recordId:selected.id}:{action:'share',kind,recordId:selected.id,spaceId:resolvedSpaceId})),...(editingAvailable?{allowEdits}:{})})}>{busy?'Saving…':'Share selected record'}</Button></div>}
    </section>}
    {loading?<p role="status" className="text-sm">Loading shared records…</p>:!records.length?<p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">No shared {labels[kind].toLowerCase()} on this page. Share a record to give your team a common view.</p>:<div className="divide-y rounded-xl border bg-card">{records.map(record=><article key={record.grantId} className="flex flex-wrap items-start justify-between gap-4 p-5"><div className="min-w-0 flex-1"><h2 className="break-words font-medium">{record.title}</h2>{record.source==='brokerage'&&<p className="mt-1 text-xs text-muted-foreground">Shared by the brokerage</p>}<p className="mt-2 break-words text-sm text-muted-foreground">{fields(record.fields)}</p></div>{record.canRevoke&&<Button variant="ghost" disabled={busy} onClick={()=>void mutate({action:record.source==='brokerage'?'revoke_brokerage':'revoke',grantId:record.grantId})}>Stop sharing</Button>}{record.canEdit&&record.revision&&<Button variant="outline" disabled={busy} onClick={()=>setEditing(record.grantId)}>Edit details</Button>}{editing===record.grantId&&record.canEdit&&record.revision&&<SharedRecordEditor key={record.grantId} record={record} busy={busy} onSave={mutate} onClose={()=>setEditing(null)}/>}</article>)}</div>}
    <div className="mt-4 flex gap-2">{offset>0&&<Button variant="outline" disabled={loading||busy} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous</Button>}{next!==null&&<Button variant="outline" disabled={loading||busy} onClick={()=>setOffset(next)}>Next</Button>}</div>
  </div></main>;
}
