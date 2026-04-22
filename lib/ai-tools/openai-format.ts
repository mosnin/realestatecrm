/**
 * Converts our internal ToolDefinition (zod-based) into the shape OpenAI's
 * function-calling API expects. Centralised here so neither the loop nor
 * the tool files need to know what the wire format looks like.
 *
 * Zod v4 ships a native `z.toJSONSchema()`; we call through to it but fall
 * back with a clear runtime error if the running zod doesn't expose it.
 * Either way, we strip the `$schema` key OpenAI doesn't want.
 */

import { z } from 'zod';
import type { ToolDefinition } from './types';

export interface OpenAIToolFormat {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Best-effort access to zod v4's built-in JSON-schema converter without
 * making the call site dependent on a specific minor version's typing.
 * Keeps this module portable across small zod upgrades.
 */
function toJSONSchema(schema: z.ZodType): Record<string, unknown> {
  const zAny = z as unknown as {
    toJSONSchema?: (s: z.ZodType, opts?: unknown) => Record<string, unknown>;
  };
  if (typeof zAny.toJSONSchema !== 'function') {
    throw new Error(
      'zod.toJSONSchema is not available. Zod v4+ is required; pin ^4.0.0 in package.json.',
    );
  }
  // "target: openai" lives in some zod builds; pass it as a hint. Safe to
  // ignore if the running version ignores the option.
  return zAny.toJSONSchema(schema, { target: 'openai' });
}

export function toolToOpenAIFormat(tool: ToolDefinition): OpenAIToolFormat {
  const parameters = toJSONSchema(tool.parameters);

  // OpenAI's function-calling API chokes on `$schema`; zod sometimes emits
  // it at the top level depending on the target.
  if ('$schema' in parameters) {
    delete (parameters as { $schema?: unknown }).$schema;
  }
  // Likewise `definitions` pointing at intra-schema $refs — the tools we
  // expose are flat objects, so any $defs reference is signal of a
  // recursive schema we don't want to send to a model anyway.
  if ('definitions' in parameters || '$defs' in parameters) {
    throw new Error(
      `Tool "${tool.name}" parameters contain recursive or referenced schemas, which aren't supported for model tool-calling. Flatten the shape.`,
    );
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
}

/** Bulk-convert the registry for the per-turn OpenAI request payload. */
export function allToolsForOpenAI(tools: ToolDefinition[]): OpenAIToolFormat[] {
  return tools.map(toolToOpenAIFormat);
}
