/**
 * `ask_realtor` — structured clarification when the realtor's intent is
 * ambiguous and no tool call would resolve it.
 *
 * Pure display tool (like `create_plan`): no side effect, no DB write. It
 * accepts a small, structured question and emits it to the chat as one of two
 * interactive cards, chosen by `mode`:
 *
 *   - `mode: 'options'`  → an OptionList: a flat set of choices with a confirm
 *     action. Use for a single decision with a handful of options ("Which
 *     pipeline?", "Pick the Sam you mean").
 *   - `mode: 'questions'` → a QuestionFlow: a branching / multi-step setup that
 *     collects several answers before the realtor finishes ("Set up the buyer
 *     search: budget? timeline? area?").
 *
 * The realtor's choice rounds back through the chat as the next user message
 * (the card forwards it via the workspace's intent channel), so the agent
 * sees the answer on its next turn and continues. Prefer this over a prose
 * question whenever the answer is a pick from a known set — it's faster for
 * the realtor and unambiguous for the model, even if it costs a few more
 * tokens to lay out.
 *
 * Read-only. No approval — it asks, it doesn't act.
 */

import { z } from 'zod';
import { defineTool } from '../types';

const optionSchema = z.object({
  id: z.string().min(1).describe('Stable id for this choice (returned on select).'),
  label: z.string().min(1).max(120).describe('Short human label for the choice.'),
  description: z
    .string()
    .max(200)
    .optional()
    .describe('Optional one-line clarifier under the label.'),
});

const stepSchema = z.object({
  id: z.string().min(1).describe('Stable id for this step.'),
  title: z.string().min(1).max(120).describe('The question for this step.'),
  description: z.string().max(200).optional().describe('Optional helper text.'),
  options: z.array(optionSchema).min(1).max(8).describe('Choices for this step.'),
  selectionMode: z
    .enum(['single', 'multi'])
    .optional()
    .describe('single (default) or multi for multi-select steps.'),
});

const parameters = z
  .object({
    mode: z
      .enum(['options', 'questions'])
      .describe(
        "'options' for one decision from a flat list (OptionList); 'questions' for a multi-step setup (QuestionFlow).",
      ),
    prompt: z
      .string()
      .min(1)
      .max(300)
      .optional()
      .describe('Lead-in shown above an OptionList (the question text). Ignored for questions mode.'),
    options: z
      .array(optionSchema)
      .min(2)
      .max(8)
      .optional()
      .describe("For mode 'options': the flat list of choices."),
    selectionMode: z
      .enum(['single', 'multi'])
      .optional()
      .describe("For mode 'options': single (default) or multi-select."),
    minSelections: z.number().int().min(0).optional().describe("For mode 'options' multi-select."),
    maxSelections: z.number().int().min(1).optional().describe("For mode 'options' multi-select."),
    steps: z
      .array(stepSchema)
      .min(1)
      .max(5)
      .optional()
      .describe("For mode 'questions': the ordered list of steps."),
  })
  .describe(
    'Ask the realtor a structured clarifying question as an interactive card. Use options for one pick from a set; questions for a multi-step setup.',
  );

// The data payload mirrors the serializable shapes the chat mappers expect
// (buildOptionList / buildQuestionFlow). We keep it lean: only serializable
// fields, no callbacks — handlers are attached in React.
interface AskRealtorData {
  options?: z.infer<typeof optionSchema>[];
  prompt?: string;
  selectionMode?: 'single' | 'multi';
  minSelections?: number;
  maxSelections?: number;
  steps?: z.infer<typeof stepSchema>[];
}

export const askRealtorTool = defineTool<typeof parameters, AskRealtorData>({
  name: 'ask_realtor',
  riskLevel: 'safe',
  description:
    'Ask the realtor a structured clarifying question (OptionList for one pick from a set, QuestionFlow for a multi-step setup) when intent is ambiguous. The answer comes back as the next message.',
  parameters,
  requiresApproval: false,

  async handler(args) {
    if (args.mode === 'options') {
      const options = args.options ?? [];
      if (options.length < 2) {
        return {
          summary: 'Need at least two options to ask the real estate agent to choose.',
          display: 'error',
        };
      }
      return {
        summary: `Asked the real estate agent to choose from ${options.length} options.`,
        data: {
          id: 'ask-options',
          options,
          ...(args.prompt ? { prompt: args.prompt } : {}),
          selectionMode: args.selectionMode ?? 'single',
          ...(args.minSelections != null ? { minSelections: args.minSelections } : {}),
          ...(args.maxSelections != null ? { maxSelections: args.maxSelections } : {}),
        },
        display: 'option-list',
      };
    }

    // mode === 'questions'
    const steps = args.steps ?? [];
    if (steps.length < 1) {
      return {
        summary: 'Need at least one step to ask the real estate agent.',
        display: 'error',
      };
    }
    return {
      summary: `Asked the real estate agent a ${steps.length}-step clarification.`,
      data: { id: 'ask-questions', steps },
      display: 'question-flow',
    };
  },
});
