import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.stubGlobal('React',React);
vi.mock('@/lib/broker-records',()=>({getBrokerRecord:async()=>({id:'person',spaceId:'space',name:'Alex'})}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/tenant-db',()=>({tenantTable:()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[],error:null})})})})})}));
const {attach}=vi.hoisted(()=>({attach:vi.fn()}));
vi.mock('@/lib/people-work',()=>({attachPeopleWork:attach}));
import Page from '@/app/broker/people/[id]/page';
it('shows the same failed-delivery reason that puts a person in the attention list',async()=>{
 attach.mockImplementation(async records=>records.map((p:any)=>({...p,work:{title:'Send inspection update',label:'Needs attention',requiresAttention:true,dueAt:new Date().toISOString()}})));
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'person'})}));
 expect(attach).toHaveBeenCalledWith([expect.objectContaining({id:'person',spaceId:'space'})]);
 expect(html).toContain('Needs attention · Send inspection update');
 expect(html).not.toContain('No due follow-up flagged');
});
it('exposes unavailable execution data instead of a clean bill of health',async()=>{
 attach.mockImplementation(async records=>records.map((p:any)=>({...p,work:null,workUnavailable:true})));
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'person'})}));
 expect(html).toContain('Follow-through status unavailable');
 expect(html).not.toContain('No due follow-up flagged');
});
