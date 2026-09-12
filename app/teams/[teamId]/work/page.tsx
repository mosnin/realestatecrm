import {FormDraftProvider} from '@/hooks/use-form-draft';
import {auth} from '@clerk/nextjs/server';
import {notFound,redirect} from 'next/navigation';
import {resolveWorkforceScope} from '@/lib/workforce/scope';
import {TeamWorkClient} from './work-client';
export const metadata={title:'Team work — Chippi'};
export default async function Page({params}:{params:Promise<{teamId:string}>}) {
  if(process.env.CHIPPI_WORKFORCE_ENABLED!=='true'||process.env.CHIPPI_TEAM_CRM_ENABLED!=='true')notFound();
  const {userId}=await auth();if(!userId)redirect('/login/realtor');
  const {teamId}=await params;
  let scope;try{scope=await resolveWorkforceScope('team',teamId,userId);}catch{notFound();}
  return <FormDraftProvider actorId={scope.principal.actorId} spaceId={`team:${teamId}`}><TeamWorkClient key={teamId} teamId={teamId} name={scope.principal.name}/></FormDraftProvider>;
}
