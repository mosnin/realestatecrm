import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { isWorkspaceRunFollowUpsEnabledForSpace } from '@/lib/chippi/workspace-run-flag';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { readBoundedResponseBytes } from '@/lib/chippi/bounded-response-bytes';
import {
  MAX_WORKBOOK_SOURCE_BYTES,
  stringifyWorkbook,
  workbookContentHash,
  workbookFromWorkspaceCsvBytes,
} from '@/lib/chippi/workbench-store';
import { validateStoredWorkbookContent } from '@/lib/chippi/workbench-format';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string; fileId: string }> };

type WorkspaceSource = ({
  sourceKind: 'root';
  taskId?: never;
} | {
  sourceKind: 'task';
  taskId: string;
}) & {
  membershipId: string;
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

function databaseFailure() {
  console.error('[POST workspace CSV Workbench] database query failed');
  return NextResponse.json({ error: 'Could not validate the workspace file.' }, { status: 500 });
}

/** Create an immutable, editable Workbench copy of one completed workspace CSV.
 * The URL identifies only a membership row. Filename, tenant, task, File id,
 * storage key, and source bytes are all resolved again on the server. */
export async function POST(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  if (!isWorkbenchEnabled() || !isWorkspaceRunFollowUpsEnabledForSpace(auth.space.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const rateLimit = await checkRateLimit(`workspace-workbench:open:${auth.userId}`, 20, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  try {
    await assertSpaceEnabled(auth.space.id);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { id: runId, fileId: membershipId } = await params;
  const sourceKind = req.nextUrl.searchParams.get('sourceKind');
  if (sourceKind !== 'root' && sourceKind !== 'task') {
    return NextResponse.json({ error: 'A valid workspace source kind is required.' }, { status: 400 });
  }
  const { data: run, error: runError } = await supabase
    .from('WorkspaceRun')
    .select('id,status')
    .eq('id', runId)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  if (runError) return databaseFailure();
  if (run?.status !== 'completed') {
    return NextResponse.json({ error: 'Workspace files are available after completion.' }, { status: 404 });
  }

  let source: WorkspaceSource | null = null;
  if (sourceKind === 'root') {
    const { data: rootMembership, error: rootError } = await supabase
      .from('WorkspaceRunFile')
      .select('id,fileId,name,mimeType,sizeBytes')
      .eq('id', membershipId)
      .eq('runId', runId)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (rootError) return databaseFailure();
    if (rootMembership?.fileId) {
      source = {
        sourceKind,
        membershipId: rootMembership.id,
        fileId: rootMembership.fileId,
        name: rootMembership.name,
        mimeType: rootMembership.mimeType,
        sizeBytes: rootMembership.sizeBytes,
      };
    }
  } else {
    const { data: taskMembership, error: taskMembershipError } = await supabase
      .from('WorkspaceRunTaskFile')
      .select('id,fileId,name,mimeType,sizeBytes,taskId')
      .eq('id', membershipId)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (taskMembershipError) return databaseFailure();
    const { data: task, error: taskError } = taskMembership?.fileId
      ? await supabase
          .from('WorkspaceRunTask')
          .select('id')
          .eq('id', taskMembership.taskId)
          .eq('runId', runId)
          .eq('spaceId', auth.space.id)
          .eq('status', 'completed')
          .maybeSingle()
      : { data: null, error: null };
    if (taskError) return databaseFailure();
    if (task?.id && taskMembership?.fileId) {
      source = {
        sourceKind,
        membershipId: taskMembership.id,
        taskId: task.id,
        fileId: taskMembership.fileId,
        name: taskMembership.name,
        mimeType: taskMembership.mimeType,
        sizeBytes: taskMembership.sizeBytes,
      };
    }
  }

  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    source.mimeType !== 'text/csv'
    || !/\.csv$/i.test(source.name)
    || !Number.isInteger(source.sizeBytes)
    || source.sizeBytes < 1
    || source.sizeBytes > MAX_WORKBOOK_SOURCE_BYTES
  ) {
    return NextResponse.json({ error: 'Only completed CSV workspace files within Workbench limits can be opened.' }, { status: 400 });
  }

  const { data: file, error: fileError } = await supabase
    .from('File')
    .select('id,name,mimeType,sizeBytes,storageKey')
    .eq('id', source.fileId)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  if (fileError) return databaseFailure();
  if (
    !file?.storageKey
    || file.id !== source.fileId
    || file.name !== source.name
    || file.mimeType !== source.mimeType
    || file.sizeBytes !== source.sizeBytes
  ) {
    return NextResponse.json({ error: 'Workspace file is unavailable.' }, { status: 404 });
  }

  let mappingQuery = supabase
    .from('WorkspaceWorkbookSource')
    .select('artifactId,sourceFileId')
    .eq('spaceId', auth.space.id)
    .eq('runId', runId);
  mappingQuery = source.sourceKind === 'root'
    ? mappingQuery.eq('workspaceRunFileId', source.membershipId)
    : mappingQuery.eq('workspaceRunTaskFileId', source.membershipId);
  const { data: existingMapping, error: mappingError } = await mappingQuery.maybeSingle();
  if (mappingError) return databaseFailure();
  if (existingMapping?.artifactId) {
    if (existingMapping.sourceFileId !== source.fileId) return databaseFailure();
    const { data: existingArtifact, error: artifactError } = await supabase
      .from('Artifact')
      .select('id,currentVersionId')
      .eq('id', existingMapping.artifactId)
      .eq('spaceId', auth.space.id)
      .eq('artifactType', 'workbook')
      .maybeSingle();
    if (artifactError) return databaseFailure();
    if (!existingArtifact?.currentVersionId) return databaseFailure();
    const { data: existingVersion, error: versionError } = await supabase
      .from('ArtifactVersion')
      .select('versionNumber')
      .eq('id', existingArtifact.currentVersionId)
      .eq('artifactId', existingArtifact.id)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (versionError || !existingVersion) return databaseFailure();
    return NextResponse.json({
      artifactId: existingArtifact.id,
      versionNumber: existingVersion.versionNumber,
      created: false,
    });
  }

  let bytes: Buffer;
  try {
    const response = await fetch(await getSignedDownloadUrl(file.storageKey, 300), {
      cache: 'no-store',
      signal: req.signal,
    });
    if (!response.ok) throw new Error(`download returned ${response.status}`);
    bytes = await readBoundedResponseBytes(response, {
      expectedBytes: source.sizeBytes,
      maxBytes: MAX_WORKBOOK_SOURCE_BYTES,
      signal: req.signal,
    });
  } catch {
    return NextResponse.json({ error: 'Could not download the workspace file. The source was not changed.' }, { status: 502 });
  }

  const sourceInput = {
    runId,
    membershipId: source.membershipId,
    fileId: source.fileId,
    filename: source.name,
    bytes,
  };
  const parsed = source.sourceKind === 'task'
    ? workbookFromWorkspaceCsvBytes({ ...sourceInput, sourceKind: 'task', taskId: source.taskId })
    : workbookFromWorkspaceCsvBytes({ ...sourceInput, sourceKind: 'root' });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const content = stringifyWorkbook(parsed.workbook);
  const contentValidation = validateStoredWorkbookContent(content);
  if (!contentValidation.workbook) {
    return NextResponse.json({ error: contentValidation.error ?? 'Workbook is too large to open safely.' }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase.rpc('create_workspace_workbook_artifact', {
    p_space_id: auth.space.id,
    p_run_id: runId,
    p_workspace_run_file_id: source.sourceKind === 'root' ? source.membershipId : null,
    p_workspace_run_task_file_id: source.sourceKind === 'task' ? source.membershipId : null,
    p_content: content,
    p_content_hash: workbookContentHash(content),
    p_metadata: {
      kind: 'chippi.workbook.v1',
      sourceKind: 'workspace_file',
      sourceMembershipKind: source.sourceKind,
      sourceRunId: runId,
      ...(source.sourceKind === 'task' ? { sourceTaskId: source.taskId } : {}),
      sourceMembershipId: source.membershipId,
      sourceFileId: source.fileId,
      sourceFilename: source.name,
      immutableSource: true,
    },
  });
  const row = Array.isArray(created) ? created[0] : created;
  if (createError) return databaseFailure();
  if (!row?.artifact_id) {
    return NextResponse.json({ error: 'Could not create the workbook artifact.' }, { status: 500 });
  }
  return NextResponse.json({
    artifactId: row.artifact_id,
    versionNumber: row.version_number ?? 1,
    created: row.created === true,
  });
}
