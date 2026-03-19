import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TourManageClient } from './tour-manage-client';

export default async function TourManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: tour } = await supabase
    .from('Tour')
    .select('id, guestName, guestEmail, propertyAddress, startsAt, endsAt, status, spaceId')
    .eq('manageToken', token)
    .maybeSingle();

  if (!tour) notFound();

  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', tour.spaceId)
    .maybeSingle();

  const { data: space } = await supabase
    .from('Space')
    .select('name, slug')
    .eq('id', tour.spaceId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <TourManageClient
        tour={{
          id: tour.id,
          guestName: tour.guestName,
          guestEmail: tour.guestEmail,
          propertyAddress: tour.propertyAddress,
          startsAt: tour.startsAt,
          endsAt: tour.endsAt,
          status: tour.status,
        }}
        token={token}
        businessName={settings?.businessName || space?.name || 'the property'}
        bookingSlug={space?.slug || ''}
      />
    </div>
  );
}
