/**
 * Work-session shapes shared by the server engine and the client strip.
 * Types only — no runtime imports, so the client bundle stays clean of the
 * server-only engine.
 */

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  note?: string;
}

export interface WorkSessionRow {
  id: string;
  spaceId: string;
  conversationId: string | null;
  goal: string;
  autonomy: 'plan_first' | 'just_go';
  allowQuestions: boolean;
  status:
    | 'planning'
    | 'awaiting_approval'
    | 'awaiting_input'
    | 'running'
    | 'awaiting_actions'
    | 'completed'
    | 'failed'
    | 'cancelled';
  plan: PlanStep[];
  question: string | null;
  answer: string | null;
  findings: { stepId: string; text: string }[];
  artifactFileId: string | null;
  artifactName: string | null;
  summary: string | null;
  error: string | null;
}

/**
 * One approval-gated action a finished session proposed (append-only audit
 * row — see supabase/migrations/..._work_session_actions.sql). Shared with the
 * client approval strip.
 */
export interface WorkSessionAction {
  id: string;
  sessionId: string;
  spaceId: string;
  /** Registry tool name (e.g. 'send_email'). */
  tool: string;
  /** Schema-validated args, frozen at propose time. */
  args: Record<string, unknown>;
  /** Human-readable "what will happen if you approve" (the tool's summariseCall). */
  summary: string;
  /** The model's one-line justification tying the action to a finding. */
  rationale: string | null;
  status: 'proposed' | 'approved' | 'denied' | 'executed' | 'failed';
  result: Record<string, unknown> | null;
  error: string | null;
  decidedByUserId: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
}
