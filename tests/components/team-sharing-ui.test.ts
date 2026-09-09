// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:({href,children,...props}:any)=>React.createElement('a',{href,...props},children)}));
import {SharedRecordsClient} from '@/app/teams/[teamId]/records/records-client';
let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;
let shared=false;let fail=true;let brokerageAvailable=false;let brokerageShared=false;let canEdit=false;
const fetchMock=vi.fn(async (url:string,init?:RequestInit)=>{
 if(init?.method==='POST'){
  if(fail){fail=false;return new Response('{}',{status:403});}
  const action=JSON.parse(String(init.body)).action;shared=['share','share_brokerage'].includes(action);brokerageShared=action==='share_brokerage';return new Response(JSON.stringify({success:true}));
 }
 if(url.includes('mode=brokerage_candidates'))return new Response(JSON.stringify({spaces:[],spaceId:null,records:[{id:'broker-person',name:'Brokerage buyer'}],nextOffset:null}));
 if(url.includes('mode=candidates'))return new Response(JSON.stringify({spaces:[{id:'my-space',name:'My business'}],spaceId:'my-space',records:[{id:'person-a',name:'Alex',email:'alex@example.test',leadType:'buyer'}],nextOffset:null}));
 return new Response(JSON.stringify({records:shared?[{grantId:'grant-a',kind:'contact',title:'Alex',fields:{name:'Alex',email:'alex@example.test'},canRevoke:true,canEdit,revision:canEdit?'2026-09-09T12:00:00Z':undefined,source:brokerageShared?'brokerage':undefined}]:[],brokerageSharingAvailable:brokerageAvailable,nextOffset:null}));
});
function button(text:string){const found=Array.from(host.querySelectorAll('button')).find(node=>node.textContent===text);if(!found)throw new Error(`Missing ${text}`);return found;}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);fetchMock.mockClear();shared=false;fail=true;brokerageAvailable=false;brokerageShared=false;canEdit=false;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
describe('sharing save and recovery',()=>{
 it('uses brokerage authority without sending a personal workspace ID',async()=>{
  brokerageAvailable=true;fail=false;
  await act(async()=>root.render(React.createElement(SharedRecordsClient,{teamId:'team-a',teamName:'Team A'})));
  await act(async()=>button('Share a record').click());
  const source=host.querySelector('select')!;
  await act(async()=>{source.value='brokerage';source.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
  const candidate=Array.from(host.querySelectorAll('button')).find(node=>node.textContent?.startsWith('Brokerage buyer'))!;
  await act(async()=>candidate.click());await act(async()=>button('Share selected record').click());
  const mutation=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').at(-1)!;
  expect(JSON.parse(String(mutation[1]?.body))).toEqual({action:'share_brokerage',kind:'contact',recordId:'broker-person'});
  expect(host.textContent).toContain('Shared by the brokerage');
  await act(async()=>button('Stop sharing').click());
  const revoke=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').at(-1)!;
  expect(JSON.parse(String(revoke[1]?.body))).toEqual({action:'revoke_brokerage',grantId:'grant-a'});
 });

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

it('closes the editor when refreshed sharing authority no longer permits edits',async()=>{
 shared=true;canEdit=true;fail=false;
 await act(async()=>root.render(React.createElement(SharedRecordsClient,{teamId:'team-a',teamName:'Team A'})));
 await act(async()=>button('Edit details').click());expect(host.querySelector('form[aria-label="Edit Alex"]')).toBeTruthy();
 // A failed save preserves the form, then refreshing returns a read-only grant.
 fail=true;const field=host.querySelector<HTMLInputElement>('input[type="text"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'New name');field.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Save changes').click());canEdit=false;
 await act(async()=>button('Retry').click());
 expect(host.querySelector('form[aria-label="Edit Alex"]')).toBeNull();expect(host.textContent).not.toContain('Edit details');expect(host.querySelector('article')).toBeTruthy();
});
