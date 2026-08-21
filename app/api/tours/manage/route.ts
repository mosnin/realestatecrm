import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { dropTourCalendarArtifacts } from '@/lib/tours/calendar-propagate';
import { notifyTourCancelledOwner } from '@/lib/notify';
import { logger } from '@/lib/logger';

/**
 * POST — Guest self-service tour management via manage token.
 * Actions: cancel
 *
 * After the status flip we drop BOTH calendar systems (legacy googleEventId
 * + Composio mirror) and tell the realtor. The previous implementation only
 * wrote `status=cancelled`, so a guest cancel left a live calendar slot and
 * a realtor who never heard about it.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`tour-manage:${ip}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token, action } = await req.json();

  if (!token || !action) {
    return NextResponse.json({ error: 'token and action required' }, { status: 400 });
  }

  // Capability-token lookup — manageToken is the authz. spaceId comes from
  // the row after we find it.
  const { data: tour } = await supabase
    .from('Tour')
    .select('id, spaceId, status, startsAt, endsAt, guestName, guestEmail, guestPhone, propertyAddress, googleEventId')
    .eq('manageToken', token)
    .maybeSingle();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (action === 'cancel') {
    if (tour.status === 'cancelled') {
      return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });
    }
    if (tour.status === 'completed') {
      return NextResponse.json({ error: 'Cannot cancel a completed tour' }, { status: 400 });
    }
    if (tour.status === 'no_show') {
      return NextResponse.json({ error: 'Cannot cancel a no-show tour' }, { status: 400 });
    }
    // Don't allow cancellation within 1 hour of tour
    const hourBefore = new Date(new Date(tour.startsAt).getTime() - 60 * 60 * 1000);
    if (new Date() > hourBefore) {
      return NextResponse.json(
        { error: 'Cannot cancel within 1 hour of the tour. Please contact the agent directly.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('Tour')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', tour.id)
      .eq('spaceId', tour.spaceId);

    if (error) throw error;

    const spaceId = tour.spaceId as string;
    const tourId = tour.id as string;
    const sideEffects = (async () => {
      try {
        await dropTourCalendarArtifacts({
          spaceId,
          tourId,
          googleEventId: (tour as { googleEventId?: string | null }).googleEventId,
        });
      } catch (err) {
        logger.warn('[tours/manage] calendar drop failed', { tourId }, err);
      }
      try {
        await notifyTourCancelledOwner({
          spaceId,
          tourData: {
            guestName: tour.guestName,
            guestEmail: tour.guestEmail,
            guestPhone: tour.guestPhone,
            propertyAddress: tour.propertyAddress,
            startsAt: tour.startsAt,
            endsAt: tour.endsAt,
            businessName: '',
            tourId,
            slug: '',
          },
        });
      } catch (err) {
        logger.warn('[tours/manage] owner notify failed', { tourId }, err);
      }
    })();
    try {
      after(() => sideEffects);
    } catch {
      // Tests / non-Next runtimes have no request context.
    }

    return NextResponse.json({ success: true, status: 'cancelled' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
