import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
import {transitionWorkItem,workItemInput,type TeamWorkItem} from '@/lib/teams/work-items';
const item:TeamWorkItem={id:'task',teamId:'team',createdBy:'creator',assignedTo:'agent',title:'Call the buyer',description:'',dueAt:'2026-09-09T10:00:00Z',status:'assigned',version:1,acknowledgedAt:null,completedAt:null};
describe('team work authority and lifecycle',()=>{
  it('requires the assignee to acknowledge before completing',()=>{
    expect(()=>transitionWorkItem(item,'agent','member',{id:item.id,version:1,action:'complete'})).toThrow('Acknowledge');
    expect(transitionWorkItem(item,'agent','member',{id:item.id,version:1,action:'accept'}).status).toBe('accepted');
    expect(transitionWorkItem({...item,status:'accepted'},'agent','member',{id:item.id,version:1,action:'complete'}).status).toBe('done');
  });
  it('does not let even a manager falsely acknowledge another person’s work',()=>{
    expect(()=>transitionWorkItem(item,'manager','admin',{id:item.id,version:1,action:'accept'})).toThrow('assignee');
  });
  it('rejects stale and terminal updates',()=>{
    expect(()=>transitionWorkItem(item,'agent','member',{id:item.id,version:2,action:'accept'})).toThrow('changed');
    expect(()=>transitionWorkItem({...item,status:'done'},'agent','owner',{id:item.id,version:1,action:'cancel'})).toThrow('changed');
  });
  it('requires management authority to reassign and resets acknowledgment',()=>{
    const input={id:item.id,version:1,action:'reassign' as const,assignedTo:'new-agent'};
    expect(()=>transitionWorkItem(item,'agent','member',input)).toThrow('managers');
    expect(transitionWorkItem({...item,status:'accepted'},'manager','admin',input)).toEqual({assignedTo:'new-agent',status:'assigned',acknowledgedAt:null,completedAt:null});
  });
  it('limits cancellation to the creator or management',()=>{
    expect(()=>transitionWorkItem(item,'stranger','member',{id:item.id,version:1,action:'cancel'})).toThrow('creator');
    expect(transitionWorkItem(item,'creator','member',{id:item.id,version:1,action:'cancel'}).status).toBe('cancelled');
  });
  it('requires an explicit bounded action, assignee, and due date',()=>{
    expect(workItemInput.safeParse({title:'',assignedTo:'agent',dueAt:'tomorrow'}).success).toBe(false);
    expect(workItemInput.safeParse({title:'Follow up',assignedTo:'agent',dueAt:'2026-09-09T10:00:00Z',spaceId:'foreign'}).success).toBe(false);
  });
});
