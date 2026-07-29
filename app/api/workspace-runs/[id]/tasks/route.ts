import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { isWorkspaceRunFollowUpsEnabledForSpace } from '@/lib/chippi/workspace-run-flag';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { cancelWorkspaceRunTask, getWorkspaceRun } from '@/lib/workspace-runs/server';
import { continueCompletedWorkspaceRun } from '@/lib/workspace-runs/conversation-continuation';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

async function authorizedCompletedRun(req: NextRequest, params: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return { response: NextResponse.json({ error: 'slug required' }, { status: 400 }) };
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return { response: auth };
  if (!isWorkspaceRunFollowUpsEnabledForSpace(auth.space.id)) return { response: NextResponse.json({ error: 'Workspace continuation is not enabled for this workspace.' }, { status: 404 }) };
  const { id } = await params.params;
  const run = await getWorkspaceRun(id, auth.space.id);
  if (!run) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (run.status !== 'completed') return { response: NextResponse.json({ error: 'Only completed workspaces can be continued.' }, { status: 409 }) };
  return { auth, run, id };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const checked = await authorizedCompletedRun(req, context);
  if ('response' in checked) return checked.response;
  return NextResponse.json({ tasks: checked.run.tasks });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const checked = await authorizedCompletedRun(req, context);
  if ('response' in checked) return checked.response;
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as { instruction?: unknown; idempotencyKey?: unknown; action?: unknown };
  if (body.action === 'cancel') return NextResponse.json({ error: 'Use PATCH to cancel an active workspace continuation.' }, { status: 400 });
  const instruction = typeof body.instruction === 'string' ? body.instruction.replace(/\s+/g, ' ').trim().slice(0, 1000) : '';
  if (instruction.length < 3) return NextResponse.json({ error: 'Describe what to continue in a few words.' }, { status: 400 });
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 128) : '';
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: 'A valid continuation key is required.' }, { status: 400 });
  const result = await continueCompletedWorkspaceRun({ spaceId: checked.auth.space.id, runId: checked.id, instruction, idempotencyKey });
  if (!result.ok) {
    const status = result.code === 'planning_unavailable' ? 503 : ['active', 'conflict', 'not_completed'].includes(result.code) ? 409 : result.code === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  const refreshed = await getWorkspaceRun(checked.id, checked.auth.space.id);
  return NextResponse.json({ task: refreshed?.tasks.find((item) => item.id === result.taskId) ?? { id: result.taskId, status: result.status } }, { status: result.reused ? 200 : 201 });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const checked = await authorizedCompletedRun(req, context);
  if ('response' in checked) return checked.response;
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as { action?: unknown; taskId?: unknown };
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  if (body.action !== 'cancel' || !taskId) return NextResponse.json({ error: 'Unknown task action.' }, { status: 400 });
  try {
    const cancelled = await cancelWorkspaceRunTask({ taskId, spaceId: checked.auth.space.id });
    return cancelled ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'This continuation already finished.' }, { status: 409 });
  } catch { return NextResponse.json({ error: 'Could not cancel the workspace continuation.' }, { status: 500 }); }
}
