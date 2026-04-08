import { z } from 'zod';
import type {
  IntakeFormConfig,
  FormQuestion,
  FormSubmission,
} from '@/lib/types';

/**
 * Dynamically builds a Zod validation schema from an IntakeFormConfig.
 * Each question in the form becomes a field in the schema, keyed by question ID.
 * Respects the question's type, required flag, and validation settings.
 */
export function buildDynamicApplicationSchema(config: IntakeFormConfig) {
  const allQuestions = config.sections.flatMap((s) => s.questions);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const question of allQuestions) {
    shape[question.id] = buildFieldSchema(question);
  }

  return z.object(shape);
}

/**
 * Builds a Zod schema for a single form question based on its type and validation config.
 */
function buildFieldSchema(question: FormQuestion): z.ZodTypeAny {
  const v = question.validation;

  switch (question.type) {
    case 'text':
    case 'textarea':
    case 'phone': {
      let schema = z.string().trim();
      if (v?.minLength != null) schema = schema.min(v.minLength);
      if (v?.maxLength != null) schema = schema.max(v.maxLength);
      if (v?.pattern) schema = schema.regex(new RegExp(v.pattern));
      if (question.type === 'textarea' && !v?.maxLength) {
        schema = schema.max(4000);
      }
      if (question.required) return schema.min(1, `${question.label} is required`);
      return schema.optional().or(z.literal('')).transform((val) => val || undefined);
    }

    case 'email': {
      let schema = z.string().trim().email('Invalid email address');
      if (v?.maxLength != null) schema = schema.max(v.maxLength);
      if (question.required) return schema.min(1, `${question.label} is required`);
      return schema.optional().or(z.literal('')).transform((val) => val || undefined);
    }

    case 'number': {
      const numSchema = z
        .union([z.number(), z.string(), z.null(), z.undefined()])
        .transform((val) => {
          if (val == null || val === '') return undefined;
          if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
          const parsed = Number(String(val).trim());
          return Number.isFinite(parsed) ? parsed : undefined;
        });

      if (question.required) {
        return numSchema.refine((val) => val != null, {
          message: `${question.label} is required`,
        });
      }
      return numSchema;
    }

    case 'date': {
      let schema = z.string().trim();
      if (question.required) return schema.min(1, `${question.label} is required`);
      return schema.optional().or(z.literal('')).transform((val) => val || undefined);
    }

    case 'select':
    case 'radio': {
      const validValues = question.options?.map((o) => o.value) ?? [];
      if (validValues.length > 0) {
        const schema = z.string().refine(
          (val) => !val || validValues.includes(val),
          { message: `Invalid option for ${question.label}` }
        );
        if (question.required) {
          return schema.refine((val) => !!val, {
            message: `${question.label} is required`,
          });
        }
        return schema.optional().or(z.literal('')).transform((val) => val || undefined);
      }
      // No options defined — treat as free text
      const fallback = z.string().trim();
      if (question.required) return fallback.min(1, `${question.label} is required`);
      return fallback.optional().or(z.literal('')).transform((val) => val || undefined);
    }

    case 'multi_select': {
      const validValues = question.options?.map((o) => o.value) ?? [];
      // Accept both comma-separated strings and arrays
      const schema = z
        .union([z.string(), z.array(z.string())])
        .transform((val) => {
          if (Array.isArray(val)) return val.filter(Boolean);
          if (typeof val === 'string' && val.trim()) {
            return val.split(',').map((s) => s.trim()).filter(Boolean);
          }
          return [];
        });

      if (validValues.length > 0) {
        const validated = schema.refine(
          (arr) => arr.every((v) => validValues.includes(v)),
          { message: `Invalid option(s) for ${question.label}` }
        );
        if (question.required) {
          return validated.refine((arr) => arr.length > 0, {
            message: `${question.label} requires at least one selection`,
          });
        }
        return validated;
      }
      if (question.required) {
        return schema.refine((arr) => arr.length > 0, {
          message: `${question.label} requires at least one selection`,
        });
      }
      return schema;
    }

    case 'checkbox': {
      const schema = z
        .union([z.boolean(), z.string(), z.null(), z.undefined()])
        .transform((val) => {
          if (val == null || val === '') return undefined;
          if (typeof val === 'boolean') return val;
          return val === 'true' || val === '1';
        });

      if (question.required) {
        return schema.refine((val) => val === true, {
          message: `${question.label} must be checked`,
        });
      }
      return schema;
    }

    default: {
      // Unknown type — accept any string
      const fallback = z.string().trim();
      if (question.required) return fallback.min(1, `${question.label} is required`);
      return fallback.optional().or(z.literal('')).transform((val) => val || undefined);
    }
  }
}

/**
 * Structures submission data from raw answers into the FormSubmission format.
 * Includes the frozen form config snapshot and version for future reference.
 */
export function buildDynamicApplicationData(
  config: IntakeFormConfig,
  answers: Record<string, unknown>
): FormSubmission {
  const allQuestions = config.sections.flatMap((s) => s.questions);
  const cleanedAnswers: Record<string, string | string[] | number | boolean> = {};

  for (const question of allQuestions) {
    const rawValue = answers[question.id];
    if (rawValue == null || rawValue === '' || rawValue === undefined) continue;

    // Normalize the value based on question type
    switch (question.type) {
      case 'number': {
        const num =
          typeof rawValue === 'number'
            ? rawValue
            : Number(String(rawValue).trim());
        if (Number.isFinite(num)) {
          cleanedAnswers[question.id] = num;
        }
        break;
      }
      case 'checkbox': {
        if (typeof rawValue === 'boolean') {
          cleanedAnswers[question.id] = rawValue;
        } else if (typeof rawValue === 'string') {
          cleanedAnswers[question.id] =
            rawValue === 'true' || rawValue === '1';
        }
        break;
      }
      case 'multi_select': {
        if (Array.isArray(rawValue)) {
          cleanedAnswers[question.id] = rawValue.map(String);
        } else if (typeof rawValue === 'string' && rawValue.trim()) {
          cleanedAnswers[question.id] = rawValue
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        break;
      }
      default: {
        cleanedAnswers[question.id] = String(rawValue);
        break;
      }
    }
  }

  // Deep clone config for snapshot (frozen copy)
  const snapshot: IntakeFormConfig = JSON.parse(JSON.stringify(config));

  return {
    formConfigVersion: config.version,
    formConfigSnapshot: snapshot,
    answers: cleanedAnswers,
  };
}
