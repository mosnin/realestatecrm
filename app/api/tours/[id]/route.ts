import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendTourFollowUp, type TourEmailData } from '@/lib/tour-emails';

async function resolveTour(userId: string, tourId: string) {
  const { data: rows, error } = await supabase.from('Tour').select('*').eq('id', tourId);
  if (error) throw error;
  if (!rows?.length) return null;
  const tour = rows[0];
  const space = await getSpaceForUser(userId);
  if (!space || tour.spaceId !== space.id) return null;
  return { tour, space };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const ctx = await resolveTour(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(ctx.tour);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const ctx = await resolveTour(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();

  const VALID_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.status !== undefined) update.status = body.status;
  if (body.guestName !== undefined) update.guestName = body.guestName;
  if (body.guestEmail !== undefined) update.guestEmail = body.guestEmail;
  if (body.guestPhone !== undefined) update.guestPhone = body.guestPhone || null;
  if (body.propertyAddress !== undefined) update.propertyAddress = body.propertyAddress || null;
  if (body.notes !== undefined) update.notes = body.notes || null;
  if (body.startsAt !== undefined) {
    const d = new Date(body.startsAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid startsAt' }, { status: 400 });
    update.startsAt = d.toISOString();
  }
  if (body.endsAt !== undefined) {
    const d = new Date(body.endsAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid endsAt' }, { status: 400 });
    update.endsAt = d.toISOString();
  }
  if (body.contactId !== undefined) update.contactId = body.contactId || null;

  const { data, error } = await supabase
    .from('Tour')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Send follow-up email when marked completed
  if (body.status === 'completed' && ctx.tour.status !== 'completed') {
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    const { data: spaceRow } = await supabase.from('Space').select('name').eq('id', ctx.space.id).maybeSingle();
    const emailData: TourEmailData = {
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
      propertyAddress: data.propertyAddress,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      businessName: settings?.businessName || spaceRow?.name || '',
      tourId: data.id,
      slug: '',
    };
    sendTourFollowUp(emailData).catch(console.error);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const ctx = await resolveTour(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('Tour').delete().eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}
