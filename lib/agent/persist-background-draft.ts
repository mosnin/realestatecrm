import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import type { ToolContext, ToolResult } from '@/lib/ai-tools/types';

/** Interactive drafts render inline. Unattended drafts need a durable inbox
 * record or the human never sees them. No customer message is sent here. */
export async function persistBackgroundDraft(
  name: string,
  args: unknown,
  result: ToolResult,
  ctx: ToolContext,
  callId?: string,
): Promise<ToolResult> {
  if (
    !ctx.backgroundRun ||
    !['draft_email', 'draft_sms'].includes(name) ||
    result.display === 'error'
  )
    return result;
  const personId = (args as { personId?: string } | null)?.personId;
  const draft = result.data as
    | { body?: string; subject?: string; id?: string }
    | undefined;
  if (!personId || !draft?.body)
    return {
      summary: 'Draft could not be saved: missing recipient or content.',
      display: 'error',
    };
  const id = callId
    ? `background-draft:${ctx.space.id}:${callId}`
    : crypto.randomUUID();
  const { error } = await tenantTable(supabase, 'AgentDraft', {
    spaceId: ctx.space.id,
  }).upsert(
    {
      id,
      spaceId: ctx.space.id,
      contactId: personId,
      channel: name === 'draft_email' ? 'email' : 'sms',
      content: draft.body,
      subject: draft.subject ?? null,
      status: 'pending',
      reasoning: 'Prepared by your configured background workflow.',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error)
    return {
      summary: 'Draft could not be saved. Nothing was sent.',
      display: 'error',
    };
  return {
    ...result,
    data: { ...draft, id },
    summary: `${result.summary}. Saved to your review inbox; not sent.`,
  };
}
