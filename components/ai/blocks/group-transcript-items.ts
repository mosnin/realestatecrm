import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';
import { isSubagentTool } from './subagent-block-view';

export type TranscriptRenderItem =
  | { kind: 'text'; block: Extract<MessageBlock, { type: 'text' }>; originalIndex: number }
  | { kind: 'permission'; block: Extract<MessageBlock, { type: 'permission' }> }
  | { kind: 'reasoning'; block: Extract<MessageBlock, { type: 'reasoning' }> }
  | { kind: 'tool-group'; blocks: ToolCallBlock[]; groupId: string }
  | { kind: 'subagent'; block: ToolCallBlock }
  | { kind: 'subagent-task'; block: Extract<MessageBlock, { type: 'subagent_task' }> }
  | { kind: 'work-session'; block: Extract<MessageBlock, { type: 'work_session' }> }
  | {
      kind: 'attachments';
      blocks: Array<Extract<MessageBlock, { type: 'attachment' }>>;
      groupId: string;
    };

function isToolProcessNarration(content: string): boolean {
  const text = content.trim();
  return /^(?:let me\s+(?:try|retry|check|call|look|pull|find|get|use|see)\b|i\s+(?:need to|see the issue)\b|i(?:'ll| will)\s+(?:try|retry|check|call|look|pull|find|get|use)\b)/i.test(text);
}

/**
 * Fold every non-subagent tool call in a turn into one dropdown, even when
 * the model typed between retries. Subagents stay on their own row.
 * Workbench cards without an opener are omitted so a rolled-back flag
 * cannot advertise an inert control.
 */
export function groupTranscriptItems(
  blocks: MessageBlock[],
  opts: { hideWorkbench?: boolean } = {},
): TranscriptRenderItem[] {
  // Tool-adjacent text before the final tool call is internal progress, not a
  // user-facing answer. Models sometimes narrate retries ("let me try again")
  // between failed calls; rendering each fragment made one assistant turn look
  // like several repetitive messages. Keep the compact tool disclosure, but
  // only render text produced after the final ordinary tool call.
  let finalOrdinaryToolIndex = -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (
      block.type === 'tool_call'
      && !isSubagentTool(block.name)
      && !(opts.hideWorkbench && block.display === 'workbench')
    ) {
      finalOrdinaryToolIndex = i;
    }
  }
  const groupedTools = blocks.filter((block): block is ToolCallBlock => {
    if (block.type !== 'tool_call') return false;
    if (isSubagentTool(block.name)) return false;
    if (opts.hideWorkbench && block.display === 'workbench') return false;
    return true;
  });

  const items: TranscriptRenderItem[] = [];
  let emittedToolGroup = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'reasoning') {
      items.push({ kind: 'reasoning', block });
      continue;
    }
    if (block.type === 'attachment') {
      const run: Array<Extract<MessageBlock, { type: 'attachment' }>> = [block];
      while (i + 1 < blocks.length && blocks[i + 1].type === 'attachment') {
        run.push(blocks[i + 1] as Extract<MessageBlock, { type: 'attachment' }>);
        i++;
      }
      items.push({ kind: 'attachments', blocks: run, groupId: `att-${run[0].id}` });
      continue;
    }
    if (block.type === 'subagent_task') {
      items.push({ kind: 'subagent-task', block });
      continue;
    }
    if (block.type === 'work_session') {
      items.push({ kind: 'work-session', block });
      continue;
    }
    if (block.type === 'tool_call') {
      if (isSubagentTool(block.name)) {
        items.push({ kind: 'subagent', block });
        continue;
      }
      if (opts.hideWorkbench && block.display === 'workbench') continue;
      if (!emittedToolGroup && groupedTools.length > 0) {
        items.push({
          kind: 'tool-group',
          blocks: groupedTools,
          groupId: `group-${groupedTools[0].callId}`,
        });
        emittedToolGroup = true;
      }
      continue;
    }
    if (block.type === 'text') {
      if (finalOrdinaryToolIndex >= 0 && i < finalOrdinaryToolIndex) continue;
      // A provider can exhaust its tool budget immediately after emitting a
      // retry preamble. That preamble is not an answer and must not become the
      // last thing the user sees ("let me try again", "I need to check...").
      if (finalOrdinaryToolIndex >= 0 && isToolProcessNarration(block.content)) continue;
      items.push({ kind: 'text', block, originalIndex: i });
    } else if (block.type === 'permission') {
      items.push({ kind: 'permission', block });
    }
  }

  return items;
}
