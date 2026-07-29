import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildKey, uploadObject } from '@/lib/storage';

export const runtime = 'nodejs';
const MAX_OUTPUT = 6_000;
const MAX_FILE_BYTES = 32_000;
const allowedTypes = new Set(['workspace_started','command_started','command_finished','file_created','completed','failed','cancelled']);
const EXPECTED_FILES = ['brief.md', 'launch-checklist.md', 'comps.csv', 'handoff.md'] as const;

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
  const sequence = Number(body.sequence);
  const type = typeof body.type === 'string' ? body.type : '';
  if (!runId || !spaceId || !Number.isInteger(sequence) || sequence < 1 || !allowedTypes.has(type)) return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  const { data: run } = await supabase.from('WorkspaceRun').select('id,workSessionId,status,cancellationRequestedAt').eq('id', runId).eq('spaceId', spaceId).maybeSingle();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (['completed','failed','cancelled'].includes(run.status)) return NextResponse.json({ ok: true, ignored: 'terminal', cancellationRequested: run.status === 'cancelled' || Boolean(run.cancellationRequestedAt) });
  const event = { runId, sequence, type, message: String(body.message ?? '').slice(0, 500), command: typeof body.command === 'string' ? body.command.slice(0, 240) : null, output: typeof body.output === 'string' ? body.output.slice(0, MAX_OUTPUT) : null };
  const publicationFailed = async (message: string) => {
    await supabase.rpc('finish_workspace_run_and_session', { p_run_id: runId, p_space_id: spaceId, p_outcome: 'failed', p_error: message, p_sequence: sequence, p_message: message });
    return NextResponse.json({ error: message }, { status: 409 });
  };
  const terminalType = type === 'completed' || type === 'failed' || type === 'cancelled';
  // Intermediate events are insert-returning idempotency gates. A replay must
  // return before it can change lifecycle state or repeat any side effect.
  if (!terminalType) {
    const { data: inserted, error: eventError } = await supabase.from('WorkspaceRunEvent').insert(event).select('id').maybeSingle();
    if (eventError?.code === '23505') return NextResponse.json({ ok: true, ignored: 'duplicate_event' });
    if (eventError || !inserted) return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }
  // The initial read can be stale while the VM is uploading files. Re-read
  // immediately before publication so a cancellation always wins completion.
  const { data: current } = type === 'completed'
    ? await supabase.from('WorkspaceRun').select('cancellationRequestedAt').eq('id', runId).eq('spaceId', spaceId).maybeSingle()
    : { data: run };
  const cancelledBeforePublish = Boolean(current?.cancellationRequestedAt);
  const publishedFiles: Array<{ id: string; storageKey: string; name: string; mimeType: string; sizeBytes: number }> = [];
  if (type === 'completed' && !cancelledBeforePublish) {
    const rawFiles = Array.isArray(body.files) ? body.files : [];
    const names = rawFiles.map((file: any) => file?.name).sort();
    if (JSON.stringify(names) !== JSON.stringify([...EXPECTED_FILES].sort())) return publicationFailed('Workspace manifest is incomplete.');
    const { data: space } = await supabase.from('Space').select('ownerId').eq('id', spaceId).maybeSingle();
    const { data: owner } = space?.ownerId ? await supabase.from('User').select('clerkId').eq('id', space.ownerId).maybeSingle() : { data: null };
    if (!owner?.clerkId) return publicationFailed('Workspace owner missing.');
    for (const rawFile of rawFiles) {
      if (!rawFile || typeof rawFile.name !== 'string' || typeof rawFile.content !== 'string') return publicationFailed('Invalid workspace file.');
      const name = rawFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
      const content = Buffer.from(rawFile.content, 'base64');
      if (!EXPECTED_FILES.includes(name as typeof EXPECTED_FILES[number]) || !name || content.byteLength > MAX_FILE_BYTES) return publicationFailed('Invalid workspace file.');
      const key = buildKey('files', spaceId, `workspace-${crypto.createHash('sha256').update(runId).digest('hex')}-${name}`);
      try { await uploadObject({ key, body: content, contentType: 'text/plain; charset=utf-8', isPublic: false }); } catch { return publicationFailed('Could not persist workspace object.'); }
      const fileId = crypto.createHash('sha256').update(`${runId}:${name}`).digest('hex').slice(0, 32);
      publishedFiles.push({ id: fileId, storageKey: key, name, mimeType: 'text/plain', sizeBytes: content.byteLength });
    }
  }
  const terminal = cancelledBeforePublish || run.cancellationRequestedAt ? 'cancelled' : type === 'completed' ? 'completed' : type === 'failed' ? 'failed' : type === 'cancelled' ? 'cancelled' : type === 'workspace_started' ? 'running' : null;
  if (terminal === 'completed' || terminal === 'failed' || terminal === 'cancelled') {
    const { data: finished, error: finishError } = await supabase.rpc('finish_workspace_run_and_session', { p_run_id: runId, p_space_id: spaceId, p_outcome: terminal, p_error: terminal === 'failed' ? event.message : null, p_sequence: sequence, p_message: event.message, p_files: terminal === 'completed' ? publishedFiles : [] });
    if (finishError) return NextResponse.json({ error: terminal === 'completed' ? 'Workspace publication could not finish.' : 'Workspace terminal update failed.' }, { status: 409 });
    return NextResponse.json({ ok: true, finished, cancellationRequested: terminal === 'cancelled' });
  }
  if (terminal === 'running') await supabase.from('WorkspaceRun').update({ status: 'running', updatedAt: new Date().toISOString() }).eq('id', runId).eq('spaceId', spaceId).eq('status', 'launching');
  return NextResponse.json({ ok: true, cancellationRequested: Boolean(run.cancellationRequestedAt) });
}
