import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { workbookContentHash } from '@/lib/chippi/workbench-store';
import { validateStoredWorkbookContent, validateWorkbookVersionMetadata } from '@/lib/chippi/workbench-format';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';

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

  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .select('*')
    .eq('id', artifactId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (artifactError) {
    console.error('[GET /api/agent/artifacts/[artifactId]]', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (artifact.artifactType === 'workbook' && !isWorkbenchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { await assertSpaceEnabled(artifact.spaceId); } catch { return NextResponse.json({ error: 'Space is disabled' }, { status: 403 }); }

  // The history endpoint deliberately returns metadata only. Current and
  // immutable source contents are fetched separately and a selected historic
  // version is loaded with ?version=N below.
  const requestedVersion = _req.nextUrl.searchParams.get('version');
  if (requestedVersion !== null) {
    const versionNumber = Number.parseInt(requestedVersion, 10);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    const { data: version, error: versionError } = await supabase
      .from('ArtifactVersion').select('id, versionNumber, createdAt, createdByAgent, content')
      .eq('artifactId', artifactId).eq('spaceId', space.id).eq('versionNumber', versionNumber).maybeSingle();
    if (versionError) return NextResponse.json({ error: 'Failed to fetch artifact version' }, { status: 500 });
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    return NextResponse.json({ version });
  }

  const { data: versions, error: versionsError } = await supabase
    .from('ArtifactVersion')
    .select('id, versionNumber, createdAt, createdByAgent')
    .eq('artifactId', artifactId)
    .eq('spaceId', artifact.spaceId)
    .order('versionNumber', { ascending: false })
    .limit(21);

  if (versionsError) {
    console.error('[GET /api/agent/artifacts/[artifactId]] versions error:', versionsError);
    return NextResponse.json({ error: 'Failed to fetch artifact versions' }, { status: 500 });
  }

  const [{ data: source, error: sourceError }, { data: current, error: currentError }] = await Promise.all([
    supabase.from('ArtifactVersion').select('id, versionNumber, createdAt, createdByAgent, content').eq('artifactId', artifactId).eq('spaceId', space.id).eq('versionNumber', 1).maybeSingle(),
    artifact.currentVersionId
      ? supabase.from('ArtifactVersion').select('id, versionNumber, createdAt, createdByAgent, content').eq('id', artifact.currentVersionId).eq('artifactId', artifactId).eq('spaceId', space.id).maybeSingle()
      : supabase.from('ArtifactVersion').select('id, versionNumber, createdAt, createdByAgent, content').eq('artifactId', artifactId).eq('spaceId', space.id).order('versionNumber', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sourceError || currentError || !source || !current) return NextResponse.json({ error: 'Failed to fetch workbook content' }, { status: 500 });
  const incomplete = (versions?.length ?? 0) > 20;
  const boundedVersions = [...(versions ?? [])].slice(0, 20).sort((a: { versionNumber: number }, b: { versionNumber: number }) => a.versionNumber - b.versionNumber);
  return NextResponse.json({ artifact: { ...artifact, versions: boundedVersions, sourceVersion: source, currentVersion: current, history: { limit: 20, incomplete } } });
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
  const { data: artifact, error: artifactError } = await supabase
    .from('Artifact')
    .select('*')
    .eq('id', artifactId)
    .eq('spaceId', space.id)
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
    const { data: appended, error: appendError } = await supabase.rpc('append_workbook_artifact_version', {
      p_artifact_id: artifactId, p_space_id: artifact.spaceId, p_content: content, p_content_hash: workbookContentHash(content), p_metadata: metadataValidation.metadata,
    });
    const version = Array.isArray(appended) ? appended[0] : appended;
    if (appendError || !version?.version_id) return NextResponse.json({ error: 'Failed to create new version' }, { status: 500 });
    return NextResponse.json({ artifact: { ...artifact, currentVersionId: version.version_id, newVersion: { id: version.version_id, versionNumber: version.version_number, createdAt: version.created_at, createdByAgent: 'user' } } });
  }

  // Get max versionNumber for this artifact
  const { data: maxRow, error: maxError } = await supabase
    .from('ArtifactVersion')
    .select('versionNumber')
    .eq('artifactId', artifactId)
    .eq('spaceId', artifact.spaceId)
    .order('versionNumber', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) {
    console.error('[PATCH /api/agent/artifacts/[artifactId]] maxVersion error:', maxError);
    return NextResponse.json({ error: 'Failed to determine version number' }, { status: 500 });
  }

  const nextVersionNumber = (maxRow?.versionNumber ?? 0) + 1;

  // Insert new ArtifactVersion
  const { data: newVersion, error: versionError } = await supabase
    .from('ArtifactVersion')
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
  const { data: updatedArtifact, error: updateError } = await supabase
    .from('Artifact')
    .update({ currentVersionId: newVersion.id, updatedAt: new Date().toISOString() })
    .eq('id', artifactId)
    .eq('spaceId', artifact.spaceId)
    .select()
    .single();

  if (updateError || !updatedArtifact) {
    await supabase.from('ArtifactVersion').delete().eq('id', newVersion.id).eq('spaceId', artifact.spaceId);
    console.error('[PATCH /api/agent/artifacts/[artifactId]] update artifact error:', updateError);
    return NextResponse.json({ error: 'Failed to update artifact' }, { status: 500 });
  }

  return NextResponse.json({ artifact: { ...updatedArtifact, newVersion } });
}
