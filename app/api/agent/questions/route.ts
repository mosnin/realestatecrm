import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50);

  const { data, error } = await tenantTable(supabase, 'AgentQuestion', { spaceId: space.id })
    .select('*, Contact:contactId(id,name)')
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('createdAt', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { question, context, contactId, priority, agentType, runId } = body;

  if (typeof question !== 'string' || question.length < 10 || question.length > 500) {
    return NextResponse.json(
      { error: 'question must be between 10 and 500 characters' },
      { status: 400 },
    );
  }

  if (context !== undefined && context !== null) {
    if (typeof context !== 'string' || context.length > 1000) {
      return NextResponse.json(
        { error: 'context must be 1000 characters or fewer' },
        { status: 400 },
      );
    }
  }

  // Validate contactId belongs to this space if provided
  if (contactId) {
    const { data: c } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
      .select('id')
      .eq('id', contactId)
      .maybeSingle();
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await tenantTable(supabase, 'AgentQuestion', { spaceId: space.id })
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      runId: runId ?? 'manual',
      agentType: agentType ?? 'coordinator',
      question,
      context: context ?? null,
      contactId: contactId ?? null,
      priority: priority ?? 0,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data, { status: 201 });
}
