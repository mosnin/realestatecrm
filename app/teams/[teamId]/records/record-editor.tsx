'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useFormDraft} from '@/hooks/use-form-draft';
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes';
import {EDITABLE_RECORD_FIELDS,EDITABLE_RECORD_DESCRIPTION} from '@/lib/teams/record-edit-policy';
import type {SharedRecord} from '@/lib/teams/shared-records';
const labels:Record<string,string>={name:'Name',email:'Email',phone:'Phone',leadType:'Relationship',title:'Title',value:'Value',closeDate:'Expected close date',address:'Address',city:'City',listPrice:'List price',beds:'Bedrooms',baths:'Bathrooms'};
const amounts=new Set(['value','listPrice','beds','baths']);
export function SharedRecordEditor({record,busy,onSave,onClose}:{record:SharedRecord;busy:boolean;onSave:(body:Record<string,unknown>)=>Promise<boolean>;onClose:()=>void}) {
  const keys=EDITABLE_RECORD_FIELDS[record.kind];
  const initial=useRef(Object.fromEntries(keys.map(key=>[key,key==='closeDate'?String(record.fields[key]??'').slice(0,10):String(record.fields[key]??'')])));
  const [values,setValues]=useState(initial.current);
  const draft=useFormDraft(`shared-edit:${record.source??'personal'}:${record.grantId}`,values,setValues,initial.current);
  const dirty=JSON.stringify(values)!==JSON.stringify(initial.current);
  const {confirmLeave,markSaved}=useUnsavedChanges(dirty);
  const request=useRef<{fingerprint:string;id:string}|null>(null);
  async function save(event:React.FormEvent){
    event.preventDefault();
    const changes=Object.fromEntries(keys.filter(key=>values[key]!==initial.current[key]).map(key=>[key,amounts.has(key)?(values[key]===''?null:Number(values[key])):key==='closeDate'?(values[key]?new Date(values[key]+'T00:00:00Z').toISOString():null):values[key]||null]));
    const fingerprint=JSON.stringify(changes);
    if(!request.current||request.current.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
    if(await onSave({action:'edit',grantId:record.grantId,source:record.source??'personal',requestId:request.current.id,revision:record.revision,changes})){draft.clear();markSaved();onClose();}
  }
  return <form onSubmit={save} className="mt-4 w-full space-y-3 rounded-lg border p-4" aria-label={`Edit ${record.title}`}>
    {draft.restored&&<p role="status" className="text-sm text-muted-foreground">Your unsaved edit was restored.</p>}
    {draft.storageError&&<p role="status" className="text-sm text-destructive">Draft recovery is unavailable. Keep this form open until you save.</p>}
    <p className="text-sm text-muted-foreground">The owner allows these edits: {EDITABLE_RECORD_DESCRIPTION[record.kind]}</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{keys.map(key=><label key={key} className="grid gap-1 text-sm">{labels[key]}
      {key==='leadType'?<select value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})} className="h-9 rounded-md border bg-background px-2"><option value="">Choose a relationship</option><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="rental">Rental</option></select>:<Input type={amounts.has(key)?'number':key==='closeDate'?'date':key==='email'?'email':'text'} min={amounts.has(key)?0:undefined} step={amounts.has(key)?'any':undefined} required={['name','title','address'].includes(key)} value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>}
    </label>)}</fieldset>
    <div className="flex gap-2"><Button disabled={busy||!dirty}>Save changes</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>{if(confirmLeave()){draft.clear();onClose();}}}>Cancel edit</Button></div>
  </form>;
}
