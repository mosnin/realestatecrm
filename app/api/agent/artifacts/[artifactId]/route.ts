import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { workbookContentHash } from '@/lib/chippi/workbench-store';
import { hasSameWorkbookSource, parseStoredWorkbook, validateStoredWorkbookContent, validateWorkbookVersionMetadata } from '@/lib/chippi/workbench-format';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { parseWorkbookTransformReceipt } from '@/lib/chippi/workbook-transform';
import { tenantTable } from '@/lib/tenant-db';

/** Never forward arbitrary ArtifactVersion.metadata to the browser. The only
 * transform metadata surfaced is the bounded, server-authored receipt. */
function versionWithSafeReceipt<T extends { metadata?: unknown; createdByAgent?: unknown }>(version: T): Omit<T, 'metadata'> & { transformReceipt?: NonNullable<ReturnType<typeof parseWorkbookTransformReceipt>> } {
  const { metadata, ...rest } = version;
  const receipt = version.createdByAgent === 'chippi_transform'
    ? parseWorkbookTransformReceipt(metadata)
    : null;
  return receipt ? { ...rest, transformReceipt: receipt } : rest;
}

// GET /api/agent/artifacts/[artifactId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:get:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { artifactId } = await params;

  // Resolve the caller's tenant before the lookup. A foreign id must be
  // indistinguishable from a missing one, including at the database query.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: artifact, error: artifactError } = await tenantTable(supabase, 'Artifact', { spaceId: space.id })
    .select('*')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[GET /api/agent/artifacts/[artifactId]]', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (artifact.artifactType === 'workbook' && !isWorkbenchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { await assertSpaceEnabled(artifact.spaceId); } catch { return NextResponse.json({ error: 'Space is disabled' }, { status: 403 }); }

  // The history endpoint deliberately returns no metadata or content. Current and
  // immutable source contents are fetched separately and a selected historic
  // version is loaded with ?version=N below.
  const requestedVersion = _req.nextUrl.searchParams.get('version');
  if (requestedVersion !== null) {
    const versionNumber = Number.parseInt(requestedVersion, 10);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    const { data: version, error: versionError } = await tenantTable(supabase, 'ArtifactVersion', { spaceId: space.id })
      .select('id, versionNumber, createdAt, createdByAgent, content, metadata')
      .eq('artifactId', artifactId).eq('versionNumber', versionNumber).maybeSingle();
    if (versionError) return NextResponse.json({ error: 'Failed to fetch artifact version' }, { status: 500 });
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    return NextResponse.json({ version: versionWithSafeReceipt(version) });
  }

  const { data: versions, error: versionsError } = await tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId })
    .select('id, versionNumber, createdAt, createdByAgent')
    .eq('artifactId', artifactId)
    .order('versionNumber', { ascending: false })
    .limit(21);

  if (versionsError) {
    console.error('[GET /api/agent/artifacts/[artifactId]] versions error:', versionsError);
    return NextResponse.json({ error: 'Failed to fetch artifact versions' }, { status: 500 });
  }

  const [{ data: source, error: sourceError }, { data: current, error: currentError }] = await Promise.all([
    tenantTable(supabase, 'ArtifactVersion', { spaceId: space.id }).select('id, versionNumber, createdAt, createdByAgent, content, metadata').eq('artifactId', artifactId).eq('versionNumber', 1).maybeSingle(),
    artifact.currentVersionId
      ? tenantTable(supabase, 'ArtifactVersion', { spaceId: space.id }).select('id, versionNumber, createdAt, createdByAgent, content, metadata').eq('id', artifact.currentVersionId).eq('artifactId', artifactId).maybeSingle()
      : tenantTable(supabase, 'ArtifactVersion', { spaceId: space.id }).select('id, versionNumber, createdAt, createdByAgent, content, metadata').eq('artifactId', artifactId).order('versionNumber', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sourceError || currentError || !source || !current) return NextResponse.json({ error: 'Failed to fetch workbook content' }, { status: 500 });
  const incomplete = (versions?.length ?? 0) > 20;
  const boundedVersions = [...(versions ?? [])].slice(0, 20).sort((a: { versionNumber: number }, b: { versionNumber: number }) => a.versionNumber - b.versionNumber);
  return NextResponse.json({ artifact: {
    ...artifact,
    versions: boundedVersions,
    sourceVersion: versionWithSafeReceipt(source),
    currentVersion: versionWithSafeReceipt(current),
    history: { limit: 20, incomplete },
  } });
}

// PATCH /api/agent/artifacts/[artifactId]
// Body: { content: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:artifacts:version:${userId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { artifactId } = await params;

  let body: { content?: string; metadata?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { content, metadata } = body;
  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  // Scope the lookup to the caller's current tenant. This is intentionally
  // before the id lookup so foreign ids cannot form an existence oracle.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: artifact, error: artifactError } = await tenantTable(supabase, 'Artifact', { spaceId: space.id })
    .select('*')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]]', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (artifact.artifactType === 'workbook' && !isWorkbenchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { await assertSpaceEnabled(artifact.spaceId); } catch { return NextResponse.json({ error: 'Space is disabled' }, { status: 403 }); }

  if (artifact.artifactType === 'workbook') {
    const validation = validateStoredWorkbookContent(content);
    if (!validation.workbook) return NextResponse.json({ error: validation.error ?? 'Invalid workbook content' }, { status: 400 });
    const metadataValidation = validateWorkbookVersionMetadata(metadata);
    if (!metadataValidation.metadata) return NextResponse.json({ error: metadataValidation.error ?? 'Invalid workbook metadata' }, { status: 400 });
    const { data: sourceVersion, error: sourceError } = await tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId })
      .select('content')
      .eq('artifactId', artifactId)
      .eq('versionNumber', 1)
      .maybeSingle();
    const sourceWorkbook = sourceVersion?.content ? parseStoredWorkbook(sourceVersion.content) : null;
    if (sourceError || !sourceWorkbook) return NextResponse.json({ error: 'Failed to validate workbook source' }, { status: 500 });
    if (!hasSameWorkbookSource(sourceWorkbook, validation.workbook)) {
      return NextResponse.json({ error: 'Workbook source provenance cannot be changed.' }, { status: 400 });
    }
    const { data: appended, error: appendError } = await supabase.rpc('append_workbook_artifact_version', {
      p_artifact_id: artifactId, p_space_id: artifact.spaceId, p_content: content, p_content_hash: workbookContentHash(content), p_metadata: metadataValidation.metadata,
    });
    const version = Array.isArray(appended) ? appended[0] : appended;
    if (appendError || !version?.version_id) return NextResponse.json({ error: 'Failed to create new version' }, { status: 500 });
    return NextResponse.json({ artifact: { ...artifact, currentVersionId: version.version_id, newVersion: { id: version.version_id, versionNumber: version.version_number, createdAt: version.created_at, createdByAgent: 'user' } } });
  }

  // Get max versionNumber for this artifact
  const { data: maxRow, error: maxError } = await tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId })
    .select('versionNumber')
    .eq('artifactId', artifactId)
    .order('versionNumber', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] maxVersion error:', maxError);
    return NextResponse.json({ error: 'Failed to determine version number' }, { status: 500 });
  }

  const nextVersionNumber = (maxRow?.versionNumber ?? 0) + 1;

  // Insert new ArtifactVersion
  const { data: newVersion, error: versionError } = await tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId })
    .insert({
      artifactId,
      spaceId: artifact.spaceId,
      content,
      contentHash: workbookContentHash(content),
      versionNumber: nextVersionNumber,
      metadata: metadata ?? {},
      createdByAgent: artifact.artifactType === 'workbook' ? 'user' : 'chippi',
    })
    .select()
    .single();

  if (versionError || !newVersion) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] insert version error:', versionError);
    return NextResponse.json({ error: 'Failed to create new version' }, { status: 500 });
  }

  // Update Artifact.currentVersionId and updatedAt
  const { data: updatedArtifact, error: updateError } = await tenantTable(supabase, 'Artifact', { spaceId: artifact.spaceId })
    .update({ currentVersionId: newVersion.id, updatedAt: new Date().toISOString() })
    .eq('id', artifactId)
    .select()
    .single();

  if (updateError || !updatedArtifact) {
    await tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId }).delete().eq('id', newVersion.id);
    console.error('[PATCH /api/agent/artifacts/[artifactId]] update artifact error:', updateError);
    return NextResponse.json({ error: 'Failed to update artifact' }, { status: 500 });
  }

  return NextResponse.json({ artifact: { ...updatedArtifact, newVersion } });
}
