// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {SharedRecordEditor} from '@/app/teams/[teamId]/records/record-editor';
import {FormDraftProvider} from '@/hooks/use-form-draft';
import type {SharedRecord} from '@/lib/teams/shared-records';
let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;
const record:SharedRecord={grantId:'10000000-0000-4000-8000-000000000001',kind:'contact',title:'Alex',fields:{name:'Alex',email:'alex@example.test',phone:null,leadType:'buyer'},canRevoke:false,canEdit:true,revision:'2026-09-08T12:00:00Z'};
const save=vi.fn(),close=vi.fn();
async function render(current:SharedRecord=record){await act(async()=>root.render(React.createElement(FormDraftProvider,{actorId:'agent',spaceId:'team:a',children:React.createElement(SharedRecordEditor,{record:current,busy:false,onSave:save,onClose:close})})));}
async function change(value:string){const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);sessionStorage.clear();save.mockReset().mockResolvedValue(false);close.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('sends only changed delegated fields and reuses request identity after a failed save',async()=>{
 await render();expect(host.textContent).not.toContain('Notes');await change('Corrected Alex');await submit();
 expect(save.mock.calls[0][0]).toEqual({action:'edit',grantId:record.grantId,source:'personal',revision:record.revision,requestId:expect.any(String),changes:{name:'Corrected Alex'}});
 expect(close).not.toHaveBeenCalled();expect(host.querySelector('input')!.value).toBe('Corrected Alex');
 await submit();expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
 await change('Another correction');save.mockResolvedValue(true);await submit();
 expect(save.mock.calls[2][0].requestId).not.toBe(save.mock.calls[0][0].requestId);expect(close).toHaveBeenCalledOnce();expect(sessionStorage.length).toBe(0);
});
it('recovers unsaved edits after leaving and returning to the team record',async()=>{
 await render();await change('Recovered Alex');await act(async()=>root.render(null));await render();
 expect(host.querySelector('input')!.value).toBe('Recovered Alex');expect(host.textContent).toContain('Your unsaved edit was restored');expect(save).not.toHaveBeenCalled();
});

async function button(label:string){await act(async()=>{const node=Array.from(host.querySelectorAll('button')).find(node=>node.textContent===label);expect(node).toBeTruthy();node!.click();});}
it('preserves a conflicting draft across repeated reloads and requires an explicit field choice',async()=>{
 await render();await change('My correction');await act(async()=>root.render(null));
 const current={...record,fields:{...record.fields,name:'Teammate correction',email:'new@example.test'},revision:'2026-09-09T12:00:00Z'};
 await render(current);expect(host.textContent).toContain('This record changed while you were away');
 expect(host.textContent).toContain('Current: Teammate correction');expect(host.textContent).toContain('Your draft: My correction');
 expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
 await submit();expect(save).not.toHaveBeenCalled();
 await act(async()=>root.render(null));await render(current);expect(host.textContent).toContain('Your draft: My correction');
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await button('Apply selected changes');
 expect(host.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe('new@example.test');await submit();
 expect(save.mock.calls[0][0]).toMatchObject({revision:current.revision,changes:{name:'My correction'}});
 expect(Object.keys(save.mock.calls[0][0].changes)).toEqual(['name']);
});
it('recovers nonconflicting fields without reverting a teammate’s other edits',async()=>{
 await render();await change('My correction');await act(async()=>root.render(null));
 await render({...record,fields:{...record.fields,email:'teammate@example.test'},revision:'2026-09-09T12:00:00Z'});
 expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
 await button('Apply selected changes');await submit();expect(save.mock.calls[0][0].changes).toEqual({name:'My correction'});
 expect(host.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe('teammate@example.test');
});
it('can discard a stale draft without writing or overwriting the current record',async()=>{
 await render();await change('My correction');await act(async()=>root.render(null));
 const current={...record,fields:{...record.fields,name:'Current value'}};await render(current);await button('Keep current record');
 expect(sessionStorage.length).toBe(0);expect(host.querySelector('input')!.value).toBe('Current value');expect(save).not.toHaveBeenCalled();
 await act(async()=>root.render(null));await render(current);expect(host.textContent).not.toContain('Review your unsaved changes');
});
