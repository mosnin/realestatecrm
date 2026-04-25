import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await supabase
    .from('AgentSettings')
    .select('*')
    .eq('spaceId', space.id)
    .maybeSingle();

  // Return defaults if no settings row exists yet
  if (!data) {
    return NextResponse.json({
      spaceId: space.id,
      enabled: false,
      autonomyLevel: 'suggest_only',
      dailyTokenBudget: 50000,
      heartbeatIntervalMinutes: 15,
      enabledAgents: ['lead_nurture'],
      perAgentAutonomy: {},
      confidenceThreshold: 0,
    });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  const validAutonomy = ['autonomous', 'draft_required', 'suggest_only'];
  const validAgents = ['lead_nurture', 'deal_sentinel', 'long_term_nurture', 'lead_scorer', 'tour_followup'];

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.enabled !== undefined) {
    patch.enabled = Boolean(body.enabled);
  }
  if (body.autonomyLevel !== undefined) {
    if (!validAutonomy.includes(body.autonomyLevel)) {
      return NextResponse.json({ error: 'Invalid autonomyLevel' }, { status: 400 });
    }
    patch.autonomyLevel = body.autonomyLevel;
  }
  if (body.dailyTokenBudget !== undefined) {
    const budget = parseInt(body.dailyTokenBudget);
    if (isNaN(budget) || budget < 1000 || budget > 500_000) {
      return NextResponse.json(
        { error: 'dailyTokenBudget must be between 1,000 and 500,000' },
        { status: 400 },
      );
    }
    patch.dailyTokenBudget = budget;
  }
  if (Array.isArray(body.enabledAgents)) {
    const agents = body.enabledAgents.filter((a: unknown) => validAgents.includes(a as string));
    patch.enabledAgents = agents;
  }
  if (body.perAgentAutonomy !== undefined && typeof body.perAgentAutonomy === 'object' && !Array.isArray(body.perAgentAutonomy)) {
    const validated: Record<string, string> = {};
    for (const [agent, level] of Object.entries(body.perAgentAutonomy as Record<string, unknown>)) {
      if (validAgents.includes(agent) && validAutonomy.includes(level as string)) {
        validated[agent] = level as string;
      }
    }
    patch.perAgentAutonomy = validated;
  }
  if (body.confidenceThreshold !== undefined) {
    const threshold = parseInt(String(body.confidenceThreshold));
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 100) {
      patch.confidenceThreshold = threshold;
    }
  }

  // Upsert — creates the row on first save
  const { data, error } = await supabase
    .from('AgentSettings')
    .upsert({ spaceId: space.id, ...patch }, { onConflict: 'spaceId' })
    .select()
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
