/**
 * getSuggestionsForTurn picks the follow-up chip row shown after an assistant
 * turn, keyed off the LAST completed tool call. It must: default on empty/
 * pure-chat turns, skip incomplete/errored tool calls (no useful next-action),
 * return a known tool's curated set capped at 4, and fall back to the default
 * for an unknown tool. Pin those — wrong chips send the realtor down a dead end.
 */

import { describe, it, expect } from 'vitest';
import { getSuggestionsForTurn } from '@/lib/ai-tools/suggestions';

type Block = Parameters<typeof getSuggestionsForTurn>[0] extends (infer T)[] | null | undefined ? T : never;
const toolCall = (name: string, status = 'complete') => ({ type: 'tool_call', name, status }) as unknown as Block;
const text = () => ({ type: 'text', text: 'hi' }) as unknown as Block;

describe('getSuggestionsForTurn', () => {
  it('returns the default set for empty / nullish / pure-chat turns', () => {
    const def = getSuggestionsForTurn(null);
    expect(def.length).toBeGreaterThan(0);
    expect(getSuggestionsForTurn([])).toEqual(def);
    expect(getSuggestionsForTurn([text()])).toEqual(def); // no tool calls
  });

  it('returns the curated set for the last completed tool, capped at 4', () => {
    const out = getSuggestionsForTurn([toolCall('schedule_tour')]);
    expect(out).toEqual(['Send a confirmation', 'Add follow-up reminder']);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('keys off the LAST completed tool call when several fired', () => {
    const out = getSuggestionsForTurn([toolCall('search_contacts'), toolCall('draft_email')]);
    expect(out).toEqual(['Send it', 'Adjust the tone']); // draft_email, the last one
  });

  it('skips an incomplete/errored tool call and uses the prior completed one', () => {
    const out = getSuggestionsForTurn([toolCall('search_deals'), toolCall('draft_email', 'error')]);
    expect(out).toEqual(['Show stuck deals', 'Find overdue follow-ups']); // search_deals
  });

  it('falls back to the default for an unknown tool name', () => {
    const def = getSuggestionsForTurn(null);
    expect(getSuggestionsForTurn([toolCall('some_unmapped_tool')])).toEqual(def);
  });
});
