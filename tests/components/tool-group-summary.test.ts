import { describe, expect, it } from 'vitest';
import { toolGroupOutcomeLabel } from '@/components/ai/blocks/tool-group-block-view';
import type { ToolCallBlock } from '@/lib/ai-tools/blocks';

function tool(
  name: string,
  status: ToolCallBlock['status'] = 'complete',
): ToolCallBlock {
  return {
    type: 'tool_call',
    callId: `${name}-${status}`,
    name,
    args: {},
    status,
  };
}

describe('tool group outcome label', () => {
  it('describes completed calls without claiming the enclosing Work task completed', () => {
    expect(toolGroupOutcomeLabel([
      tool('send_email'),
      tool('create_automation'),
    ])).toBe('2 calls completed');

    expect(toolGroupOutcomeLabel([
      tool('search_contacts'),
      tool('search_properties'),
      tool('find_stuck_deals'),
      tool('analyze_property_values'),
    ])).toBe('4 calls completed');
  });

  it('keeps successful partial work distinct from a failed call', () => {
    expect(toolGroupOutcomeLabel([
      tool('send_email'),
      tool('search_contacts', 'error'),
    ])).toBe('1 call completed · 1 failed');
  });

  it('keeps a long mixed-status group bounded for narrow chat columns', () => {
    const label = toolGroupOutcomeLabel([
      tool('search_every_matching_property_across_all_connected_listing_sources'),
      tool('analyze_every_nearby_property_value_with_full_market_context'),
      tool('create_an_extremely_detailed_follow_up_automation'),
      tool('send_a_long_personalized_email_to_every_qualified_lead', 'error'),
      tool('schedule_every_requested_property_tour', 'denied'),
    ]);

    expect(label).toBe('3 calls completed · 1 failed · 1 skipped');
    expect(label.length).toBeLessThan(48);
    expect(label).not.toMatch(/property|automation|email|tour/i);
  });
});
