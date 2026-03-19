import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/**
 * POST — Submit tour feedback (from guest, token-based).
 * GET  — Get feedback for a tour (agent, authenticated).
 */
export async function POST(req: NextRequest) {
  const { tourId, token, rating, comment } = await req.json();

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });
  }

  // Verify tour access — either by manage token or by tourId
  let tour: any = null;
  if (token) {
    const { data } = await supabase
      .from('Tour')
      .select('id, spaceId, status')
      .eq('manageToken', token)
      .maybeSingle();
    tour = data;
  } else if (tourId) {
    const { data } = await supabase
      .from('Tour')
      .select('id, spaceId, status')
      .eq('id', tourId)
      .maybeSingle();
    tour = data;
  }

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (tour.status !== 'completed') {
    return NextResponse.json({ error: 'Feedback only accepted for completed tours' }, { status: 400 });
  }

  // Check for existing feedback
  const { data: existing } = await supabase
    .from('TourFeedback')
    .select('id')
    .eq('tourId', tour.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Feedback already submitted' }, { status: 409 });
  }

  const { data: feedback, error } = await supabase
    .from('TourFeedback')
    .insert({
      tourId: tour.id,
      spaceId: tour.spaceId,
      rating: Math.round(rating),
      comment: comment?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json(feedback, { status: 201 });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const tourId = req.nextUrl.searchParams.get('tourId');

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  if (tourId) {
    const { data } = await supabase
      .from('TourFeedback')
      .select('*')
      .eq('tourId', tourId)
      .maybeSingle();
    return NextResponse.json(data);
  }

  // Return all feedback for this space
  const { data } = await supabase
    .from('TourFeedback')
    .select('*')
    .eq('spaceId', auth.space.id)
    .order('createdAt', { ascending: false })
    .limit(100);

  return NextResponse.json(data ?? []);
}
