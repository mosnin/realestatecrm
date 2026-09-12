import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import type { ToolContext } from '@/lib/ai-tools/types';

/** The model chooses wording, never the recipient, channel or enabled policy. */
export async function checkCoverageAction(ctx: ToolContext, contactId?: string, channel?: 'email' | 'sms'): Promise<string | null> {
  const scope = ctx.followThroughScope;
  if (!scope) return null;
  if (contactId !== scope.contactId || (channel && channel !== scope.channel)) return 'This routine may only act on its original contact and channel.';
  if (ctx.signal.aborted) return 'This run was stopped.';
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId: ctx.space.id })
    .select('id').eq('id', scope.workflowId).eq('enabled', true).eq('autonomy', 'auto').maybeSingle();
  if (error || !data) return 'Automatic coverage is paused or its authorization could not be checked.';
  return null;
}
