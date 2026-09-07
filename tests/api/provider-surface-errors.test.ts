import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({execute:vi.fn(),connectionId:'one',spaceId:'s',list:vi.fn(),configured:true}));
vi.mock('@/lib/api-auth',()=>({requireSpaceOwner:async()=>({space:{id:state.spaceId}}),requireAuth:async()=>({userId:'user'})}));
vi.mock('@/lib/space',()=>({getSpaceForUser:async()=>({id:'s'})}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn(),warn:vi.fn()}}));
vi.mock('@/lib/integrations/composio',()=>({executeToolForEntity:state.execute,composioConfigured:()=>state.configured,getComposio:()=>({connectedAccounts:{list:state.list}})}));
vi.mock('@/lib/calendar/mirror',()=>({PROVIDER_TOOL_SLUGS:{googlecalendar:{list:'list'}},findCalendarConnection:async()=>({id:state.connectionId,userId:'user',toolkit:'googlecalendar'}),writeEventThrough:vi.fn()}));
vi.mock('@/lib/communication/connect',()=>({findEmailConnection:async()=>({id:'mail',userId:'user',toolkit:'gmail'}),PROVIDER_MAIL_SLUGS:{gmail:{list:'mail'}}}));
vi.mock('@/lib/integrations/connections',()=>({markExpiredByToolkit:vi.fn(),listConnections:async()=>[{toolkit:'gmail',status:'active',composioConnectionId:'one'},{toolkit:'fub',status:'active',composioConnectionId:'native:fub'}]}));
vi.mock('@/lib/integrations/catalog',()=>({findIntegration:()=>null}));
import {GET as calendar} from '@/app/api/calendar/events/route';
import {GET as email} from '@/app/api/email/route';
import {GET as health} from '@/app/api/integrations/health/route';
beforeEach(()=>{vi.clearAllMocks();state.spaceId=crypto.randomUUID();state.connectionId='one';state.configured=true;});
it('calendar refuses a failed provider result and does not cache it as empty',async()=>{
 state.execute.mockResolvedValueOnce({successful:false}).mockResolvedValueOnce({successful:true,data:{items:[]}});
 const request=()=>new NextRequest('http://localhost/api/calendar/events?slug=test');
 expect((await calendar(request())).status).toBe(502);
 expect((await calendar(request())).status).toBe(200);expect(state.execute).toHaveBeenCalledTimes(2);
});
it('a calendar reconnect bypasses the previous connection cache',async()=>{
 state.execute.mockResolvedValue({successful:true,data:{items:[]}});
 await calendar(new NextRequest('http://localhost/api/calendar/events?slug=test'));state.connectionId='two';
 await calendar(new NextRequest('http://localhost/api/calendar/events?slug=test'));expect(state.execute).toHaveBeenCalledTimes(2);
});
it('mail provider refusal is an error, never an empty inbox',async()=>{
 state.execute.mockResolvedValue({successful:false});expect((await email(new NextRequest('http://localhost/api/email?slug=test'))).status).toBe(502);
});
it('missing provider configuration cannot certify saved connections',async()=>{
 state.configured=false;const body=await(await health()).json();expect(body.connections.map((c:any)=>c.status)).toEqual(['unknown','unknown']);
});
it('only a returned active provider account is verified',async()=>{
 state.list.mockResolvedValue({items:[{id:'one',status:'ACTIVE'}]});const body=await(await health()).json();expect(body.connections.map((c:any)=>c.status)).toEqual(['healthy','unknown']);
});
