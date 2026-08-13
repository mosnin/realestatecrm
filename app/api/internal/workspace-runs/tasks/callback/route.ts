import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildKey, uploadObject } from '@/lib/storage';
import { validateWorkspaceCompletionManifest } from '@/lib/workspace-runs/typed-plan';

export const runtime = 'nodejs';
const MAX_OUTPUT = 6_000;
const allowedTypes = new Set(['workspace_started','command_started','command_finished','file_created','completed','failed','cancelled']);
function authorized(req: NextRequest, raw: string): boolean {
  const secret = process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET; const sent = req.headers.get('x-chippy-workspace-signature') ?? '';
  if (!secret || !sent) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}
export async function POST(req: NextRequest) {
  const raw = await req.text(); if (!authorized(req, raw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const taskId = typeof body.task_id === 'string' ? body.task_id : ''; const spaceId = typeof body.space_id === 'string' ? body.space_id : ''; const launchToken = typeof body.launch_token === 'string' ? body.launch_token : ''; const sequence = Number(body.sequence); const type = typeof body.type === 'string' ? body.type : '';
  if (!taskId || !spaceId || !launchToken || !Number.isInteger(sequence) || sequence < 1 || !allowedTypes.has(type)) return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  const { data: task, error: taskError } = await supabase.from('WorkspaceRunTask').select('id,runId,sequence,status,launchToken,modalAcceptedAt,cancellationRequestedAt,executionPlan').eq('id', taskId).eq('spaceId', spaceId).maybeSingle();
  if (taskError) return NextResponse.json({ error: 'Could not verify task launch' }, { status: 500 });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.launchToken !== launchToken) return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
  if (['completed','failed','cancelled'].includes(task.status)) return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: task.status === 'cancelled' || Boolean(task.cancellationRequestedAt) });
  if (!task.modalAcceptedAt || (type !== 'workspace_started' && task.status !== 'running')) return NextResponse.json({ error: 'Workspace continuation launch is not active', cancellationRequested: true }, { status: 409 });
  const event = { taskId, sequence, type, message: String(body.message ?? '').slice(0, 500), command: typeof body.command === 'string' ? body.command.slice(0, 240) : null, output: typeof body.output === 'string' ? body.output.slice(0, MAX_OUTPUT) : null };
  const terminalType = ['completed','failed','cancelled'].includes(type);
  if (!terminalType) {
    const { data: persisted, error } = await supabase.rpc('record_workspace_run_task_event', {
      p_task_id: taskId,
      p_space_id: spaceId,
      p_launch_token: launchToken,
      p_sequence: sequence,
      p_type: type,
      p_message: event.message,
      p_command: event.command,
      p_output: event.output,
    });
    if (error) return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
    if (persisted === 'stale_launch') return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
    if (persisted === 'terminal') return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: Boolean(task.cancellationRequestedAt) });
    if (persisted === 'duplicate_event') return NextResponse.json({ ok: true, ignored: 'duplicate_event' });
    if (persisted === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (persisted !== 'recorded') return NextResponse.json({ error: 'Workspace continuation launch is not active', cancellationRequested: true }, { status: 409 });
  }
  const fail = async (message: string) => {
    const { data: failed, error } = await supabase.rpc('finish_workspace_run_task', { p_task_id: taskId, p_space_id: spaceId, p_launch_token: launchToken, p_outcome: 'failed', p_error: message, p_sequence: sequence, p_message: message });
    if (error) return NextResponse.json({ error: 'Workspace continuation terminal update failed.' }, { status: 500 });
    if (failed !== true) return NextResponse.json({ ok: true, ignored: 'stale_or_terminal', cancellationRequested: true });
    return NextResponse.json({ error: message }, { status: 409 });
  };
  // Re-read immediately before object persistence so cancellation wins even
  // when it arrived while the isolated VM was finishing its program.
  const currentResult = type === 'completed'
    ? await supabase.from('WorkspaceRunTask').select('launchToken,modalAcceptedAt,cancellationRequestedAt,status').eq('id', taskId).eq('spaceId', spaceId).maybeSingle()
    : { data: task, error: null };
  if (currentResult.error) return NextResponse.json({ error: 'Could not verify publication state' }, { status: 500 });
  const current = currentResult.data;
  if (!current || current.launchToken !== launchToken || !current.modalAcceptedAt) return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
  if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: current.status === 'cancelled' || Boolean(current.cancellationRequestedAt) });
  const cancelledBeforePublish = Boolean(current?.cancellationRequestedAt) || current?.status === 'cancelled';
  const publishedFiles: Array<{ id: string; storageKey: string; name: string; mimeType: string; sizeBytes: number }> = [];
  if (type === 'completed' && !cancelledBeforePublish) {
    const artifacts = validateWorkspaceCompletionManifest(body.files, task.executionPlan, task.sequence);
    if (!artifacts) return fail('Workspace continuation manifest is incomplete.');
    try {
      for (const artifact of artifacts) {
        const content = artifact.content;
        const key = buildKey('files', spaceId, `workspace-task-${crypto.createHash('sha256').update(taskId).digest('hex')}-${artifact.name}`);
        const contentType = artifact.mimeType === 'text/markdown' ? 'text/markdown; charset=utf-8' : artifact.mimeType === 'text/csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
        await uploadObject({ key, body: content, contentType, isPublic: false });
        publishedFiles.push({ id: crypto.createHash('sha256').update(`${taskId}:${artifact.name}`).digest('hex').slice(0, 32), storageKey: key, name: artifact.name, mimeType: artifact.mimeType, sizeBytes: content.byteLength });
      }
    } catch { return fail('Could not persist workspace continuation file.'); }
  }
  const terminal = cancelledBeforePublish || task.cancellationRequestedAt || type === 'cancelled' ? 'cancelled' : type === 'completed' ? 'completed' : type === 'failed' ? 'failed' : type === 'workspace_started' ? 'running' : null;
  if (terminal === 'completed' || terminal === 'failed' || terminal === 'cancelled') {
    const { data: finished, error } = await supabase.rpc('finish_workspace_run_task', { p_task_id: taskId, p_space_id: spaceId, p_launch_token: launchToken, p_outcome: terminal, p_error: terminal === 'failed' ? event.message : null, p_sequence: sequence, p_message: event.message, p_output: terminal === 'completed' ? event.output : null, p_files: terminal === 'completed' ? publishedFiles : [] });
    if (error) return NextResponse.json({ error: 'Workspace continuation terminal update failed.' }, { status: 409 });
    return NextResponse.json({ ok: true, finished, cancellationRequested: terminal === 'cancelled' });
  }
  return NextResponse.json({ ok: true, cancellationRequested: Boolean(task.cancellationRequestedAt) });
}
