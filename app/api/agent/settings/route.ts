import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { isValidChatModel } from '@/lib/chat-models';

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await tenantTable(supabase, 'AgentSettings', { spaceId: space.id })
    .select('spaceId, enabled, dailyTokenBudget, chatModel, autonomyLevel')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not load automation settings' }, { status: 503 });

  // Default if no row yet (shouldn't happen since we have an auto-seed
  // trigger, but defensive: never make the UI block on a missing row).
  if (!data) {
    return NextResponse.json({
      spaceId: space.id,
      enabled: false,
      autonomyLevel: 'draft_required',
      dailyTokenBudget: 50_000,
      chatModel: null,
    });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    patch.enabled = body.enabled;
  }
  if (body.autonomyLevel !== undefined) {
    if (typeof body.autonomyLevel !== 'string' || !['suggest_only', 'draft_required', 'autonomous'].includes(body.autonomyLevel)) {
      return NextResponse.json({ error: 'Choose a valid follow-up sending policy' }, { status: 400 });
    }
    patch.autonomyLevel = body.autonomyLevel;
  }
  if (body.dailyTokenBudget !== undefined) {
    const budget = body.dailyTokenBudget;
    if (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1000 || budget > 500_000) {
      return NextResponse.json(
        { error: 'dailyTokenBudget must be between 1,000 and 500,000' },
        { status: 400 },
      );
    }
    patch.dailyTokenBudget = budget;
  }
  if (body.chatModel !== undefined) {
    // null clears the override — the workspace falls back to the app default.
    if (body.chatModel !== null && !isValidChatModel(body.chatModel)) {
      return NextResponse.json(
        { error: 'chatModel must be a supported model.' },
        { status: 400 },
      );
    }
    patch.chatModel = body.chatModel;
  }

  // Upsert — creates the row on first save (defensive; the auto-seed
  // trigger should have already inserted it).
  const { data, error } = await tenantTable(supabase, 'AgentSettings', { spaceId: space.id })
    .upsert({ spaceId: space.id, ...patch }, { onConflict: 'spaceId' })
    .select('spaceId, enabled, dailyTokenBudget, chatModel, autonomyLevel')
    .single();

  if (error) throw error;

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'AgentSettings',
    resourceId: space.id,
    spaceId: space.id,
    metadata: patch,
  });

  return NextResponse.json(data);
}
