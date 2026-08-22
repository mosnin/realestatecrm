import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { groupTranscriptItems } from '@/components/ai/blocks/group-transcript-items';
import { Transcript } from '@/components/ai/blocks/transcript';
import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';

function tool(
  name: string,
  status: ToolCallBlock['status'] = 'complete',
  extras: Partial<ToolCallBlock> = {},
): ToolCallBlock {
  return {
    type: 'tool_call',
    callId: extras.callId ?? `${name}-${status}-${Math.random().toString(16).slice(2)}`,
    name,
    args: extras.args ?? {},
    status,
    ...extras,
  };
}

describe('groupTranscriptItems', () => {
  it('folds tools into one dropdown, hides retry narration, and keeps the final answer', () => {
    const blocks: MessageBlock[] = [
      { type: 'text', content: 'Checking the book.' },
      tool('pipeline_summary', 'error', { callId: 'call_1' }),
      { type: 'text', content: 'Trying another lookup.' },
      tool('find_deal', 'complete', { callId: 'call_2' }),
      { type: 'text', content: 'I found the deal.' },
      tool('delegate_task', 'complete', { callId: 'call_sub' }),
    ];

    const items = groupTranscriptItems(blocks);
    expect(items.map((item) => item.kind)).toEqual([
      'tool-group',
      'text',
      'subagent',
    ]);
    expect(items.find((item) => item.kind === 'text')).toMatchObject({
      kind: 'text',
      block: { content: 'I found the deal.' },
    });
    const group = items.find((item) => item.kind === 'tool-group');
    expect(group?.kind === 'tool-group' && group.blocks.map((b) => b.name)).toEqual([
      'pipeline_summary',
      'find_deal',
    ]);
  });

  it('groups a single tool instead of rendering a full card row', () => {
    const items = groupTranscriptItems([tool('workspace_stats', 'complete', { callId: 'call_stats' })]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('tool-group');
  });

  it('does not end a failed tool turn with retry narration', () => {
    const retryPreambles = [
      'Let me try that again with the correct parameters.',
      'I need to provide all the required parameters.',
      'I see the issue. Let me call it properly.',
      "I'll get the details on your newest leads.",
    ];

    for (const content of retryPreambles) {
      const items = groupTranscriptItems([
        tool('find_deal', 'error', { callId: `failed-${content}` }),
        { type: 'text', content },
      ]);
      expect(items.map((item) => item.kind)).toEqual(['tool-group']);
    }
  });

  it('omits workbench tools when the opener is rolled back', () => {
    const items = groupTranscriptItems(
      [tool('open_spreadsheet_in_workbench', 'complete', { display: 'workbench', callId: 'wb' })],
      { hideWorkbench: true },
    );
    expect(items).toEqual([]);
  });

  it('keeps a work session on its own row next to the tool dropdown', () => {
    const items = groupTranscriptItems([
      { type: 'work_session', sessionId: 'sess_1', goal: 'Write the report', source: 'voice' },
      tool('find_deal', 'complete', { callId: 'deal_1' }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['work-session', 'tool-group']);
  });
});

describe('Transcript tool grouping', () => {
  it('renders one grouped disclosure for tools split by assistant text', () => {
    vi.stubGlobal('React', React);
    try {
      const html = renderToStaticMarkup(createElement(Transcript, {
        role: 'assistant',
        blocks: [
          { type: 'text', content: 'Looking that up.' },
          tool('pipeline_summary', 'error', { callId: 'p1' }),
          { type: 'text', content: 'Trying again.' },
          tool('pipeline_summary', 'error', { callId: 'p2' }),
          tool('find_deal', 'complete', { callId: 'd1' }),
        ],
      }));

      expect(html).toContain('data-steps-count="2"');
      expect(html.match(/data-steps-state=/g)).toHaveLength(1);
      expect(html).not.toContain('data-beui-surface="tool-result"');
      expect(html).not.toContain('JSON parsing');
      expect(html).not.toMatch(/>failed</i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
