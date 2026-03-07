'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Lead } from '@/lib/types/retell';

interface UseRealtimeLeadsOptions {
  spaceId: string;
  onNewLead?: (lead: Lead) => void;
}

export function useRealtimeLeads({
  spaceId,
  onNewLead,
}: UseRealtimeLeadsOptions) {
  const onNewLeadRef = useRef(onNewLead);
  onNewLeadRef.current = onNewLead;

  const subscribe = useCallback(() => {
    const supabase = getSupabaseClient();

    const channel = supabase
      .channel(`leads:${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Lead',
          filter: `spaceId=eq.${spaceId}`,
        },
        (payload) => {
          const newLead = payload.new as Lead;
          onNewLeadRef.current?.(newLead);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId]);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);
}
