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
  const draft=useFormDraft(`shared-edit:${record.source??'personal'}:${record.grantId}`,values,setValues,initial.current,true,'review');
  const [recoverFields,setRecoverFields]=useState<Record<string,boolean>>({});
  const recoveryKeys=keys.filter(key=>typeof draft.conflict?.value?.[key]==='string'&&draft.conflict.value[key]!==draft.conflict.baseline?.[key]);
  const shouldRecoverField=(key:string)=>recoverFields[key]??(initial.current[key]===draft.conflict?.baseline?.[key]);
  const dirty=JSON.stringify(values)!==JSON.stringify(initial.current);
  const {confirmLeave,markSaved}=useUnsavedChanges(dirty||Boolean(draft.conflict));
  const request=useRef<{fingerprint:string;id:string}|null>(null);
  async function save(event:React.FormEvent){
    event.preventDefault();
    if(busy||draft.conflict)return;
    const changes=Object.fromEntries(keys.filter(key=>values[key]!==initial.current[key]).map(key=>[key,amounts.has(key)?(values[key]===''?null:Number(values[key])):key==='closeDate'?(values[key]?new Date(values[key]+'T00:00:00Z').toISOString():null):values[key]||null]));
    const fingerprint=JSON.stringify(changes);
    if(!request.current||request.current.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
    if(await onSave({action:'edit',grantId:record.grantId,source:record.source??'personal',requestId:request.current.id,revision:record.revision,changes})){draft.clear();markSaved();onClose();}
  }
  return <form onSubmit={save} className="mt-4 w-full space-y-3 rounded-lg border p-4" aria-label={`Edit ${record.title}`}>
    {draft.conflict&&<section aria-label="Review recovered changes" className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">This record changed while you were away.</p>
      <p className="text-sm text-muted-foreground">Review your unsaved changes. Conflicting fields keep the current value unless you choose your draft.</p>
      {recoveryKeys.map(key=><div key={key} className="space-y-1 border-t pt-2 text-sm"><p className="font-medium">{labels[key]}</p><p className="break-words text-muted-foreground">Current: {initial.current[key]||'Empty'}</p><p className="break-words">Your draft: {draft.conflict!.value[key]||'Empty'}</p><label className="flex items-center gap-2"><input type="checkbox" checked={shouldRecoverField(key)} disabled={busy} onChange={event=>setRecoverFields({...recoverFields,[key]:event.target.checked})}/>Use my {labels[key].toLowerCase()} change</label></div>)}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>draft.resolveConflict({...initial.current,...Object.fromEntries(recoveryKeys.filter(shouldRecoverField).map(key=>[key,draft.conflict!.value[key]]))})}>Apply selected changes</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>draft.clear()}>Keep current record</Button></div>
    </section>}
    {draft.restored&&<p role="status" className="text-sm text-muted-foreground">Your unsaved edit was restored.</p>}
    {draft.storageError&&<p role="status" className="text-sm text-destructive">Draft recovery is unavailable. Keep this form open until you save.</p>}
    <p className="text-sm text-muted-foreground">The owner allows these edits: {EDITABLE_RECORD_DESCRIPTION[record.kind]}</p>
    <fieldset disabled={busy||Boolean(draft.conflict)} className="grid gap-3 sm:grid-cols-2">{keys.map(key=><label key={key} className="grid gap-1 text-sm">{labels[key]}
      {key==='leadType'?<select value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})} className="h-9 rounded-md border bg-background px-2"><option value="">Choose a relationship</option><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="rental">Rental</option></select>:<Input type={amounts.has(key)?'number':key==='closeDate'?'date':key==='email'?'email':'text'} min={amounts.has(key)?0:undefined} step={amounts.has(key)?'any':undefined} required={['name','title','address'].includes(key)} value={values[key]} onChange={event=>setValues({...values,[key]:event.target.value})}/>}
    </label>)}</fieldset>
    <div className="flex gap-2"><Button disabled={busy||!dirty||Boolean(draft.conflict)}>Save changes</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>{if(confirmLeave()){draft.clear();onClose();}}}>Cancel edit</Button></div>
  </form>;
}
