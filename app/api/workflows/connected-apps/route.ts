/**
 * GET /api/workflows/connected-apps
 *
 * Returns the realtor's active IntegrationConnections so the workflow
 * builder can offer a "pick your app" dropdown instead of a free-text
 * toolkit slug field. Also includes curated actions per toolkit so the
 * action picker has concrete options to choose from.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { CURATED_ACTIONS } from '@/lib/integrations/action-catalog';

export const runtime = 'nodejs';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { data: rows, error } = await supabase
      .from('IntegrationConnection')
      .select('id, toolkit, label, status')
      .eq('spaceId', space.id)
      .eq('status', 'active')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    // Deduplicate by toolkit — a toolkit connected twice only needs one entry
    // in the picker (the workflow keys on toolkit, not connection id).
    const seen = new Set<string>();
    const apps: { toolkit: string; label: string; actions: { value: string; label: string }[] }[] =
      [];

    for (const row of rows ?? []) {
      if (seen.has(row.toolkit)) continue;
      seen.add(row.toolkit);
      apps.push({
        toolkit: row.toolkit,
        label: row.label ?? titleCase(row.toolkit),
        actions: CURATED_ACTIONS[row.toolkit] ?? [],
      });
    }

    return NextResponse.json({ apps });
  } catch (error) {
    logger.error('[workflows] connected-apps failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}

function titleCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
