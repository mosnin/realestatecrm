/**
 * GET /api/browser-control/actions — a compact, tenant-scoped history for
 * the Research Workspace. It returns action outcomes only: never input
 * params (which can contain typed text), DOM snapshots, screenshots, or a
 * browser-control token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import { BrowserActionResult, isBrowserActionType } from '@/lib/browser-control/protocol';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';

const LIMIT = 24;

function compactText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const [space, dbUser] = await Promise.all([
    getSpaceForUser(authResult.userId),
    getCurrentDbUser(),
  ]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!isResearchWorkspaceEnabledForSpace(space.id)) {
    return NextResponse.json({ error: 'Research Workspace unavailable' }, { status: 404 });
  }

  // The panel refreshes on a calm 4-second cadence (15/min); allow room for
  // tab remounts without making this an unbounded history export endpoint.
  const { allowed } = await checkRateLimit(`browser-control:actions:${dbUser.id}`, 45, 60);
  if (!allowed) return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });

  const { data: sessions, error: sessionError } = await supabase
    .from('BrowserSession')
    .select('id, source')
    .eq('spaceId', space.id)
    .eq('userId', dbUser.id)
    .order('startedAt', { ascending: false })
    .limit(50);
  if (sessionError) return NextResponse.json({ error: 'Failed to load browser sessions' }, { status: 500 });

  // The Research Workspace is deliberately cloud-research-only. Do not mix
  // a realtor's paired, logged-in extension actions into this timeline.
  const sessionRows = ((sessions ?? []) as Array<{ id: string; source?: string | null }>)
    .filter((session) => session.source === 'headless');
  const sourceBySession = new Map(sessionRows.map((session) => [session.id, session.source]));
  if (sourceBySession.size === 0) return NextResponse.json({ actions: [] });

  const { data, error } = await supabase
    .from('BrowserAction')
    .select('id, sessionId, type, status, result, createdAt, completedAt')
    .eq('spaceId', space.id)
    .in('sessionId', [...sourceBySession.keys()])
    .order('createdAt', { ascending: false })
    .limit(LIMIT);
  if (error) return NextResponse.json({ error: 'Failed to load browser actions' }, { status: 500 });

  const actions = (data ?? []).flatMap((raw) => {
    const row = raw as {
      id: string;
      sessionId: string;
      type: string;
      status: 'queued' | 'running' | 'done' | 'error' | 'expired';
      result: unknown;
      createdAt: string;
      completedAt: string | null;
    };
    if (!isBrowserActionType(row.type) || !sourceBySession.has(row.sessionId)) return [];
    const parsed = BrowserActionResult.safeParse(row.result);
    const result = parsed.success ? parsed.data : null;
    const ok = row.status === 'done' && result?.ok !== false;
    const summary = compactText(
      result?.summary || result?.error || (row.status === 'queued' ? `${row.type} queued` : row.status === 'running' ? `${row.type} in progress` : ok ? `${row.type} completed` : `${row.type} did not complete`),
    );
    return [{
      id: row.id,
      type: row.type,
      summary,
      timestamp: row.completedAt || row.createdAt,
      ok,
      status: row.status,
      source: sourceBySession.get(row.sessionId) || undefined,
      pageUrl: result?.pageUrl,
      pageTitle: result?.pageTitle,
    }];
  });

  return NextResponse.json({ actions });
}
