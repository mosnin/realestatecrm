'use client';

import { useRealtime } from '@/hooks/use-realtime';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { PhoneIncoming, CalendarDays, Briefcase, ArrowRight, CalendarCheck, CalendarX } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

interface Props {
  spaceId: string;
  slug: string;
}

const TOUR_STATUS_COPY: Record<string, { label: string; icon: typeof CalendarCheck }> = {
  confirmed: { label: 'confirmed', icon: CalendarCheck },
  completed: { label: 'completed', icon: CalendarCheck },
  cancelled: { label: 'cancelled', icon: CalendarX },
  no_show:   { label: 'no-show',   icon: CalendarX },
};

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
      toast.success(`New lead — ${contact.name}.`, {
        description: contact.phone || contact.email || 'Just applied.',
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
      toast.success(`Tour booked — ${tour.guestName}.`, {
        description: tour.propertyAddress || 'New tour on the books.',
        icon: <CalendarDays size={16} />,
        action: {
          label: 'View',
          onClick: () => router.push(`/s/${slug}/calendar`),
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
      toast.success(`New deal — ${deal.title}.`, {
        description: deal.address || 'Added to your pipeline.',
        icon: <Briefcase size={16} />,
        duration: 6000,
      });
      router.refresh();
    },
  });

  // Stage moves — fires when a Deal's stageId changes (drag, manual, or
  // Chippi via advance_deal_stage). Resolves the stage name lazily so the
  // toast can name the destination instead of just saying "moved".
  useRealtime({
    table: 'Deal',
    event: 'UPDATE',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: async (payload) => {
      const oldDeal = payload.old as any;
      const newDeal = payload.new as any;
      if (!newDeal?.title) return;
      if (oldDeal?.stageId === newDeal?.stageId) return;
      if (!newDeal?.stageId) return;

      let stageName: string | null = null;
      try {
        const sb = getSupabaseBrowser();
        if (sb) {
          const { data } = await sb
            .from('DealStage')
            .select('name')
            .eq('id', newDeal.stageId)
            .maybeSingle<{ name: string | null }>();
          stageName = data?.name ?? null;
        }
      } catch {
        // Stage lookup is best-effort. Toast still fires below.
      }

      toast.success(`${newDeal.title} → ${stageName ?? 'next stage'}.`, {
        icon: <ArrowRight size={16} />,
        duration: 5000,
        action: {
          label: 'Open',
          onClick: () => router.push(`/s/${slug}/deals`),
        },
      });
      router.refresh();
    },
  });

  // Tour status changes — confirmed, completed, cancelled, no_show.
  useRealtime({
    table: 'Tour',
    event: 'UPDATE',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const oldTour = payload.old as any;
      const newTour = payload.new as any;
      if (!newTour?.guestName) return;
      if (oldTour?.status === newTour?.status) return;

      const meta = TOUR_STATUS_COPY[newTour.status as string];
      if (!meta) return;

      const Icon = meta.icon;
      const fn = meta.label === 'cancelled' || meta.label === 'no-show'
        ? toast.warning
        : toast.success;

      fn(`Tour ${meta.label} — ${newTour.guestName}.`, {
        description: newTour.propertyAddress || undefined,
        icon: <Icon size={16} />,
        duration: 6000,
        action: {
          label: 'Open',
          onClick: () => router.push(`/s/${slug}/calendar`),
        },
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
        toast.info(`Scored — ${newRecord.name || 'Contact'}.`, {
          description: `${newRecord.scoreLabel.toUpperCase()} · ${newRecord.leadScore}/100`,
          duration: 6000,
        });
        router.refresh();
      }
    },
  });

  return null; // This component renders nothing — it just subscribes
}
