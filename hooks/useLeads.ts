'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LeadRow } from '@/lib/types';

async function fetchLeads(subdomain: string): Promise<LeadRow[]> {
  const res = await fetch(`/api/leads?subdomain=${encodeURIComponent(subdomain)}`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

export function useLeads(subdomain: string) {
  const prevCountRef = useRef<number | null>(null);

  const query = useQuery<LeadRow[], Error>({
    queryKey: ['leads', subdomain],
    queryFn: () => fetchLeads(subdomain),
    refetchInterval: 5000 // poll every 5 s
  });

  // Fire a toast when new leads arrive since the last poll
  useEffect(() => {
    if (!query.data) return;

    const currentCount = query.data.length;
    const prevCount = prevCountRef.current;

    if (prevCount !== null && currentCount > prevCount) {
      const newLeads = query.data.slice(0, currentCount - prevCount);
      const hotLeads = newLeads.filter((l) => l.score === 'HOT');

      if (hotLeads.length > 0) {
        const lead = hotLeads[0];
        const budgetNote = lead.budget ? ` — Budget: ${lead.budget}` : '';
        toast.success(`New Hot Lead!${budgetNote}`, {
          description: `${lead.intent !== 'UNKNOWN' ? lead.intent : 'Contact'} from ${lead.phone}`,
          duration: 6000
        });
      } else {
        toast.info(`${currentCount - prevCount} new lead${currentCount - prevCount > 1 ? 's' : ''} received`, {
          duration: 4000
        });
      }
    }

    prevCountRef.current = currentCount;
  }, [query.data]);

  return query;
}
