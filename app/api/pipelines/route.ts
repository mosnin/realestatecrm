import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { tenantTable } from '@/lib/tenant-db';
import type { Pipeline } from '@/lib/types';
import { ensureDefaultPipelines } from '@/lib/deals/default-pipelines';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function listPipelines(spaceId: string): Promise<Pipeline[]> {
  const { data, error } = await tenantTable(supabase, 'Pipeline', { spaceId })
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pipeline[];
}
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Seed any missing default board (seller was historically skipped).
  // Idempotent — existing custom boards are not rewritten.
  await ensureDefaultPipelines(space.id);

  return NextResponse.json(await listPipelines(space.id));
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; name?: string; color?: string; emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { slug, name, color, emoji } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
  }

  const safeColor = typeof color === 'string' && HEX_COLOR.test(color) ? color : '#6366f1';
  const safeEmoji =
    typeof emoji === 'string' && emoji.trim().length > 0 && emoji.trim().length <= 8
      ? emoji.trim()
      : null;

  // Get the max position to append at end
  const { data: last, error: lastError } = await tenantTable(supabase, 'Pipeline', { spaceId: space.id })
    .select('position')
    .order('position', { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const lastRows = (last ?? []) as { position: number }[];
  const position = lastRows.length > 0 ? lastRows[0].position + 1 : 0;

  const id = crypto.randomUUID();
  const { data: pipeline, error: insertError } = await tenantTable(supabase, 'Pipeline', { spaceId: space.id })
    .insert({
      id,
      spaceId: space.id,
      name: name.trim(),
      color: safeColor,
      emoji: safeEmoji,
      position,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  return NextResponse.json(pipeline as Pipeline, { status: 201 });
}
