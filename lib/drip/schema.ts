/**
 * Drip sequence step shape — the jsonb `steps` array stored on
 * "DripSequence" (supabase/migrations/20260830000000_drip_sequences.sql).
 * Postgres only guarantees the column is valid JSON; this module is the real
 * validation, run before any write, mirroring how lib/workflows/schema.ts
 * validates Workflow's jsonb columns.
 */

export type DripChannel = 'sms' | 'email';

export interface DripStep {
  /** Days after enrollment this step is due. 0 = fires the same tick the
   *  contact is enrolled. Steps need not be sorted by the author, but the
   *  engine walks them in array order — validation requires non-decreasing
   *  offsets so "day 3" can never come before "day 0". */
  dayOffset: number;
  channel: DripChannel;
  /** Handed to the scheduled-message dispatcher exactly as a workflow
   *  `schedule_message` action's instruction is — either the drafting
   *  agent's brief (draft/notify) or the literal send body (auto). */
  instruction: string;
}

export class DripSequenceValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Invalid drip sequence: ${issues.join('; ')}`);
    this.name = 'DripSequenceValidationError';
    this.issues = issues;
  }
}

const MAX_STEPS = 20;
const MAX_INSTRUCTION_LEN = 2000;
const MAX_DAY_OFFSET = 365;

/**
 * Validate + normalize a raw `steps` value into DripStep[]. Throws
 * DripSequenceValidationError with field-level issues on a bad shape — same
 * "reject with detail, never coerce silently" posture as
 * parseWorkflowDefinition.
 */
export function parseDripSteps(raw: unknown): DripStep[] {
  const issues: string[] = [];

  if (!Array.isArray(raw)) {
    throw new DripSequenceValidationError(['steps must be an array']);
  }
  if (raw.length === 0) {
    throw new DripSequenceValidationError(['steps must contain at least one step']);
  }
  if (raw.length > MAX_STEPS) {
    throw new DripSequenceValidationError([`steps must contain at most ${MAX_STEPS} entries`]);
  }

  const parsed: DripStep[] = [];
  let prevOffset = -1;

  raw.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      issues.push(`steps[${i}] must be an object`);
      return;
    }
    const e = entry as Record<string, unknown>;

    const dayOffset = e.dayOffset;
    if (typeof dayOffset !== 'number' || !Number.isInteger(dayOffset) || dayOffset < 0) {
      issues.push(`steps[${i}].dayOffset must be a non-negative integer`);
      return;
    }
    if (dayOffset > MAX_DAY_OFFSET) {
      issues.push(`steps[${i}].dayOffset must be at most ${MAX_DAY_OFFSET}`);
      return;
    }
    if (dayOffset < prevOffset) {
      issues.push(`steps[${i}].dayOffset must not come before the previous step's offset`);
      return;
    }

    const channel = e.channel;
    if (channel !== 'sms' && channel !== 'email') {
      issues.push(`steps[${i}].channel must be 'sms' or 'email'`);
      return;
    }

    const instruction = e.instruction;
    if (typeof instruction !== 'string' || !instruction.trim()) {
      issues.push(`steps[${i}].instruction must be a non-empty string`);
      return;
    }
    if (instruction.length > MAX_INSTRUCTION_LEN) {
      issues.push(`steps[${i}].instruction must be at most ${MAX_INSTRUCTION_LEN} characters`);
      return;
    }

    prevOffset = dayOffset;
    parsed.push({ dayOffset, channel, instruction: instruction.trim() });
  });

  if (issues.length > 0) {
    throw new DripSequenceValidationError(issues);
  }

  return parsed;
}
