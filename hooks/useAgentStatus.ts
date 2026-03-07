'use client';

import { useQuery } from '@tanstack/react-query';
import type { AgentStatusData } from '@/lib/types';

async function fetchAgentStatus(subdomain: string): Promise<AgentStatusData | null> {
  const res = await fetch(`/api/agent?subdomain=${encodeURIComponent(subdomain)}`);
  if (!res.ok) throw new Error('Failed to fetch agent status');
  return res.json();
}

export function useAgentStatus(subdomain: string) {
  return useQuery<AgentStatusData | null, Error>({
    queryKey: ['agent-status', subdomain],
    queryFn: () => fetchAgentStatus(subdomain),
    refetchInterval: 15000 // check every 15 s
  });
}
