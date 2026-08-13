import 'server-only';

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { kickPlan } from './kick';
import { createWorkspaceRun } from '@/lib/workspace-runs/server';
import type { WorkSessionRow } from './types';

export interface StartWorkSessionInput {
  id?: string;
  spaceId: string;
  conversationId: string | null;
  goal: string;
  autonomy: 'plan_first' | 'just_go';
  allowQuestions: boolean;
  kind?: 'research' | 'workspace';
}

export interface StartWorkSessionResult {
  session: WorkSessionRow;
  created: boolean;
}

/**
 * Insert and dispatch one Work Session.
 *
 * A caller may supply a deterministic id (Realtime does) so a retried
 * function call resolves to the same run. Only the insert winner is new, but
 * a retry of an existing `planning` row re-sends the idempotent Inngest event
 * to close the insert-before-dispatch crash window.
 */
export async function startWorkSession(
  input: StartWorkSessionInput,
): Promise<StartWorkSessionResult> {
  const id = input.id ?? crypto.randomUUID();
  const insert = await supabase
    .from('WorkSession')
    .insert({
      id,
      spaceId: input.spaceId,
      conversationId: input.conversationId,
      goal: input.goal,
      autonomy: input.autonomy,
      allowQuestions: input.allowQuestions,
      kind: input.kind ?? 'research',
    })
    .select('*')
    .single();

  let created = !insert.error && Boolean(insert.data);
  let session = insert.data as WorkSessionRow | null;

  if (!session && input.id) {
    const { data: existing, error: existingError } = await supabase
      .from('WorkSession')
      .select('*')
      .eq('id', id)
      .eq('spaceId', input.spaceId)
      .maybeSingle();
    if (existingError) throw existingError;
    session = existing as WorkSessionRow | null;
    created = false;
  }

  if (!session) {
    throw insert.error ?? new Error('Could not create Work Session');
  }

  if (input.kind === 'workspace' && !session.workspaceRunId) {
    // A stable run id is the idempotency key shared with the Modal worker.
    const runId = crypto.randomUUID();
    const workspace = await createWorkspaceRun({ id: runId, workSessionId: session.id, spaceId: input.spaceId, goal: input.goal });
    if (workspace.id !== runId || !session.workspaceRunId) {
      const { data: linked, error: linkError } = await supabase.from('WorkSession').update({ workspaceRunId: workspace.id }).eq('id', session.id).eq('spaceId', input.spaceId).select('*').maybeSingle();
      if (linkError || !linked || (linked as WorkSessionRow).workspaceRunId !== workspace.id) {
        const error = 'Workspace Run could not be linked to this session.';
        await supabase.from('WorkSession').update({ status: 'failed', error, updatedAt: new Date().toISOString() }).eq('id', session.id).eq('spaceId', input.spaceId);
        throw new Error(error);
      }
      session = linked as WorkSessionRow;
    }
  }

  // Planning is idempotent: it only acts while status === "planning".
  // Re-sending on a deterministic retry is therefore safe and repairs a
  // crash after the row committed but before Inngest accepted the event.
  if (created || session.status === 'planning') {
    await kickPlan(session.id);
  }

  return { session, created };
}
