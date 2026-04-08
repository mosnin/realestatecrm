/**
 * Dynamic Prompt Builder for AI Lead Scoring
 *
 * Builds a token-efficient scoring prompt from an IntakeFormConfig + answers.
 * The prompt is structured so GPT-4o-mini can evaluate lead quality
 * from arbitrary form questions without prior knowledge of the form schema.
 */

import type { IntakeFormConfig, FormQuestion } from '@/lib/types';

type Answers = Record<string, string | string[] | number | boolean>;

/** Sanitize user-provided text before embedding in scoring prompt. */
function sanitizePromptText(text: string): string {
  return text
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Build a scoring prompt from a dynamic form config and answers.
 *
 * Output format:
 *   Lead type: RENTAL
 *   Base score from rules: 72/100
 *
 *   === Personal Information ===
 *   Q: Full name [weight: 2]
 *   A: John Smith
 *
 *   Q: Monthly income [weight: 8]
 *   A: $5,000
 *
 *   Q: Move-in date [weight: 6]
 *   A: (not answered) — optional
 */
export function buildDynamicScoringPrompt(input: {
  formConfig: IntakeFormConfig;
  answers: Answers;
  deterministicScore: number | null;
}): string {
  const { formConfig, answers, deterministicScore } = input;
  const lines: string[] = [];

  lines.push(`Lead type: ${formConfig.leadType.toUpperCase()}`);
  if (deterministicScore !== null) {
    lines.push(`Deterministic rule-based score: ${deterministicScore}/100`);
  }
  lines.push('');

  // Sort sections by position
  const sortedSections = [...formConfig.sections].sort((a, b) => a.position - b.position);

  for (const section of sortedSections) {
    lines.push(`=== ${sanitizePromptText(section.title)} ===`);

    // Sort questions by position
    const sortedQuestions = [...section.questions].sort((a, b) => a.position - b.position);

    for (const question of sortedQuestions) {
      const weight = question.scoring?.weight;
      const weightLabel = weight != null && weight > 0 ? ` [weight: ${weight}]` : '';

      lines.push(`Q: ${sanitizePromptText(question.label)}${weightLabel}`);

      const answer = answers[question.id];
      const formatted = formatAnswer(question, answer);

      if (formatted !== null) {
        lines.push(`A: ${sanitizePromptText(formatted)}`);
      } else if (question.required) {
        lines.push('A: (not answered) -- required but missing');
      } else {
        lines.push('A: (not answered) -- optional');
      }

      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

/**
 * Build the system prompt for dynamic form scoring.
 */
export function buildDynamicSystemPrompt(input: {
  leadType: string;
  hasDeterministicScore: boolean;
}): string {
  const { leadType, hasDeterministicScore } = input;

  const parts: string[] = [
    `You are scoring a real estate lead (${leadType}) from a custom intake form.`,
    'The form owner assigned scoring weights to each question (higher weight = more important).',
  ];

  if (hasDeterministicScore) {
    parts.push(
      'A deterministic score was already calculated from explicit answer-to-points mappings.',
      'Your job is to provide an independent AI assessment considering:',
    );
  } else {
    parts.push(
      'No explicit scoring rules were configured for this form.',
      'Evaluate the lead quality considering:',
    );
  }

  parts.push(
    '- Completeness of responses (are required questions answered?)',
    '- Consistency across answers (do income, budget, timeline align?)',
    '- Red flags (unrealistic claims, contradictions, very low engagement)',
    '- Weighted importance of each question',
    '',
    'Return a JSON object with:',
    '- leadScore: 0-100 integer (overall lead quality)',
    '- scoreLabel: "hot" (75-100), "warm" (45-74), or "cold" (0-44)',
    '- scoreSummary: concise 1-2 sentence summary (under 200 chars)',
    '- scoreDetails: { tags: string[] (2-4 short tags), strengths: string[], weaknesses: string[], riskFlags: string[] }',
  );

  return parts.join(' ');
}

/**
 * Format an answer value for the prompt based on question type.
 */
function formatAnswer(
  question: FormQuestion,
  answer: string | string[] | number | boolean | undefined,
): string | null {
  if (answer === undefined || answer === null || answer === '') {
    return null;
  }

  switch (question.type) {
    case 'multi_select': {
      if (Array.isArray(answer)) {
        // Map values to labels if options are available
        const labels = answer.map((val) => {
          const opt = question.options?.find((o) => o.value === val);
          return opt?.label ?? val;
        });
        return labels.join(', ');
      }
      return String(answer);
    }

    case 'select':
    case 'radio': {
      // Map value to label if available
      const opt = question.options?.find((o) => o.value === String(answer));
      return opt?.label ?? String(answer);
    }

    case 'checkbox':
      return Boolean(answer) ? 'Yes' : 'No';

    case 'number':
      return String(answer);

    case 'date':
      return String(answer);

    default:
      return String(answer);
  }
}
