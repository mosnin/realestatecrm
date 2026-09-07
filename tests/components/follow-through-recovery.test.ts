// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FollowThroughDesk} from '@/components/follow-through/desk';
vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
it('preserves commitments during coverage failure and lets the user reach work beyond row 20',async()=>{
 const items=Array.from({length:25},(_,i)=>({id:String(i),contactId:'person',title:`Promise ${i}`,instruction:'Inspection update',dueAt:new Date().toISOString(),status:'open',scheduledMessageId:null}));
 vi.stubGlobal('fetch',vi.fn(async url=>String(url).includes('/coverage')?{ok:false,json:async()=>({error:'offline'})}:{ok:true,json:async()=>({items,contacts:[]})}));
 const container=document.createElement('div');const root=createRoot(container);
 await act(async()=>root.render(React.createElement(FollowThroughDesk,{slug:'test'})));
 expect(container.textContent).toContain('Automatic coverage status unavailable');expect(container.textContent).toContain('Promise 0');expect(container.textContent).not.toContain('Promise 24');
 const more=Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Show more commitments'))!;
 await act(async()=>more.click());expect(container.textContent).toContain('Promise 24');
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
