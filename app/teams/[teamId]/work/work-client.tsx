'use client';
import '@/components/dashboard/sicarii/theme.css';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes';
import type {TeamWorkItem} from '@/lib/teams/work-items';
const statusLabels={assigned:'Awaiting acknowledgment',accepted:'In progress',done:'Completed',cancelled:'Cancelled'};
type Data={items:TeamWorkItem[];role:string;actorId:string;people:{id:string;name:string}[];nextOffset:number|null};
export function TeamWorkClient({teamId,name}:{teamId:string;name:string}) {
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0),[closed,setClosed]=useState(false);
  const [title,setTitle]=useState(''),[due,setDue]=useState(''),[assignee,setAssignee]=useState('');
  useUnsavedChanges(Boolean(title||due));
  const endpoint=`/api/teams/${encodeURIComponent(teamId)}/work`;
  const requestVersion=useRef(0);
  const load=useCallback(async()=>{
    const version=++requestVersion.current;
    try{const res=await fetch(`${endpoint}?offset=${offset}&closed=${closed}`,{cache:'no-store'});if(!res.ok)throw new Error('Could not load team work.');const next=await res.json();if(version!==requestVersion.current)return;setData(next);setError('');}
    catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Team work unavailable');}
  },[endpoint,offset,closed]);
  useEffect(()=>{setData(null);void load();return()=>{requestVersion.current++;};},[load]);
  async function save(body:object,update=false) {
    setBusy(true);setError('');
    try{const res=await fetch(endpoint,{method:update?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!res.ok)throw new Error('Could not save. Work or permissions may have changed. Refresh and try again.');if(!update){setTitle('');setDue('');}await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not save');}finally{setBusy(false);}
  }
  return <main className="app-theme min-h-screen bg-background text-foreground"><div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <nav aria-label="Team navigation" className="flex flex-wrap gap-4 text-sm"><Link href="/teams" className="text-muted-foreground">Teams</Link><Link href={`/teams/${encodeURIComponent(teamId)}/records`} className="text-muted-foreground">Shared records</Link><Link href={`/workforce/team/${encodeURIComponent(teamId)}/app`} className="text-muted-foreground">Open Chippi</Link></nav>
    <header><p className="text-sm text-muted-foreground">{name}</p><h1 className="text-2xl font-semibold">Team work</h1><p className="mt-2 text-sm text-muted-foreground">One owner and one due date for every next step.</p></header>
    {error&&<div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error}<Button variant="ghost" disabled={busy} onClick={()=>void load()}>Refresh</Button></div>}
    {!data?<p role="status">Loading team work…</p>:<>
      <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void save({title,assignedTo:assignee||data.actorId,dueAt:new Date(due).toISOString()});}}>
        <label className="text-sm">Next action<Input disabled={busy} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="text-sm">Due date<Input disabled={busy} required type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
        <label className="text-sm">Owner<select disabled={busy} className="mt-1 w-full rounded-md border bg-background p-2" value={assignee||data.actorId} onChange={e=>setAssignee(e.target.value)}>{data.people.filter(person=>data.role!=='member'||person.id===data.actorId).map(person=><option key={person.id} value={person.id}>{person.id===data.actorId?'Me':person.name}</option>)}</select></label>
        <Button disabled={busy} className="self-end">Assign work</Button>
      </form>
      <div className="flex items-center justify-between"><h2 className="font-medium">{closed?'Completed and cancelled':'Needs attention'}</h2><Button variant="ghost" disabled={busy} onClick={()=>{setOffset(0);setClosed(!closed);}}>{closed?'Show open work':'Show completed'}</Button></div>
      <div className="divide-y rounded-xl border">{data.items.map(item=>{
        const overdue=!closed&&new Date(item.dueAt)<new Date();const mine=item.assignedTo===data.actorId;
        return <article key={item.id} className="space-y-3 p-4"><div><h3 className="font-medium">{item.title}</h3><p className="text-sm text-muted-foreground">{data.people.find(person=>person.id===item.assignedTo)?.name??'Team member'} · {new Date(item.dueAt).toLocaleString()} · {statusLabels[item.status]}</p>{overdue&&<p className="text-sm text-destructive">Overdue — manager attention needed</p>}</div><div className="flex flex-wrap gap-2">
          {mine&&item.status==='assigned'&&<Button disabled={busy} onClick={()=>void save({id:item.id,version:item.version,action:'accept'},true)}>Acknowledge</Button>}
          {mine&&item.status==='accepted'&&<Button disabled={busy} onClick={()=>void save({id:item.id,version:item.version,action:'complete'},true)}>Mark complete</Button>}
          {!closed&&data.role!=='member'&&<label className="text-sm">Reassign<select aria-label={`Reassign ${item.title}`} disabled={busy} value={item.assignedTo} onChange={e=>void save({id:item.id,version:item.version,action:'reassign',assignedTo:e.target.value},true)} className="ml-2 rounded border bg-background p-1">{data.people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
          {!closed&&(data.role!=='member'||item.createdBy===data.actorId)&&<Button variant="ghost" disabled={busy} onClick={()=>void save({id:item.id,version:item.version,action:'cancel'},true)}>Cancel work</Button>}
        </div></article>;
      })}{!data.items.length&&<p className="p-6 text-sm text-muted-foreground">No {closed?'completed':'open'} work on this page.</p>}</div>
      {(offset>0||data.nextOffset!==null)&&<div className="flex gap-2"><Button variant="outline" disabled={offset===0||busy} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</Button><Button variant="outline" disabled={data.nextOffset===null||busy} onClick={()=>setOffset(data.nextOffset!)}>Next</Button></div>}
    </>}
  </div></main>;
}
