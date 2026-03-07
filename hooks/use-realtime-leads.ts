'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import type { Lead } from '@/lib/types/vapi';

interface UseRealtimeLeadsOptions {
  spaceId: string;
  initialLeads: Lead[];
  onNewLead?: (lead: Lead) => void;
  pollIntervalMs?: number;
}

export function useRealtimeLeads({
  spaceId,
  initialLeads,
  onNewLead,
  pollIntervalMs = 5000,
}: UseRealtimeLeadsOptions) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const onNewLeadRef = useRef(onNewLead);
  onNewLeadRef.current = onNewLead;
  const latestTimestampRef = useRef<string>(
    initialLeads[0]?.createdAt
      ? new Date(initialLeads[0].createdAt).toISOString()
      : new Date().toISOString()
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/leads?spaceId=${spaceId}&after=${encodeURIComponent(latestTimestampRef.current)}`
      );
      if (!res.ok) return;
      const newLeads: Lead[] = await res.json();
      if (newLeads.length > 0) {
        latestTimestampRef.current = new Date(
          newLeads[0].createdAt
        ).toISOString();
        setLeads((prev) => [...newLeads, ...prev]);
        newLeads.forEach((lead) => onNewLeadRef.current?.(lead));
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [spaceId]);

  useEffect(() => {
    const interval = setInterval(poll, pollIntervalMs);
    return () => clearInterval(interval);
  }, [poll, pollIntervalMs]);

  return leads;
}
