'use client';

/**
 * Create/edit dialog for one drip sequence: name + active toggle + ordered
 * steps (StepEditor). Pass `initial` to edit an existing sequence; omit it to
 * create a new one. The actual API call is the caller's responsibility
 * (`onSubmit`) — this component only collects + client-validates the form
 * and surfaces whatever issues the caller hands back (e.g. server-side
 * parseDripSteps issues), so there is exactly one source of truth for what a
 * valid sequence looks like: the server.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { StepEditor, validateStepsClient, newStep } from './step-editor';
import type { DripSequenceUI, DripStepUI } from './types';

const MAX_NAME = 120;

export interface SequenceFormPayload {
  name: string;
  steps: DripStepUI[];
  active: boolean;
}

export interface SequenceSubmitResult {
  ok: boolean;
  error?: string;
  issues?: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DripSequenceUI;
  onSubmit: (payload: SequenceFormPayload) => Promise<SequenceSubmitResult>;
}

export function SequenceBuilder({ open, onOpenChange, initial, onSubmit }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [steps, setSteps] = useState<DripStepUI[]>(
    initial?.steps && initial.steps.length > 0 ? initial.steps : [newStep()],
  );
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Re-seed local state whenever a different sequence is opened for edit (or
  // the dialog re-opens fresh for create). Keyed remount would also work but
  // this keeps the dialog mounted for its exit animation.
  const openKey = `${open}:${initial?.id ?? 'new'}`;
  const [lastKey, setLastKey] = useState(openKey);
  if (openKey !== lastKey) {
    setLastKey(openKey);
    setName(initial?.name ?? '');
    setActive(initial?.active ?? true);
    setSteps(initial?.steps && initial.steps.length > 0 ? initial.steps : [newStep()]);
    setIssues([]);
  }

  async function handleSave() {
    const clientIssues: string[] = [];
    const trimmedName = name.trim();
    if (!trimmedName) clientIssues.push('Give the sequence a name.');
    if (trimmedName.length > MAX_NAME) clientIssues.push(`Name must be ${MAX_NAME} characters or fewer.`);
    clientIssues.push(...validateStepsClient(steps));

    if (clientIssues.length > 0) {
      setIssues(clientIssues);
      return;
    }

    setSaving(true);
    setIssues([]);
    try {
      const result = await onSubmit({ name: trimmedName, steps, active });
      if (!result.ok) {
        setIssues(result.issues && result.issues.length > 0 ? result.issues : [result.error ?? 'Save failed.']);
        return;
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit sequence' : 'New drip sequence'}</DialogTitle>
          <DialogDescription>
            Each step schedules a message on its day offset, through your normal drafting/sending
            settings. A sequence stops the moment a contact replies.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="drip-seq-name">Name</Label>
            <Input
              id="drip-seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New seller lead nurture"
              maxLength={MAX_NAME}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">
                Paused sequences keep their enrollments but stop advancing.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Sequence active" />
          </div>

          <div className="space-y-1.5">
            <Label>Steps</Label>
            <StepEditor steps={steps} onChange={setSteps} />
          </div>

          {issues.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
                {issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create sequence'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
