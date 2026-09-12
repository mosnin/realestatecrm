import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {resolveWorkforceScope} from '@/lib/workforce/scope';
import {createTeamWork,listTeamWork,updateTeamWork,workItemInput,workItemUpdate} from '@/lib/teams/work-items';
import {readJsonWithLimit,BODY_LIMITS} from '@/lib/validation';
import {checkRateLimit} from '@/lib/rate-limit';
import {audit} from '@/lib/audit';
type Context={params:Promise<{teamId:string}>};
export const dynamic='force-dynamic';
async function context(input:Context) {
  if(process.env.CHIPPI_WORKFORCE_ENABLED!=='true'||process.env.CHIPPI_TEAM_CRM_ENABLED!=='true') throw new Error('disabled');
  const {userId}=await auth(); if(!userId) throw new Error('unauthenticated');
  const {teamId}=await input.params;
  const scope=await resolveWorkforceScope('team',teamId,userId);
  return {teamId,actorId:scope.principal.actorId,userId};
}
function failure(error:unknown) {
  const code=error instanceof Error?error.message:'';
  return NextResponse.json({error:'Team work is unavailable. Refresh and check your access.'},{status:code==='disabled'?404:code==='unauthenticated'?401:409,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:Request,ctx:Context) {
  try {
    const {teamId,actorId}=await context(ctx);
    const params=new URL(req.url).searchParams;
    const offset=Number(params.get('offset')??0);
    if(params.has('closed')&&!['true','false'].includes(params.get('closed')!)) return NextResponse.json({error:'Invalid view'},{status:400});
    if(!Number.isInteger(offset)||offset<0||offset>100000) return NextResponse.json({error:'Invalid page'},{status:400});
    return NextResponse.json(await listTeamWork(teamId,actorId,offset,params.get('closed')==='true'),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
async function write(req:Request,ctx:Context,update:boolean) {
  try {
    const {teamId,actorId,userId}=await context(ctx);
    if(!(await checkRateLimit(`team-work:${actorId}`,30,60)).allowed) return NextResponse.json({error:'Please try again shortly'},{status:429});
    const read=await readJsonWithLimit(req,BODY_LIMITS.smallJson);if(!read.ok)return read.response;
    const schema=update?workItemUpdate:workItemInput;
    const parsed=schema.safeParse(read.data);if(!parsed.success)return NextResponse.json({error:'Check the work details and due date'},{status:400});
    const item=update?await updateTeamWork(teamId,actorId,workItemUpdate.parse(parsed.data)):await createTeamWork(teamId,actorId,workItemInput.parse(parsed.data));
    await audit({actorClerkId:userId,action:update?'UPDATE':'CREATE',resource:'TeamWorkItem',resourceId:item.id,metadata:{teamId}});
    return NextResponse.json({item},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export const POST=(req:Request,ctx:Context)=>write(req,ctx,false);
export const PATCH=(req:Request,ctx:Context)=>write(req,ctx,true);
