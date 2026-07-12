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
  /** Live narration line while running ("Searching contacts…"). */
  currentAction: string | null;
  /** 'none' | 'daily' | 'weekly' — recurring sessions re-queue on completion. */
  recurrence: 'none' | 'daily' | 'weekly';
  /** Message drafts the session staged into the drafts inbox. */
  draftCount: number;
}
