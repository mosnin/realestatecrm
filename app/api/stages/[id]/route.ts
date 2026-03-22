import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

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

  // Validate name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    if (body.name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
    }
  }

  // Validate color is a safe 6-digit hex code
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const safeColor = typeof body.color === 'string' && HEX_COLOR.test(body.color)
    ? body.color
    : existing.color; // keep existing color if invalid value supplied
  const { data: stage, error: updateError } = await supabase
    .from('DealStage')
    .update({ name: body.name !== undefined ? body.name.trim() : existing.name, color: safeColor })
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
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

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
