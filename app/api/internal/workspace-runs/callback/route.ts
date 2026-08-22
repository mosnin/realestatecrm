import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { buildKey, uploadObject } from '@/lib/storage';
import { validateParentWorkspaceCompletionManifest } from '@/lib/workspace-runs/parent-manifest';

export const runtime = 'nodejs';
const MAX_OUTPUT = 6_000;
const allowedTypes = new Set(['workspace_started','command_started','command_finished','file_created','completed','failed','cancelled']);

function authorized(req: NextRequest, raw: string): boolean {
  const secret = process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET;
  const sent = req.headers.get('x-chippy-workspace-signature') ?? '';
  if (!secret || !sent) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!authorized(req, raw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = typeof body.run_id === 'string' ? body.run_id : '';
  const spaceId = typeof body.space_id === 'string' ? body.space_id : '';
  const launchToken = typeof body.launch_token === 'string' ? body.launch_token : '';
  const sequence = Number(body.sequence);
  const type = typeof body.type === 'string' ? body.type : '';
  if (!runId || !spaceId || !launchToken || !Number.isInteger(sequence) || sequence < 1 || !allowedTypes.has(type)) return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  const { data: run, error: runError } = await tenantTable(supabase, 'WorkspaceRun', { spaceId }).select('id,workSessionId,status,launchToken,cancellationRequestedAt').eq('id', runId).maybeSingle();
  if (runError) return NextResponse.json({ error: 'Could not verify launch' }, { status: 500 });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (run.launchToken !== launchToken) return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
  if (['completed','failed','cancelled'].includes(run.status)) return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: run.status === 'cancelled' || Boolean(run.cancellationRequestedAt) });
  if (type !== 'workspace_started' && run.status !== 'running') return NextResponse.json({ error: 'Workspace launch is not active', cancellationRequested: true }, { status: 409 });
  const event = { runId, sequence, type, message: String(body.message ?? '').slice(0, 500), command: typeof body.command === 'string' ? body.command.slice(0, 240) : null, output: typeof body.output === 'string' ? body.output.slice(0, MAX_OUTPUT) : null };
  const publicationFailed = async (message: string) => {
    const { data: failed, error: failError } = await supabase.rpc('finish_workspace_run_and_session', { p_run_id: runId, p_space_id: spaceId, p_launch_token: launchToken, p_outcome: 'failed', p_error: message, p_sequence: sequence, p_message: message });
    if (failError) return NextResponse.json({ error: 'Workspace terminal update failed.' }, { status: 500 });
    if (failed !== true) return NextResponse.json({ ok: true, ignored: 'stale_or_terminal', cancellationRequested: true });
    return NextResponse.json({ error: message }, { status: 409 });
  };
  const terminalType = type === 'completed' || type === 'failed' || type === 'cancelled';
  // The launch token check, event insert and first launching -> running change
  // are one database decision. A recovered stale VM therefore cannot win a
  // read/write race, and a duplicate start repairs the legacy split-write gap.
  if (!terminalType) {
    const { data: eventResult, error: eventError } = await supabase.rpc('record_workspace_run_event', {
      p_run_id: runId,
      p_space_id: spaceId,
      p_launch_token: launchToken,
      p_sequence: sequence,
      p_type: type,
      p_message: event.message,
      p_command: event.command,
      p_output: event.output,
    });
    if (eventError) return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
    if (eventResult === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (eventResult === 'stale_launch') return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
    if (eventResult === 'terminal') return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: true });
    if (eventResult === 'inactive') return NextResponse.json({ error: 'Workspace launch is not active', cancellationRequested: true }, { status: 409 });
    if (eventResult === 'duplicate_event') return NextResponse.json({ ok: true, ignored: 'duplicate_event', cancellationRequested: Boolean(run.cancellationRequestedAt) });
    if (eventResult !== 'recorded') return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }
  // The initial read can be stale while the VM is uploading files. Re-read
  // immediately before publication so a cancellation always wins completion.
  const currentResult = type === 'completed'
    ? await tenantTable(supabase, 'WorkspaceRun', { spaceId }).select('launchToken,cancellationRequestedAt').eq('id', runId).maybeSingle()
    : { data: run, error: null };
  if (currentResult.error) return NextResponse.json({ error: 'Could not verify publication state' }, { status: 500 });
  const current = currentResult.data;
  if (current?.launchToken !== launchToken) return NextResponse.json({ ok: true, ignored: 'stale_launch', cancellationRequested: true });
  const cancelledBeforePublish = Boolean(current?.cancellationRequestedAt);
  const publishedFiles: Array<{ id: string; storageKey: string; name: string; mimeType: string; sizeBytes: number }> = [];
  if (type === 'completed' && !cancelledBeforePublish) {
    const artifacts = validateParentWorkspaceCompletionManifest(body.files);
    if (!artifacts) return publicationFailed('Workspace manifest is incomplete.');
    const { data: space } = await supabase.from('Space').select('ownerId').eq('id', spaceId).maybeSingle();
    const { data: owner } = space?.ownerId ? await supabase.from('User').select('clerkId').eq('id', space.ownerId).maybeSingle() : { data: null };
    if (!owner?.clerkId) return publicationFailed('Workspace owner missing.');
    for (const artifact of artifacts) {
      const key = buildKey('files', spaceId, `workspace-${crypto.createHash('sha256').update(runId).digest('hex')}-${artifact.name}`);
      try { await uploadObject({ key, body: artifact.content, contentType: `${artifact.mimeType}; charset=utf-8`, isPublic: false }); } catch { return publicationFailed('Could not persist workspace object.'); }
      const fileId = crypto.createHash('sha256').update(`${runId}:${artifact.name}`).digest('hex').slice(0, 32);
      publishedFiles.push({ id: fileId, storageKey: key, name: artifact.name, mimeType: artifact.mimeType, sizeBytes: artifact.content.byteLength });
    }
  }
  const terminal = cancelledBeforePublish || run.cancellationRequestedAt ? 'cancelled' : type === 'completed' ? 'completed' : type === 'failed' ? 'failed' : type === 'cancelled' ? 'cancelled' : type === 'workspace_started' ? 'running' : null;
  if (terminal === 'completed' || terminal === 'failed' || terminal === 'cancelled') {
    const { data: finished, error: finishError } = await supabase.rpc('finish_workspace_run_and_session', { p_run_id: runId, p_space_id: spaceId, p_launch_token: launchToken, p_outcome: terminal, p_error: terminal === 'failed' ? event.message : null, p_sequence: sequence, p_message: event.message, p_files: terminal === 'completed' ? publishedFiles : [] });
    if (finishError) return NextResponse.json({ error: terminal === 'completed' ? 'Workspace publication could not finish.' : 'Workspace terminal update failed.' }, { status: 409 });
    if (finished !== true) return NextResponse.json({ ok: true, ignored: 'stale_or_terminal', cancellationRequested: true });
    return NextResponse.json({ ok: true, finished, cancellationRequested: terminal === 'cancelled' });
  }
  return NextResponse.json({ ok: true, cancellationRequested: Boolean(run.cancellationRequestedAt) });
}
