/**
 * POST /api/admin/triggers/backfill
 *
 * Idempotent one-shot: registers curated Composio triggers for every
 * existing active IntegrationConnection that doesn't already have them.
 *
 * Why this exists: the OAuth callback registers triggers at connect-
 * time, but realtors who connected BEFORE the triggers feature shipped
 * have active connections with zero IntegrationTrigger rows. Without
 * this, their Chippi never notices anything until they reconnect.
 *
 * Auth: Bearer ${CRON_SECRET}. Same gate as our scheduled cron routes —
 * the secret is server-only, so this is operator-callable, not user-
 * facing. (If we ever want to expose it to brokers as a manual "rewire
 * my Chippi" button, that's a separate route with Clerk auth.)
 *
 * Idempotent by design: skips connections that already have any
 * IntegrationTrigger row. A second invocation does nothing useful. If
 * we extend CURATED_TRIGGERS later, the "already has any row" check is
 * deliberately coarse — we accept that backfill won't re-register a
 * newly-added slug for connections that already saw a prior backfill.
 * Re-running with `?force=1` does the per-slug check instead, suitable
 * for after-an-expansion runs (rarer + opt-in).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  CURATED_TRIGGERS,
  listTriggersForConnection,
  registerForConnection,
} from '@/lib/integrations/triggers';
import { logger } from '@/lib/logger';
import type { IntegrationConnectionRow } from '@/lib/integrations/connections';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get('force') === '1';

  // Only ACTIVE connections — expired/revoked rows mean the realtor
  // can't be helped until they reconnect, so registering triggers for
  // them would just stack failed rows.
  const { data: rows, error } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('status', 'active');
  if (error) {
    return NextResponse.json({ error: 'DB query failed', detail: error.message }, { status: 500 });
  }

  const connections = (rows ?? []) as IntegrationConnectionRow[];
  let scanned = 0;
  let registered = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ connectionId: string; toolkit: string; error: string }> = [];

  for (const conn of connections) {
    scanned++;
    const curatedSlugs = CURATED_TRIGGERS[conn.toolkit] ?? [];
    if (curatedSlugs.length === 0) {
      skipped++;
      continue;
    }

    if (!force) {
      // Coarse idempotency — any existing row means we've registered
      // for this connection already.
      const existing = await listTriggersForConnection(conn.id);
      if (existing.length > 0) {
        skipped++;
        continue;
      }
    }

    try {
      const result = await registerForConnection({ connection: conn });
      registered += result.registered;
      failed += result.failed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ connectionId: conn.id, toolkit: conn.toolkit, error: message });
      failed += curatedSlugs.length;
      logger.error('[triggers.backfill] connection failed', {
        connectionId: conn.id,
        toolkit: conn.toolkit,
        err: message,
      });
    }
  }

  const summary = { scanned, registered, failed, skipped, errors };
  logger.info('[triggers.backfill] complete', summary);
  return NextResponse.json(summary);
}
