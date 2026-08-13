'use client';

/**
 * Renders a `display: 'option-list'` tool result (from `ask_realtor`) as the
 * tool-ui OptionList — a small set of selectable choices with a confirm
 * action.
 *
 * Round-trip reuses the SAME intent channel the availability picker and
 * properties carousel use: `onUserIntent` (forwarded by chippi-workspace as
 * the realtor's next message). When the realtor taps the confirm action, we
 * post their selection back as the next turn so the agent can continue. The
 * Clear/cancel action just resets the selection in place — no turn fires.
 *
 * When `onUserIntent` is absent (read-only history surfaces), the list renders
 * inert: a non-interactive snapshot of the choices the agent offered. Mirrors
 * how Phase A renders the carousel without the intent prop.
 */

import { OptionList } from '@/components/tool-ui/option-list';
import { AgentApprovalCard } from '@/components/ai/agent-status';
import {
  safeParseSerializableOptionList,
  type OptionListSelection,
} from '@/components/tool-ui/option-list/schema';
import { buildOptionList, optionLabelMap, type OptionListInput } from './tool-ui-mappers';

/** Action ids that DON'T fire a turn — they only clear the in-card selection. */
const RESET_ACTION_IDS = new Set(['cancel', 'clear', 'reset']);

function selectionToIds(selection: OptionListSelection): string[] {
  if (selection == null) return [];
  return typeof selection === 'string' ? [selection] : selection;
}

export function OptionListResult({
  input,
  prompt,
  onUserIntent,
}: {
  input: OptionListInput;
  /** Optional lead-in shown above the options (the agent's question text). */
  prompt?: string;
  onUserIntent?: (text: string) => void;
}) {
  if (!input?.options?.length) return null;

  const interactive = Boolean(onUserIntent);
  const payload = buildOptionList(input);
  const parsed = safeParseSerializableOptionList(payload);
  if (!parsed) return null;

  const labelById = optionLabelMap(input);

  const handleAction = (actionId: string, selection: OptionListSelection) => {
    if (!onUserIntent) return;
    // Reset/clear actions stay local — the component already cleared the
    // selection; nothing to send back to the agent.
    if (RESET_ACTION_IDS.has(actionId)) return;

    const ids = selectionToIds(selection);
    if (ids.length === 0) return; // confirm with nothing chosen — ignore.
    const labels = ids.map((id) => labelById.get(id) ?? id);
    onUserIntent(`Selected: ${labels.join(', ')}`);
  };

  return (
    <AgentApprovalCard
      description={prompt}
      interactive={interactive}
    >
      <OptionList
        {...parsed}
        // Read-only history surfaces show the offered choices as a receipt:
        // pass the (single) default selection back as `choice` only when the
        // agent provided one. With no handlers the card is non-interactive.
        onAction={interactive ? handleAction : undefined}
      />
    </AgentApprovalCard>
  );
}
