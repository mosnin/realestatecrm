import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import {
  UNATTENDED_READ_TOOL_NAMES,
  isUnattendedReadTool,
  unattendedReadTools,
} from '@/lib/agent/unattended-tool-policy';

describe('unattended tool policy', () => {
  it('returns exactly the explicit audited allowlist', () => {
    const tools = unattendedReadTools(ALL_TOOLS);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...UNATTENDED_READ_TOOL_NAMES].sort(),
    );
  });

  it.each([
    'attach_file_to_property',
    'delegate_task',
    'use_plugin',
    'send_email',
    'send_sms',
    'control_browser',
    'browser_task',
    'draft_email',
    'draft_sms',
  ])('does not grant %s to unattended work', (name) => {
    expect(isUnattendedReadTool(name)).toBe(false);
  });

  it('fails closed if an allowlisted tool drifts into mutation metadata', () => {
    const registry = ALL_TOOLS.map((tool) =>
      tool.name === 'find_person'
        ? ({ ...tool, requiresApproval: true, riskLevel: 'high' } as typeof tool)
        : tool,
    );
    expect(() => unattendedReadTools(registry)).toThrow(/non-read tool: find_person/);
  });
});
