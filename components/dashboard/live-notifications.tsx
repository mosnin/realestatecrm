'use client';

import { useRealtime } from '@/hooks/use-realtime';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PhoneIncoming, CalendarDays, Briefcase } from 'lucide-react';

interface Props {
  spaceId: string;
  slug: string;
}

export function LiveNotifications({ spaceId, slug }: Props) {
  const router = useRouter();

  // Live lead notifications
  useRealtime({
    table: 'Contact',
    event: 'INSERT',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const contact = payload.new as any;
      if (!contact?.name) return;
      if (contact?.brokerageId) return; // Brokerage intake leads are broker-dashboard only
      toast.success(`New lead: ${contact.name}`, {
        description: contact.phone || contact.email || 'Just applied',
        icon: <PhoneIncoming size={16} />,
        action: {
          label: 'View',
          onClick: () => router.push(`/s/${slug}/contacts/${contact.id}`),
        },
        duration: 8000,
      });
      router.refresh();
    },
  });

  // Live tour bookings
  useRealtime({
    table: 'Tour',
    event: 'INSERT',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const tour = payload.new as any;
      if (!tour?.guestName) return;
      toast.success(`Tour booked: ${tour.guestName}`, {
        description: tour.propertyAddress || 'New tour scheduled',
        icon: <CalendarDays size={16} />,
        action: {
          label: 'View',
          onClick: () => router.push(`/s/${slug}/tours`),
        },
        duration: 8000,
      });
      router.refresh();
    },
  });

  // Live deal updates
  useRealtime({
    table: 'Deal',
    event: 'INSERT',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const deal = payload.new as any;
      if (!deal?.title) return;
      toast.success(`New deal: ${deal.title}`, {
        description: deal.address || 'Added to pipeline',
        icon: <Briefcase size={16} />,
        duration: 6000,
      });
      router.refresh();
    },
  });

  // Scoring updates - when a contact's scoring status changes
  useRealtime({
    table: 'Contact',
    event: 'UPDATE',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const oldRecord = payload.old as any;
      const newRecord = payload.new as any;
      if (newRecord?.brokerageId) return; // Brokerage intake leads are broker-dashboard only
      // Only notify when scoring completes
      if (oldRecord?.scoringStatus === 'pending' && newRecord?.scoringStatus === 'scored' && newRecord?.scoreLabel) {
        toast.info(`Lead scored: ${newRecord.name || 'Contact'}`, {
          description: `${newRecord.scoreLabel.toUpperCase()} — Score: ${newRecord.leadScore}/100`,
          duration: 6000,
        });
        router.refresh();
      }
    },
  });

  return null; // This component renders nothing — it just subscribes
}
