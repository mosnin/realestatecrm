import { supabase } from '@/lib/supabase';
import type { AgentRunTrigger } from './run-ledger';

/** Event payloads never become automatic-action grants. Only a saved routine can. */
export async function resolveRoutinePolicy(spaceId: string, trigger: AgentRunTrigger, instruction: string) {
  const { data, error } = await supabase.from('AgentSettings')
    .select('enabled, autonomyLevel, dailyTokenBudget').eq('spaceId', spaceId).maybeSingle();
  if (error) throw error;
  if (!data?.enabled) return null;
  const automatic = trigger === 'routine' && data.autonomyLevel === 'autonomous';
  return {
    dailyTokenBudget: Math.max(0, Number(data.dailyTokenBudget ?? 50000)),
    executionMode: automatic ? 'autonomous' as const : 'review' as const,
    authorizedInstruction: automatic ? instruction : undefined,
  };
}
