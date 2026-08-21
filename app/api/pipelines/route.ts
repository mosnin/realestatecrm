import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { ensureDefaultPipelines } from '@/lib/pipelines';
import type { Pipeline } from '@/lib/types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const pipelines = await ensureDefaultPipelines(space.id);
  return NextResponse.json(pipelines);
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
  const { data: last, error: lastError } = await supabase
    .from('Pipeline')
    .select('position')
    .eq('spaceId', space.id)
    .order('position', { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const id = crypto.randomUUID();
  const { data: pipeline, error: insertError } = await supabase
    .from('Pipeline')
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
