// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {FormDraftProvider,useFormDraft} from '@/hooks/use-form-draft';
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
let edit:(value:{title:string})=>void;
let draft:ReturnType<typeof useFormDraft<{title:string}>>;
function Form({initial=''}:{initial?:string}){
 const [value,setValue]=useState({title:initial});edit=setValue;
 draft=useFormDraft('deal:new',value,setValue,{title:initial});
 return React.createElement('p',null,value.title);
}
async function mount(actorId='actor-a',spaceId='space-a',initial=''){
 await act(async()=>root.render(React.createElement(FormDraftProvider,{actorId,spaceId,children:React.createElement(Form,{initial})})));
}
async function leave(){await act(async()=>root.render(null));}
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('scoped form draft recovery',()=>{
 it('restores an unfinished form after unmount and a fresh hook instance',async()=>{
  await mount();await act(async()=>edit({title:'Buyer inspection'}));await leave();await mount();
  expect(host.textContent).toBe('Buyer inspection');expect(draft.restored).toBe(true);
 });
 it('does not expose another user or workspace draft',async()=>{
  await mount();await act(async()=>edit({title:'Private buyer'}));await leave();await mount('actor-b');expect(host.textContent).toBe('');
  await leave();await mount('actor-a','space-b');expect(host.textContent).toBe('');
  await leave();await mount();expect(host.textContent).toBe('Private buyer');
 });
 it('removes a successfully saved or explicitly discarded draft',async()=>{
  await mount();await act(async()=>edit({title:'Saved deal'}));await act(async()=>draft.clear());await leave();await mount();expect(host.textContent).toBe('');
 });
 it('does not overwrite newer server data with an old edit',async()=>{
  await mount('actor-a','space-a','Original');await act(async()=>edit({title:'Unsaved edit'}));await leave();await mount('actor-a','space-a','Updated by server');expect(host.textContent).toBe('Updated by server');
 });
 it('expires drafts and tolerates malformed storage',async()=>{
  await mount();await act(async()=>edit({title:'Old'}));await leave();
  const key=sessionStorage.key(0)!;const stored=JSON.parse(sessionStorage.getItem(key)!);sessionStorage.setItem(key,JSON.stringify({...stored,expires:0}));
  await mount();expect(host.textContent).toBe('');await leave();sessionStorage.setItem(key,'broken');await mount();expect(host.textContent).toBe('');
 });
 it('keeps edits usable and reports storage failure',async()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  await mount();await act(async()=>edit({title:'Still here'}));expect(host.textContent).toBe('Still here');expect(draft.storageError).toBe(true);
 });
});
