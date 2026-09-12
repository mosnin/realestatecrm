/**
 * Models often emit JSON-schema booleans as strings ("false") once a field
 * is marked required. OpenAI strict mode / the SDK then reject the call
 * before our handler runs, and the model starts narrating "JSON parsing
 * error" to the realtor. Coerce only fields the schema marks as boolean
 * so a string id of "1" is never turned into `true`.
 */

import { z } from 'zod';

/** Convert a loose scalar into a boolean when the intent is unambiguous. */
export function coerceBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === 'yes') return true;
  if (trimmed === 'false' || trimmed === 'no') return false;
  if (trimmed === '1') return true;
  if (trimmed === '0') return false;
  return undefined;
}

export function coerceToolArguments(input: unknown, schema?: z.ZodTypeAny): unknown {
  if (!schema) return input;
  return coerceAgainst(input, schema);
}

function coerceAgainst(input: unknown, schema: z.ZodTypeAny): unknown {
  // Strict provider schemas encode absent optional fields as null. Restore
  // absence only when the original schema allows it; required/null-invalid
  // fields must still fail original validation.
  if (input === null && schema.isOptional() && !schema.isNullable()) return undefined;
  const leaf = unwrap(schema);
  const type = readType(leaf);

  if (type === 'boolean') {
    return coerceBooleanValue(input) ?? input;
  }

  if (type === 'object' && input && typeof input === 'object' && !Array.isArray(input)) {
    const shape = readObjectShape(leaf);
    if (!shape) return input;
    const record = input as Record<string, unknown>;
    const out: Record<string, unknown> = { ...record };
    for (const [key, field] of Object.entries(shape)) {
      if (key in record) out[key] = coerceAgainst(record[key], field);
    }
    return out;
  }

  if (type === 'array' && Array.isArray(input)) {
    const element = readArrayElement(leaf);
    return element ? input.map((item) => coerceAgainst(item, element)) : input;
  }

  if (type === 'union') {
    const options = readUnionOptions(leaf);
    if (options?.some((option) => readType(unwrap(option)) === 'boolean')) {
      return coerceBooleanValue(input) ?? input;
    }
  }

  return input;
}

function unwrap(field: z.ZodTypeAny): z.ZodTypeAny {
  let inner: z.ZodTypeAny = field;
  while (true) {
    const t = readType(inner);
    if (t === 'optional' || t === 'default' || t === 'nullable' || t === 'prefault') {
      const next = readInnerType(inner);
      if (!next) break;
      inner = next;
      continue;
    }
    break;
  }
  return inner;
}

function readType(field: z.ZodTypeAny): string | undefined {
  return (field as unknown as { _def?: { type?: string } })._def?.type;
}

function readInnerType(field: z.ZodTypeAny): z.ZodTypeAny | undefined {
  return (field as unknown as { _def?: { innerType?: z.ZodTypeAny } })._def?.innerType;
}

function readObjectShape(field: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  const shape = (field as z.ZodObject<z.ZodRawShape>).shape;
  if (!shape || typeof shape !== 'object') return undefined;
  return { ...(shape as Record<string, z.ZodTypeAny>) };
}

function readArrayElement(field: z.ZodTypeAny): z.ZodTypeAny | undefined {
  const def = (field as unknown as { _def?: { element?: z.ZodTypeAny; type?: z.ZodTypeAny } })._def;
  return def?.element ?? (def?.type && readType(def.type as z.ZodTypeAny) ? def.type : undefined);
}

function readUnionOptions(field: z.ZodTypeAny): z.ZodTypeAny[] | undefined {
  return (field as unknown as { _def?: { options?: z.ZodTypeAny[] } })._def?.options;
}
