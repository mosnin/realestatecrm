import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkforceScope } from '@/lib/workforce/scope';
import { listSharedRecords, RECORD_KINDS, revokeRecord, shareRecord, sharingCandidates } from '@/lib/teams/shared-records';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import {brokerageCandidates,shareBrokerageRecord,revokeBrokerageRecord} from '@/lib/teams/brokerage-records';
import { audit } from '@/lib/audit';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/);
const kind = z.enum(RECORD_KINDS);
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('share'), spaceId: id, kind, recordId: id }).strict(),
  z.object({ action: z.literal('share_brokerage'), kind, recordId: id }).strict(),
  z.object({ action: z.literal('revoke_brokerage'), grantId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('revoke'), grantId: z.string().uuid() }).strict(),
]);
const querySchema = z.object({ mode: z.enum(['shared', 'candidates', 'brokerage_candidates']).default('shared'), kind: kind.optional(), spaceId: id.optional(), search: z.string().max(100).optional(), offset: z.coerce.number().int().min(0).max(100000).default(0) });
type Context = { params: Promise<{ teamId: string }> };
export const dynamic = 'force-dynamic';
async function authority(context: Context) {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true' || process.env.CHIPPI_TEAM_CRM_ENABLED !== 'true') throw new Error('disabled');
  const { userId } = await auth();
  if (!userId) throw new Error('unauthenticated');
  const { teamId } = await context.params;
  const scope = await resolveWorkforceScope('team', id.parse(teamId), userId);
  return { userId, teamId, scope };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return NextResponse.json({ error: message === 'disabled' ? 'Team sharing is not enabled' : 'Shared records are unavailable. Check your access and try again.' },
    { status: message === 'disabled' ? 404 : message === 'unauthenticated' ? 401 : 403, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: Request, context: Context) {
  try {
    const { teamId, scope } = await authority(context);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const input = parsed.data;
    const result = input.mode === 'brokerage_candidates'
      ? await brokerageCandidates(teamId,scope.principal.actorId,{...input,kind:input.kind??'contact'})
      : input.mode === 'candidates'
      ? await sharingCandidates(teamId, scope.principal.actorId, { ...input, kind: input.kind ?? 'contact' })
      : await listSharedRecords(teamId, scope.principal.actorId, input);
    return NextResponse.json({ ...result, teamName: scope.principal.name }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { teamId, scope, userId } = await authority(context);
    if (!(await checkRateLimit(`team-records:${scope.principal.actorId}`, 30, 60)).allowed) return NextResponse.json({ error: 'Please try again shortly' }, { status: 429 });
    const read = await readJsonWithLimit(request, BODY_LIMITS.smallJson);
    if (!read.ok) return read.response;
    const parsed = bodySchema.safeParse(read.data);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const input = parsed.data;
    if (input.action === 'share') {
      const grant = await shareRecord(teamId, scope.principal.actorId, input);
      await audit({ actorClerkId: userId, action: 'CREATE', resource: 'TeamRecordGrant', resourceId: grant.id, spaceId: input.spaceId, metadata: { teamId, recordKind: input.kind, recordId: input.recordId } });
    } else if(input.action==='share_brokerage') {
      const grant=await shareBrokerageRecord(teamId,scope.principal.actorId,input);
      await audit({actorClerkId:userId,action:'CREATE',resource:'BrokerageTeamRecordGrant',resourceId:grant.id,metadata:{brokerageId:grant.brokerageId,teamId,recordKind:input.kind,recordId:input.recordId}});
    } else if(input.action==='revoke_brokerage') {
      const revoked=await revokeBrokerageRecord(teamId,scope.principal.actorId,input.grantId);
      await audit({actorClerkId:userId,action:'UPDATE',resource:'BrokerageTeamRecordGrant',resourceId:input.grantId,metadata:{brokerageId:revoked.brokerageId,teamId,revoked:true}});
    } else {
      const revoked = await revokeRecord(teamId, scope.principal.actorId, input.grantId);
      await audit({ actorClerkId: userId, action: 'UPDATE', resource: 'TeamRecordGrant', resourceId: input.grantId, spaceId: revoked.spaceId, metadata: { teamId, revoked: true } });
    }
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
