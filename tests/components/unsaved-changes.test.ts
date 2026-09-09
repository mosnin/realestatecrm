// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes';
let root:ReturnType<typeof createRoot>;
let host:HTMLDivElement;
let controls:ReturnType<typeof useUnsavedChanges>;
function Harness({dirty}:{dirty:boolean}){controls=useUnsavedChanges(dirty);return React.createElement('a',{href:'/other-workspace'},'Switch workspace');}
afterEach(async()=>{await act(async()=>root?.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('keeps unsaved edits on cancelled navigation and releases the guard after save',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness,{dirty:true})));
  const event=new MouseEvent('click',{bubbles:true,cancelable:true});host.querySelector('a')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(confirm).toHaveBeenCalledOnce();
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
  controls.markSaved();const savedUnload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(savedUnload);expect(savedUnload.defaultPrevented).toBe(false);
});
