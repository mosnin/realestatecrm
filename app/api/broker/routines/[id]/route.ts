/**
 * PATCH  /api/broker/routines/[id] — edit instruction / cadence / hour / enabled.
 * DELETE /api/broker/routines/[id] — remove a routine.
 * POST   /api/broker/routines/[id] — run it now, once, immediately.
 *
 * Broker-admin only. Every query is scoped by brokerageId as well as id, so a
 * routine that isn't the caller's brokerage simply doesn't match — ownership
 * check and 404 in one.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fireBrokerRoutineRun } from '@/lib/broker-routines';
import {
  ROUTINE_CADENCES,
  ROUTINE_WEEKDAYS,
  ROUTINE_MAX_DAY_OF_MONTH,
  type RoutineWeekday,
} from '@/lib/routines';

export const runtime = 'nodejs';
// Match the space-routine "Run now" budget: broker dispatch shares the
// in-process fallback path, which blocks until the run finishes (~120s budget).
export const maxDuration = 300;

const SELECT =
  'id, instruction, cadence, hour, dayOfMonth, daysOfWeek, enabled, lastRunAt, lastRunStatus, nextRunAt, createdAt';

const MAX_INSTRUCTION = 600;
const MIN_INSTRUCTION = 10;

function isCadence(v: unknown): v is (typeof ROUTINE_CADENCES)[number] {
  return typeof v === 'string' && (ROUTINE_CADENCES as readonly string[]).includes(v);
}

function isWeekday(v: unknown): v is RoutineWeekday {
  return typeof v === 'string' && (ROUTINE_WEEKDAYS as readonly string[]).includes(v);
}

function sanitiseDaysOfWeek(v: unknown): RoutineWeekday[] | null {
  if (!Array.isArray(v)) return null;
  const set = new Set<RoutineWeekday>();
  for (const d of v) if (isWeekday(d)) set.add(d);
  if (set.size === 0) return null;
  return ROUTINE_WEEKDAYS.filter((d) => set.has(d));
}

function sanitiseDayOfMonth(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  const n = Math.floor(v);
  if (n < 1 || n > ROUTINE_MAX_DAY_OF_MONTH) return null;
  return n;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getBrokerContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof body.instruction === 'string') {
    const trimmed = body.instruction.trim();
    if (trimmed.length < MIN_INSTRUCTION) {
      return NextResponse.json(
        { error: 'Write a full sentence — what should Chippi do?' },
        { status: 400 },
      );
    }
    patch.instruction = trimmed.slice(0, MAX_INSTRUCTION);
  }
  if (isCadence(body.cadence)) patch.cadence = body.cadence;
  if (typeof body.hour === 'number') {
    const hour = Math.floor(body.hour);
    if (hour >= 0 && hour <= 23) patch.hour = hour;
  }
  // dayOfMonth and daysOfWeek are cadence-specific. When the caller picks a
  // new cadence in the same PATCH, blank out the OTHER cadence's field — a
  // routine that flips weekdays → monthly shouldn't keep a stale daysOfWeek
  // sitting in the row for the trigger to ignore.
  const nextCadence = isCadence(body.cadence) ? body.cadence : undefined;
  if ('dayOfMonth' in body) {
    const d = sanitiseDayOfMonth(body.dayOfMonth);
    if (d !== null) patch.dayOfMonth = d;
  }
  if ('daysOfWeek' in body) {
    const days = sanitiseDaysOfWeek(body.daysOfWeek);
    if (days) patch.daysOfWeek = days;
  }
  if (nextCadence === 'monthly') patch.daysOfWeek = null;
  if (nextCadence === 'custom') patch.dayOfMonth = null;
  if (nextCadence && nextCadence !== 'monthly' && nextCadence !== 'custom') {
    patch.dayOfMonth = null;
    patch.daysOfWeek = null;
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  // updatedAt + nextRunAt are recomputed by the table trigger.
  const { data, error } = await supabase
    .from('BrokerRoutine')
    .update(patch)
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id)
    .select(SELECT)
    .maybeSingle();

  if (error) {
    logger.error('[broker-routines] update failed', { brokerageId: ctx.brokerage.id, id }, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getBrokerContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('BrokerRoutine')
    .delete()
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id);

  if (error) {
    logger.error('[broker-routines] delete failed', { brokerageId: ctx.brokerage.id, id }, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getBrokerContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: routine } = await supabase
    .from('BrokerRoutine')
    .select('id, instruction')
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();
  if (!routine) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optimistically stamp the run so the UI updates instantly. after() corrects
  // the status to 'error' if the dispatch never landed. The Modal endpoint
  // doesn't return until the run finishes, so we don't block the response on it.
  await supabase
    .from('BrokerRoutine')
    .update({ lastRunAt: new Date().toISOString(), lastRunStatus: 'ok' })
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id);

  after(async () => {
    const status = await fireBrokerRoutineRun(ctx.brokerage.id, routine.instruction);
    if (status === 'error') {
      await supabase
        .from('BrokerRoutine')
        .update({ lastRunStatus: 'error' })
        .eq('id', id)
        .eq('brokerageId', ctx.brokerage.id);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
