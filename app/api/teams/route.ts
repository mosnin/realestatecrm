import { teamWorkAttention } from '@/lib/teams/work-items';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { resolveWorkforceScope, listWorkforceScopes } from '@/lib/workforce/scope';
import { teamUser, listTeams, createTeam, inviteTeam, joinTeam, teamMembers, changeTeamMember } from '@/lib/teams/server';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/);
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(120), parentKind: z.enum(['personal', 'brokerage']), parentRouteId: id }),
  z.object({ action: z.literal('join'), code: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/) }),
  z.object({ action: z.literal('invite'), teamId: id }),
  z.object({ action: z.literal('member'), teamId: id, userId: id, role: z.enum(['admin', 'member', 'remove']) }),
]);
export async function GET(req: Request) {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') return NextResponse.json({ error: 'Teams are not enabled' }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const user = await teamUser(userId);
    const teamId = new URL(req.url).searchParams.get('teamId');
    if (teamId) {
      await resolveWorkforceScope('team',id.parse(teamId),userId);
      return NextResponse.json(await teamMembers(teamId, user.id),{headers:{'Cache-Control':'no-store'}});
    }
    const teams=await listTeams(user.id);
    const visible=[];
    for(const team of teams){
      try{await resolveWorkforceScope('team',team.id,userId);}catch{continue;}
      // An unavailable counter stays unknown; never present an outage as zero overdue work.
      let attention=null;
      if(process.env.CHIPPI_TEAM_CRM_ENABLED==='true')try{attention=await teamWorkAttention(team.id,user.id);}catch{}
      visible.push({...team,attention});
    }
    return NextResponse.json({ teams:visible, parents: (await listWorkforceScopes(userId)).filter(scope => !scope.href.startsWith('/workforce/team/')) },{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({ error: 'Teams unavailable' }, { status: 403 }); }
}
export async function POST(req: Request) {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') return NextResponse.json({ error: 'Teams are not enabled' }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkRateLimit(`teams:${userId}`, 20, 60)).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = input.safeParse(read.data);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid team request' }, { status: 400 });
  try {
    const user = await teamUser(userId);
    const body = parsed.data;
    if (body.action === 'create') {
      await resolveWorkforceScope(body.parentKind, body.parentRouteId, userId);
      return NextResponse.json({ team: await createTeam(user.id, body.name, body.parentKind, body.parentRouteId) }, { status: 201 });
    }
    if (body.action === 'join') return NextResponse.json({ team: await joinTeam(body.code, user.id) });
    if (body.action === 'invite') {
      await resolveWorkforceScope('team', body.teamId, userId);
      return NextResponse.json(await inviteTeam(body.teamId, user.id));
    }
    await resolveWorkforceScope('team',body.teamId,userId);
    await changeTeamMember(body.teamId, user.id, body.userId, body.role);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Team action unavailable. Check your access and try again.' }, { status: 403 }); }
}
