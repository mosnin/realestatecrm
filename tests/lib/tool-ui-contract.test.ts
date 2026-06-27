/**
 * defineToolUiContract binds a zod schema + component name into the {schema,
 * parse, safeParse} contract every tool-UI component validates its props with.
 * parse() throws a component-named error on bad input (loud in dev), safeParse()
 * returns null (quiet during streaming). Pin that the factory wires both to the
 * given schema and surfaces the component name in the thrown error.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineToolUiContract } from '@/components/tool-ui/shared/contract';

const schema = z.object({ title: z.string(), count: z.number() });
const contract = defineToolUiContract('MyWidget', schema);

describe('defineToolUiContract', () => {
  it('exposes the schema it was built with', () => {
    expect(contract.schema).toBe(schema);
  });

  it('parse() returns typed data on valid input', () => {
    expect(contract.parse({ title: 'a', count: 2 })).toEqual({ title: 'a', count: 2 });
  });

  it('parse() throws a component-named error on invalid input', () => {
    expect(() => contract.parse({ title: 'a' })).toThrow(/Invalid MyWidget payload:/);
  });

  it('safeParse() returns data or null instead of throwing', () => {
    expect(contract.safeParse({ title: 'a', count: 2 })).toEqual({ title: 'a', count: 2 });
    expect(contract.safeParse({ title: 'a' })).toBeNull();
    expect(contract.safeParse(undefined)).toBeNull();
  });
});
