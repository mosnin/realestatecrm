'use client';

/**
 * Ordered step list editor for a drip sequence — {dayOffset, channel,
 * instruction} rows, add/remove/reorder. Client-side validation here is a
 * head start for the realtor (instant feedback before they hit Save); the
 * server's parseDripSteps (lib/drip/schema.ts) is the real gate and is
 * re-run on every write, so this file never needs to import it.
 */

import { Fragment } from 'react';
import { Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DripStepUI } from './types';

export const MAX_STEPS = 20;
export const MAX_INSTRUCTION_LEN = 2000;
export const MAX_DAY_OFFSET = 365;

/** Mirrors lib/drip/schema.ts's parseDripSteps rules, for instant client-side
 *  feedback. Returns a field-labeled issue per problem row; empty = valid. */
export function validateStepsClient(steps: DripStepUI[]): string[] {
  const issues: string[] = [];
  if (steps.length === 0) issues.push('Add at least one step.');
  if (steps.length > MAX_STEPS) issues.push(`At most ${MAX_STEPS} steps.`);

  let prevOffset = -1;
  steps.forEach((s, i) => {
    if (!Number.isInteger(s.dayOffset) || s.dayOffset < 0) {
      issues.push(`Step ${i + 1}: day offset must be a non-negative whole number.`);
    } else if (s.dayOffset > MAX_DAY_OFFSET) {
      issues.push(`Step ${i + 1}: day offset must be at most ${MAX_DAY_OFFSET}.`);
    } else if (s.dayOffset < prevOffset) {
      issues.push(`Step ${i + 1}: day offset can't come before the previous step's.`);
    } else {
      prevOffset = s.dayOffset;
    }
    if (!s.instruction.trim()) {
      issues.push(`Step ${i + 1}: instruction can't be empty.`);
    } else if (s.instruction.length > MAX_INSTRUCTION_LEN) {
      issues.push(`Step ${i + 1}: instruction must be at most ${MAX_INSTRUCTION_LEN} characters.`);
    }
  });
  return issues;
}

export function newStep(afterOffset = 0): DripStepUI {
  return { dayOffset: afterOffset, channel: 'email', instruction: '' };
}

interface Props {
  steps: DripStepUI[];
  onChange: (steps: DripStepUI[]) => void;
}

export function StepEditor({ steps, onChange }: Props) {
  function updateStep(i: number, patch: Partial<DripStepUI>) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function addStep() {
    const lastOffset = steps.length > 0 ? steps[steps.length - 1].dayOffset : 0;
    onChange([...steps, newStep(lastOffset)]);
  }

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <Fragment key={i}>
          <div className="flex items-start gap-2 rounded-xl border border-border bg-background/60 p-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                type="button"
                aria-label={`Move step ${i + 1} up`}
                disabled={i === 0}
                onClick={() => moveStep(i, -1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              >
                <ChevronUp aria-hidden size={14} />
              </button>
              <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <button
                type="button"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === steps.length - 1}
                onClick={() => moveStep(i, 1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              >
                <ChevronDown aria-hidden size={14} />
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Day
                  <Input
                    type="number"
                    min={0}
                    max={MAX_DAY_OFFSET}
                    value={step.dayOffset}
                    onChange={(e) => updateStep(i, { dayOffset: Number(e.target.value) })}
                    className="h-8 w-20"
                    aria-label={`Step ${i + 1} day offset`}
                  />
                </label>
                <Select
                  value={step.channel}
                  onValueChange={(v) => updateStep(i, { channel: v as DripStepUI['channel'] })}
                >
                  <SelectTrigger size="sm" aria-label={`Step ${i + 1} channel`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => removeStep(i)}
                  className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </div>
              <Textarea
                value={step.instruction}
                onChange={(e) => updateStep(i, { instruction: e.target.value })}
                placeholder="What should this step say? (handed to your drafting agent, or sent as-is on Auto)"
                className="min-h-16 text-sm"
                maxLength={MAX_INSTRUCTION_LEN}
                aria-label={`Step ${i + 1} instruction`}
              />
            </div>
          </div>
        </Fragment>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={steps.length >= MAX_STEPS}>
        <Plus aria-hidden size={14} />
        Add step
      </Button>
    </div>
  );
}
