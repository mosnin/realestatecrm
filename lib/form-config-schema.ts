/**
 * Zod validation schema for the dynamic form builder IntakeFormConfig.
 *
 * Validates:
 *   - At least one section with at least one question
 *   - System fields (name, email, phone) present and required
 *   - Unique question IDs across all sections
 *   - Valid non-negative positions
 *   - Options required for select/radio/multi_select types
 *   - visibleWhen references valid questionIds
 */

import { z } from 'zod';

// ── Question option ───────────────────────────────────────────────────────────

const formOptionSchema = z.object({
  value: z.string().min(1, 'Option value is required'),
  label: z.string().min(1, 'Option label is required'),
  scoreValue: z.number().optional(),
});

// ── Validation rules ──────────────────────────────────────────────────────────

const validationSchema = z.object({
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
}).optional();

// ── Scoring rules ─────────────────────────────────────────────────────────────

const scoringSchema = z.object({
  weight: z.number().min(0).max(100),
  mappings: z.array(z.object({
    value: z.string(),
    points: z.number(),
  })).optional(),
}).optional();

// ── Conditional visibility ────────────────────────────────────────────────────

const visibleWhenSchema = z.object({
  questionId: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'contains']),
  value: z.string(),
}).optional();

// ── Question types ────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  'text', 'textarea', 'email', 'phone', 'number',
  'select', 'multi_select', 'radio', 'checkbox', 'date',
] as const;

const TYPES_REQUIRING_OPTIONS = ['select', 'multi_select', 'radio'] as const;

// ── Form question ─────────────────────────────────────────────────────────────

const formQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.enum(QUESTION_TYPES),
  label: z.string().min(1, 'Question label is required').max(500),
  description: z.string().max(1000).optional(),
  placeholder: z.string().max(500).optional(),
  required: z.boolean(),
  position: z.number().int().nonnegative(),
  system: z.boolean().optional(),
  options: z.array(formOptionSchema).optional(),
  validation: validationSchema,
  scoring: scoringSchema,
  visibleWhen: visibleWhenSchema,
});

// ── Form section ──────────────────────────────────────────────────────────────

const formSectionSchema = z.object({
  id: z.string().min(1, 'Section ID is required'),
  title: z.string().min(1, 'Section title is required').max(200),
  description: z.string().max(1000).optional(),
  position: z.number().int().nonnegative(),
  questions: z.array(formQuestionSchema).min(1, 'Each section must have at least one question'),
});

// ── Full form config ──────────────────────────────────────────────────────────

export const formConfigSchema = z
  .object({
    version: z.number().int().positive(),
    leadType: z.enum(['rental', 'buyer', 'general']),
    sections: z.array(formSectionSchema).min(1, 'At least one section is required'),
  })
  .superRefine((config, ctx) => {
    // Collect all question IDs and check for duplicates
    const allQuestionIds = new Set<string>();
    const allQuestions: z.infer<typeof formQuestionSchema>[] = [];

    for (const section of config.sections) {
      for (const question of section.questions) {
        if (allQuestionIds.has(question.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate question ID: "${question.id}"`,
            path: ['sections'],
          });
        }
        allQuestionIds.add(question.id);
        allQuestions.push(question);
      }
    }

    // Ensure system fields exist and are required
    const systemFields = [
      { id: 'name', label: 'name' },
      { id: 'email', label: 'email' },
      { id: 'phone', label: 'phone' },
    ];

    for (const field of systemFields) {
      const systemQuestion = allQuestions.find(
        (q) => q.id === field.id && q.system === true,
      );
      if (!systemQuestion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System field "${field.id}" must be present with system: true`,
          path: ['sections'],
        });
      } else if (!systemQuestion.required) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System field "${field.id}" must be required`,
          path: ['sections'],
        });
      }
    }

    // Ensure options exist for select/radio/multi_select types
    for (const question of allQuestions) {
      if (
        (TYPES_REQUIRING_OPTIONS as readonly string[]).includes(question.type) &&
        (!question.options || question.options.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Question "${question.id}" (type: ${question.type}) must have at least one option`,
          path: ['sections'],
        });
      }
    }

    // Validate visibleWhen references valid questionIds
    for (const question of allQuestions) {
      if (question.visibleWhen) {
        if (!allQuestionIds.has(question.visibleWhen.questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question "${question.id}" visibleWhen references unknown questionId "${question.visibleWhen.questionId}"`,
            path: ['sections'],
          });
        }
        // Prevent self-reference
        if (question.visibleWhen.questionId === question.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question "${question.id}" visibleWhen cannot reference itself`,
            path: ['sections'],
          });
        }
      }
    }
  });

export type IntakeFormConfig = z.infer<typeof formConfigSchema>;

export type FormSection = IntakeFormConfig['sections'][number];
export type FormQuestion = FormSection['questions'][number];
