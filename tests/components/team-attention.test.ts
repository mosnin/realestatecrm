// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
vi.mock('next/link',()=>({default:({children,...props}:any)=>React.createElement('a',props,children)}));
import {TeamsClient} from '@/app/teams/teams-client';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const fetchMock=vi.fn();
let overdue=2;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);overdue=2;fetchMock.mockReset().mockImplementation(async()=>new Response(JSON.stringify({teams:[{id:'team-a',name:'Harbor',role:'admin',attention:{overdue,manager:true}},{id:'team-b',name:'North',role:'member',attention:null}],parents:[]})));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('links managers to overdue work and refreshes attention as work is resolved',async()=>{
 await act(async()=>root.render(React.createElement(TeamsClient,{sharedRecordsEnabled:true})));
 const alert=Array.from(host.querySelectorAll('a')).find(a=>a.textContent?.includes('2 overdue actions'))!;
 expect(alert.getAttribute('href')).toBe('/teams/team-a/work');expect(alert.textContent).toContain('Review team work');expect(host.textContent).toContain('Work status unavailable');
 overdue=0;await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(host.textContent).not.toContain('overdue actions');expect(fetchMock).toHaveBeenCalledTimes(2);
});
