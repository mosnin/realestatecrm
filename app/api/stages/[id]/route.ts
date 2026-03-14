import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existingRows, error: existingError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', id);
  if (existingError) throw existingError;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  // Validate color is a safe 6-digit hex code
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const safeColor = typeof body.color === 'string' && HEX_COLOR.test(body.color)
    ? body.color
    : existing.color; // keep existing color if invalid value supplied
  const { data: stage, error: updateError } = await supabase
    .from('DealStage')
    .update({ name: body.name, color: safeColor })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw updateError;

  return NextResponse.json(stage);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: existingRows, error: existingError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', id);
  if (existingError) throw existingError;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: deleteError } = await supabase.from('DealStage').delete().eq('id', id);
  if (deleteError) throw deleteError;
  return NextResponse.json({ success: true });
}
