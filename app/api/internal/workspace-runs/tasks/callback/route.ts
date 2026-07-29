import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildKey, uploadObject } from '@/lib/storage';

export const runtime = 'nodejs';
const MAX_OUTPUT = 6_000; const MAX_FILE_BYTES = 32_000;
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
  const taskId = typeof body.task_id === 'string' ? body.task_id : ''; const spaceId = typeof body.space_id === 'string' ? body.space_id : ''; const sequence = Number(body.sequence); const type = typeof body.type === 'string' ? body.type : '';
  if (!taskId || !spaceId || !Number.isInteger(sequence) || sequence < 1 || !allowedTypes.has(type)) return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  const { data: task } = await supabase.from('WorkspaceRunTask').select('id,runId,sequence,status,cancellationRequestedAt').eq('id', taskId).eq('spaceId', spaceId).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (['completed','failed','cancelled'].includes(task.status)) return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: task.status === 'cancelled' || Boolean(task.cancellationRequestedAt) });
  const event = { taskId, sequence, type, message: String(body.message ?? '').slice(0, 500), command: typeof body.command === 'string' ? body.command.slice(0, 240) : null, output: typeof body.output === 'string' ? body.output.slice(0, MAX_OUTPUT) : null };
  const terminalType = ['completed','failed','cancelled'].includes(type);
  if (!terminalType) {
    const { data: inserted, error } = await supabase.from('WorkspaceRunTaskEvent').insert(event).select('id').maybeSingle();
    if (error?.code === '23505') return NextResponse.json({ ok: true, ignored: 'duplicate_event' });
    if (error || !inserted) return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }
  const fail = async (message: string) => {
    await supabase.rpc('finish_workspace_run_task', { p_task_id: taskId, p_space_id: spaceId, p_outcome: 'failed', p_error: message, p_sequence: sequence, p_message: message });
    return NextResponse.json({ error: message }, { status: 409 });
  };
  // Re-read immediately before object persistence so cancellation wins even
  // when it arrived while the isolated VM was finishing its program.
  const { data: current } = type === 'completed'
    ? await supabase.from('WorkspaceRunTask').select('cancellationRequestedAt,status').eq('id', taskId).eq('spaceId', spaceId).maybeSingle()
    : { data: task };
  const cancelledBeforePublish = Boolean(current?.cancellationRequestedAt) || current?.status === 'cancelled';
  const publishedFiles: Array<{ id: string; storageKey: string; name: string; mimeType: string; sizeBytes: number }> = [];
  if (type === 'completed' && !cancelledBeforePublish) {
    const rawFiles = Array.isArray(body.files) ? body.files : []; const expectedName = `workspace-follow-up-${task.sequence}.md`;
    if (rawFiles.length !== 1 || rawFiles[0]?.name !== expectedName || typeof rawFiles[0]?.content !== 'string') return fail('Workspace continuation manifest is incomplete.');
    const content = Buffer.from(rawFiles[0].content, 'base64');
    if (!content.byteLength || content.byteLength > MAX_FILE_BYTES) return fail('Workspace continuation file is invalid.');
    try {
      const key = buildKey('files', spaceId, `workspace-task-${crypto.createHash('sha256').update(taskId).digest('hex')}-${expectedName}`);
      await uploadObject({ key, body: content, contentType: 'text/markdown; charset=utf-8', isPublic: false });
      publishedFiles.push({ id: crypto.createHash('sha256').update(`${taskId}:${expectedName}`).digest('hex').slice(0, 32), storageKey: key, name: expectedName, mimeType: 'text/markdown', sizeBytes: content.byteLength });
    } catch { return fail('Could not persist workspace continuation file.'); }
  }
  const terminal = cancelledBeforePublish || task.cancellationRequestedAt || type === 'cancelled' ? 'cancelled' : type === 'completed' ? 'completed' : type === 'failed' ? 'failed' : type === 'workspace_started' ? 'running' : null;
  if (terminal === 'completed' || terminal === 'failed' || terminal === 'cancelled') {
    const { data: finished, error } = await supabase.rpc('finish_workspace_run_task', { p_task_id: taskId, p_space_id: spaceId, p_outcome: terminal, p_error: terminal === 'failed' ? event.message : null, p_sequence: sequence, p_message: event.message, p_output: terminal === 'completed' ? event.output : null, p_files: terminal === 'completed' ? publishedFiles : [] });
    if (error) return NextResponse.json({ error: 'Workspace continuation terminal update failed.' }, { status: 409 });
    return NextResponse.json({ ok: true, finished, cancellationRequested: terminal === 'cancelled' });
  }
  if (terminal === 'running') await supabase.from('WorkspaceRunTask').update({ status: 'running', updatedAt: new Date().toISOString() }).eq('id', taskId).eq('spaceId', spaceId).eq('status', 'launching');
  return NextResponse.json({ ok: true, cancellationRequested: Boolean(task.cancellationRequestedAt) });
}
