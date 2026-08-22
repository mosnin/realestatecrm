import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';
import { parseStoredWorkbook, workbookToXlsxBytes } from '@/lib/chippi/workbench-store';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';

// MIME type + file extension for each artifact type
function getMimeAndExt(artifactType: string): { mime: string; ext: string } {
  switch (artifactType) {
    case 'draft_email':
    case 'draft_sms':
    case 'raw_output':
    case 'contact_update':
    case 'deal_update':
    case 'tour_booking':
    case 'goal_plan':
      return { mime: 'text/plain', ext: 'txt' };
    case 'report':
      return { mime: 'text/markdown', ext: 'md' };
    case 'workbook':
      return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    default:
      return { mime: 'application/octet-stream', ext: 'bin' };
  }
}

// GET /api/agent/artifacts/[artifactId]/download?version=N
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { artifactId } = await params;
  const versionParam = req.nextUrl.searchParams.get('version');

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Scope the id lookup to the caller's tenant so a foreign id is never
  // resolved before authorization.
  const { data: artifact, error: artifactError } = await tenantTable(supabase, 'Artifact', { spaceId: space.id })
    .select('id, title, artifactType, spaceId, currentVersionId')
    .eq('id', artifactId)
    .maybeSingle();

  if (artifactError) {
    console.error('[GET /api/agent/artifacts/[artifactId]/download] artifact fetch:', artifactError);
    return NextResponse.json({ error: 'Failed to fetch artifact' }, { status: 500 });
  }
  // Return 404 regardless of whether artifact doesn't exist or belongs to another tenant —
  // avoids confirming artifact existence to cross-tenant callers.
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (artifact.artifactType === 'workbook' && !isWorkbenchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { await assertSpaceEnabled(artifact.spaceId); } catch { return NextResponse.json({ error: 'Space is disabled' }, { status: 403 }); }

  // 3. Fetch the target ArtifactVersion
  let versionQuery = tenantTable(supabase, 'ArtifactVersion', { spaceId: artifact.spaceId })
    .select('id, versionNumber, content')
    .eq('artifactId', artifactId);

  if (versionParam !== null) {
    const versionNumber = parseInt(versionParam, 10);
    if (isNaN(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }
    versionQuery = versionQuery.eq('versionNumber', versionNumber);
  } else if (artifact.currentVersionId) {
    versionQuery = versionQuery.eq('id', artifact.currentVersionId);
  } else {
    // No currentVersionId set — fall back to highest version
    versionQuery = versionQuery.order('versionNumber', { ascending: false }).limit(1);
  }

  const { data: version, error: versionError } = await versionQuery.maybeSingle();

  if (versionError) {
    console.error('[GET /api/agent/artifacts/[artifactId]/download] version fetch:', versionError);
    return NextResponse.json({ error: 'Failed to fetch artifact version' }, { status: 500 });
  }
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  // 4. Build response with correct MIME type and Content-Disposition
  const { mime, ext } = getMimeAndExt(artifact.artifactType ?? '');
  const safeTitle = (artifact.title ?? 'artifact').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const filename = `${safeTitle}-v${version.versionNumber}.${ext}`;

  let body: string | Buffer = version.content;
  if (artifact.artifactType === 'workbook') {
    const workbookData = parseStoredWorkbook(version.content);
    if (!workbookData) return NextResponse.json({ error: 'Workbook content is invalid' }, { status: 500 });
    try {
      body = await workbookToXlsxBytes(workbookData);
    } catch {
      return NextResponse.json({ error: 'Workbook export is temporarily unavailable' }, { status: 503 });
    }
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
