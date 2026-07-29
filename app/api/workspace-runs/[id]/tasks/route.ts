import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { isWorkspaceRunFollowUpsEnabledForSpace } from '@/lib/chippi/workspace-run-flag';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { enqueueWorkspaceRunTask, getWorkspaceRun, kickWorkspaceRunTask, planWorkspaceRunTask } from '@/lib/workspace-runs/server';

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
  if (body.action === 'cancel') return NextResponse.json({ error: 'A completed workspace cannot be cancelled. Active continuation cancellation is not available in this release.' }, { status: 409 });
  const instruction = typeof body.instruction === 'string' ? body.instruction.replace(/\s+/g, ' ').trim().slice(0, 1000) : '';
  if (instruction.length < 3) return NextResponse.json({ error: 'Describe what to continue in a few words.' }, { status: 400 });
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 128) : '';
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ error: 'A valid continuation key is required.' }, { status: 400 });
  const taskId = crypto.randomUUID();
  try {
    const task = await enqueueWorkspaceRunTask({ runId: checked.id, spaceId: checked.auth.space.id, taskId, idempotencyKey, instruction, commandPlan: planWorkspaceRunTask(instruction) });
    if (task.created) await kickWorkspaceRunTask({ taskId: task.taskId, runId: checked.id, spaceId: checked.auth.space.id });
    const refreshed = await getWorkspaceRun(checked.id, checked.auth.space.id);
    const view = refreshed?.tasks.find((item) => item.id === task.taskId);
    return NextResponse.json({ task: view ?? { id: task.taskId, status: task.status } }, { status: task.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('already active')) return NextResponse.json({ error: 'A workspace continuation is already running.' }, { status: 409 });
    return NextResponse.json({ error: 'Could not start the workspace continuation.' }, { status: 500 });
  }
}
