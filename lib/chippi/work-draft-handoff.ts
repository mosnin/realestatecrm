import {
  INLINE_WORK_GOAL_PREFIX,
  parseInlineWorkGoal,
  type WorkExecutionMode,
} from '@/lib/chat/work-execution-mode';

const HANDOFF_VERSION = 1;
const HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_KEY_PREFIX = 'chippi:work-draft-handoff:';

export interface WorkDraftHandoff {
  version: typeof HANDOFF_VERSION;
  text: string;
  mode: 'work';
  executionMode: WorkExecutionMode;
  createdAt: number;
}

function handoffKey(slug: string): string {
  return `${HANDOFF_KEY_PREFIX}${encodeURIComponent(slug)}`;
}

export function workDraftText(goal: string): string | null {
  const normalized = goal.trim();
  if (normalized.length < 3 || normalized.length > 5000) return null;
  return `${INLINE_WORK_GOAL_PREFIX} ${normalized}`;
}

export function stageWorkDraftHandoff(
  storage: Pick<Storage, 'setItem'>,
  slug: string,
  goal: string,
  now = Date.now(),
): boolean {
  const text = workDraftText(goal);
  if (!slug.trim() || !text) return false;

  const handoff: WorkDraftHandoff = {
    version: HANDOFF_VERSION,
    text,
    mode: 'work',
    executionMode: 'review',
    createdAt: now,
  };

  try {
    storage.setItem(handoffKey(slug), JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

export function consumeWorkDraftHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  slug: string,
  now = Date.now(),
): WorkDraftHandoff | null {
  const key = handoffKey(slug);
  let raw: string | null = null;

  try {
    raw = storage.getItem(key);
    storage.removeItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<WorkDraftHandoff>;
    if (
      value.version !== HANDOFF_VERSION ||
      value.mode !== 'work' ||
      value.executionMode !== 'review' ||
      typeof value.createdAt !== 'number' ||
      value.createdAt > now + 60_000 ||
      now - value.createdAt > HANDOFF_TTL_MS ||
      typeof value.text !== 'string' ||
      parseInlineWorkGoal(value.text) === null
    ) {
      return null;
    }
    return value as WorkDraftHandoff;
  } catch {
    return null;
  }
}
