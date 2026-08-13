'use client';

/**
 * Renders a `display: 'question-flow'` tool result (from `ask_realtor`) as the
 * tool-ui QuestionFlow — a guided clarification, either a single progressive
 * step or an upfront multi-step flow.
 *
 * Round-trip reuses the SAME intent channel the carousel / option-list use:
 * `onUserIntent` (forwarded by chippi-workspace as the realtor's next
 * message).
 *   - Upfront (steps): `onComplete(answers)` fires once the realtor finishes
 *     every step → we format all answers into one line and post it back.
 *   - Progressive (single step): `onSelect(optionIds)` fires for the one step
 *     → we post that step's answer back so the agent can ask the next one.
 *
 * On read-only history surfaces (no `onUserIntent`) the flow renders inert.
 */

import {
  QuestionFlow,
  type QuestionFlowProps,
} from '@/components/tool-ui/question-flow';
import { AgentApprovalCard } from '@/components/ai/agent-status';
import { safeParseSerializableQuestionFlow } from '@/components/tool-ui/question-flow/schema';
import {
  buildQuestionFlow,
  formatQuestionFlowAnswers,
  type QuestionFlowInput,
} from './tool-ui-mappers';

export function QuestionFlowResult({
  input,
  onUserIntent,
}: {
  input: QuestionFlowInput;
  onUserIntent?: (text: string) => void;
}) {
  const payload = buildQuestionFlow(input);
  if (!payload) return null;
  const parsed = safeParseSerializableQuestionFlow(payload);
  if (!parsed) return null;

  const interactive = Boolean(onUserIntent);

  // Upfront multi-step → onComplete(answers: Record<stepId, optionIds[]>).
  if ('steps' in parsed) {
    const completeProps: QuestionFlowProps = {
      ...parsed,
      onComplete: interactive
        ? (answers: Record<string, string[]>) =>
            onUserIntent?.(formatQuestionFlowAnswers(input.steps ?? [], answers))
        : undefined,
    };
    return (
      <AgentApprovalCard
        description="Answer the guided questions so Work can continue with the right constraints."
        interactive={interactive}
      >
        <QuestionFlow {...completeProps} />
      </AgentApprovalCard>
    );
  }

  // Receipt mode never originates from a tool payload here — only progressive
  // remains. Progressive → onSelect(optionIds) for the single step.
  if ('step' in parsed) {
    const labelById = new Map((input.options ?? []).map((o) => [o.id, o.label]));
    const progressiveProps: QuestionFlowProps = {
      ...parsed,
      onSelect: interactive
        ? (optionIds: string[]) => {
            const labels = optionIds.map((id: string) => labelById.get(id) ?? id);
            const title = input.title ?? 'Answer';
            onUserIntent?.(`Answers — ${title}: ${labels.join(', ')}`);
          }
        : undefined,
    };
    return (
      <AgentApprovalCard interactive={interactive}>
        <QuestionFlow {...progressiveProps} />
      </AgentApprovalCard>
    );
  }

  return null;
}
