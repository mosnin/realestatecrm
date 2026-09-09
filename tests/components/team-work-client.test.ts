// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('next/link',()=>({default:({children,...props}:any)=>React.createElement('a',props,children)}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant,...props}:any)=>React.createElement('button',props,children)}));
vi.mock('@/components/ui/input',()=>({Input:(props:any)=>React.createElement('input',props)}));
import {TeamWorkClient} from '@/app/teams/[teamId]/work/work-client';
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
const fetchMock=vi.fn();
const item={id:'task-a',teamId:'team-a',createdBy:'manager',assignedTo:'agent',title:'Confirm inspection',description:'',dueAt:'2026-09-01T10:00:00Z',status:'assigned',version:1,acknowledgedAt:null,completedAt:null};
const data={items:[item],role:'member',actorId:'agent',people:[{id:'agent',name:'Me'}],nextOffset:null};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(){await act(async()=>root.render(React.createElement(TeamWorkClient,{teamId:'team-a',name:'Team A'})));}
async function click(label:string){const button=[...host.querySelectorAll('button')].find(button=>button.textContent===label);expect(button).toBeTruthy();await act(async()=>button!.click());}
it('acknowledges the exact version and then exposes completion',async()=>{
 fetchMock.mockResolvedValueOnce(response(data)).mockResolvedValueOnce(response({item:{...item,status:'accepted',version:2}})).mockResolvedValueOnce(response({...data,items:[{...item,status:'accepted',version:2}]}));
 await mount();expect(host.textContent).toContain('Overdue');expect(host.textContent).not.toContain('Mark complete');
 await click('Acknowledge');expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({id:'task-a',version:1,action:'accept'});expect(host.textContent).toContain('Mark complete');expect(host.textContent).not.toContain('Acknowledge');
});
it('does not offer acknowledgment or completion for someone else’s assignment',async()=>{
 fetchMock.mockResolvedValue(response({...data,items:[{...item,assignedTo:'other'}]}));await mount();expect(host.textContent).not.toContain('Acknowledge');expect(host.textContent).not.toContain('Mark complete');
});
it('keeps failed updates visible without pretending work completed',async()=>{
 fetchMock.mockResolvedValueOnce(response(data)).mockResolvedValueOnce(response({error:'conflict'},409));await mount();await click('Acknowledge');expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not save');expect(host.textContent).toContain('Acknowledge');
});
it('queries completed work from the first page instead of filtering a partial page',async()=>{
 fetchMock.mockResolvedValueOnce(response({...data,nextOffset:50})).mockResolvedValueOnce(response({...data,items:[]}));await mount();await click('Show completed');expect(fetchMock.mock.calls[1][0]).toBe('/api/teams/team-a/work?offset=0&closed=true');expect(host.textContent).toContain('No completed work');
});
it('shows an explicit load failure with recovery',async()=>{
 fetchMock.mockResolvedValueOnce(response({},503)).mockResolvedValueOnce(response(data));await mount();expect(host.querySelector('[role="alert"]')).toBeTruthy();await click('Refresh');expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.textContent).toContain('Confirm inspection');
});
