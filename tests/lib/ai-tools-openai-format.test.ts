import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '@/lib/ai-tools/types';
import { toolToOpenAIFormat, allToolsForOpenAI } from '@/lib/ai-tools/openai-format';
import { searchContactsTool } from '@/lib/ai-tools/tools/search-contacts';

describe('toolToOpenAIFormat', () => {
  it('wraps a tool in the {type: "function", function: {...}} envelope', () => {
    const out = toolToOpenAIFormat(searchContactsTool);
    expect(out.type).toBe('function');
    expect(out.function.name).toBe('search_contacts');
    expect(out.function.description).toBeTruthy();
  });

  it('emits a JSON-schema object for parameters', () => {
    const out = toolToOpenAIFormat(searchContactsTool);
    expect(out.function.parameters.type).toBe('object');
    expect(typeof out.function.parameters.properties).toBe('object');
  });

  it('strips the $schema key — OpenAI rejects it', () => {
    const out = toolToOpenAIFormat(searchContactsTool);
    expect(out.function.parameters.$schema).toBeUndefined();
  });

  it('renders enums and optional fields accurately', () => {
    const tool = defineTool({
      name: 'test_enum',
      description: 't',
      parameters: z.object({
        tier: z.enum(['hot', 'warm', 'cold']),
        note: z.string().optional(),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: '' }),
    });
    const out = toolToOpenAIFormat(tool);
    const props = out.function.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.tier).toMatchObject({ enum: ['hot', 'warm', 'cold'] });
    // Required list should include the non-optional field.
    expect(out.function.parameters.required).toEqual(['tier']);
  });

  it('rejects schemas that would emit $refs / $defs', () => {
    // A recursive schema — zod emits $defs and $ref to itself.
    interface Tree {
      name: string;
      children: Tree[];
    }
    const treeSchema: z.ZodType<Tree> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(treeSchema) }),
    );
    const tool = defineTool({
      name: 'recursive_bad',
      description: 't',
      parameters: treeSchema as unknown as z.ZodObject<z.ZodRawShape>,
      requiresApproval: false,
      handler: async () => ({ summary: '' }),
    });
    expect(() => toolToOpenAIFormat(tool)).toThrow(/recursive/i);
  });
});

describe('allToolsForOpenAI', () => {
  it('maps every tool through the converter', () => {
    const list = allToolsForOpenAI([searchContactsTool]);
    expect(list).toHaveLength(1);
    expect(list[0].function.name).toBe('search_contacts');
  });
});
