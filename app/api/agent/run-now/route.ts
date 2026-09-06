import { after, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { recordDispatch, markInFlight, markFailed } from '@/lib/agent/run-ledger';

export async function POST() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rate limit: max 5 runs per space per minute. Routed through the shared
  // helper so it fails CLOSED to an in-memory counter when KV is unconfigured,
  // rather than skipping the limit entirely.
  const { allowed } = await checkRateLimit(`agent:runnow-rate:${space.id}`, 5, 60);
  if (!allowed) {
    return NextResponse.json(
      { triggered: false, reason: 'Rate limit exceeded — try again in a minute' },
      { status: 429 }
    );
  }

  const { data: settings, error: settingsError } = await tenantTable(supabase, 'AgentSettings', { spaceId: space.id })
    .select('enabled').maybeSingle();
  if (settingsError) return NextResponse.json({ triggered: false, reason: 'Settings unavailable' }, { status: 503 });
  if (!settings?.enabled) return NextResponse.json({ triggered: false, reason: 'Background review is paused' }, { status: 409 });

  const modalUrl = process.env.MODAL_WEBHOOK_URL;
  const secret = process.env.AGENT_INTERNAL_SECRET;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // Always queue the trigger to Redis first when Redis is available — that is
  // the DURABLE record. The old code only queued when Modal was unconfigured,
  // so a Modal outage (the fire-and-forget fetch rejects asynchronously and is
  // never caught) dropped the run entirely while still reporting success.
  let queued = false;
  if (kvUrl && kvToken) {
    const trigger = JSON.stringify({
      event: 'run_now', // bare wake signal — the agent run falls through to a sweep
      spaceId: space.id,
      queuedAt: new Date().toISOString(),
      source: 'run_now',
    });
    const key = `agent:triggers:${space.id}`;
    try {
      const pushRes = await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([trigger]),
      });
      queued = pushRes.ok;
    } catch (err) {
      console.error('[agent/run-now] Redis enqueue failed', err);
    }
  }

  async function dispatch() {
    const runId = await recordDispatch(space!.id, 'run_now');
    try {
      const res = await fetch(modalUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ space_id: space!.id, secret, user_id: userId, run_id: runId }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        await markInFlight(runId);
        return 'accepted' as const;
      }
      await markFailed(runId, `Executor returned HTTP ${res.status}; check activity before retrying.`);
      return 'rejected' as const;
    } catch {
      // A lost acknowledgement does not prove the run never started. Keep the
      // dispatch unresolved and never retry this request automatically.
      return 'unknown' as const;
    }
  }

  if (queued) {
    if (modalUrl && secret) after(async () => { await dispatch(); });
    return NextResponse.json({ triggered: true, method: 'queued', note: 'Request queued. Check Activity for the completed work.' }, { status: 202 });
  }
  if (modalUrl && secret) {
    const outcome = await dispatch();
    if (outcome === 'accepted') return NextResponse.json({ triggered: true, method: 'modal', note: 'Run request accepted. Check Activity for the result.' }, { status: 202 });
    if (outcome === 'unknown') return NextResponse.json({ triggered: false, method: 'unknown', note: 'Start could not be confirmed. Check Activity before trying again.' }, { status: 202 });
    return NextResponse.json({ triggered: false, note: 'The background service could not accept this run. Check Activity before trying again.' }, { status: 503 });
  }
  return NextResponse.json({ triggered: false, note: 'Background review is unavailable. Your saved automations have separate schedules.' }, { status: 503 });
}
