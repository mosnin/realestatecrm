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
async function render(){await act(async()=>root.render(React.createElement(FormDraftProvider,{actorId:'agent',spaceId:'team:a',children:React.createElement(SharedRecordEditor,{record,busy:false,onSave:save,onClose:close})})));}
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
