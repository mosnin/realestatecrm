// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:({href,children,...props}:any)=>React.createElement('a',{href,...props},children)}));
import {SharedRecordsClient} from '@/app/teams/[teamId]/records/records-client';
let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;
let shared=false;let fail=true;
const fetchMock=vi.fn(async (url:string,init?:RequestInit)=>{
 if(init?.method==='POST'){
  if(fail){fail=false;return new Response('{}',{status:403});}
  shared=JSON.parse(String(init.body)).action==='share';return new Response(JSON.stringify({success:true}));
 }
 if(url.includes('mode=candidates'))return new Response(JSON.stringify({spaces:[{id:'my-space',name:'My business'}],spaceId:'my-space',records:[{id:'person-a',name:'Alex',email:'alex@example.test',leadType:'buyer'}],nextOffset:null}));
 return new Response(JSON.stringify({records:shared?[{grantId:'grant-a',kind:'contact',title:'Alex',fields:{name:'Alex',email:'alex@example.test'},canRevoke:true}]:[],nextOffset:null}));
});
function button(text:string){const found=Array.from(host.querySelectorAll('button')).find(node=>node.textContent===text);if(!found)throw new Error(`Missing ${text}`);return found;}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);fetchMock.mockClear();shared=false;fail=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
describe('sharing save and recovery',()=>{
 it('requires selection, retains a failed share, and removes a revoked record',async()=>{
  await act(async()=>root.render(React.createElement(SharedRecordsClient,{teamId:'team-a',teamName:'Team A'})));
  await act(async()=>button('Share a record').click());
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  expect(fetchMock.mock.calls.filter(([url])=>url.includes('mode=candidates'))).toHaveLength(1);
  expect(host.textContent).toContain('Notes, messages, files, and other linked records stay private');
  expect(host.textContent).not.toContain('Share selected record');
  const candidate=Array.from(host.querySelectorAll('button')).find(node=>node.textContent?.startsWith('Alex'))!;
  await act(async()=>candidate.click());
  await act(async()=>button('Share selected record').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be saved');
  expect(host.querySelectorAll('article')).toHaveLength(0);expect(button('Share selected record').disabled).toBe(false);
  await act(async()=>button('Share selected record').click());
  expect(host.querySelectorAll('article')).toHaveLength(1);
  const mutation=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').at(-1)!;
  expect(JSON.parse(String(mutation[1]?.body))).toEqual({action:'share',kind:'contact',recordId:'person-a',spaceId:'my-space'});
  await act(async()=>button('Stop sharing').click());expect(host.querySelectorAll('article')).toHaveLength(0);
 });
});
