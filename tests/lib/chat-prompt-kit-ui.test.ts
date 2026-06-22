import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

describe('chat Prompt Kit UI phases', () => {
  it('phase 1 renders chat text through Message and Markdown primitives', () => {
    const textBlock = read('components/ai/blocks/text-block-view.tsx');
    expect(textBlock).toContain("import { Markdown, Message, MessageContent } from '@/components/ai/prompt-kit'");
    expect(textBlock).toContain('<Message role={role}');
    expect(textBlock).toContain('<Markdown id={markdownId ?? block.content.slice(0, 24)} streaming={streaming}>');
    const transcript = read('components/ai/blocks/transcript.tsx');
    expect(transcript).toContain('messageId?: string');
    expect(transcript).toContain('markdownId={messageId ? `${messageId}-${item.originalIndex}` : undefined}');
  });

  it('phase 2 uses ThinkingBar with the blinking-text indicator (no pulsing dot)', () => {
    const thinkingIndicator = read('components/ai/blocks/thinking-indicator.tsx');
    const thinkingBar = read('components/ai/prompt-kit/thinking-bar.tsx');
    expect(thinkingIndicator).toContain("ThinkingBar } from '@/components/ai/prompt-kit'");
    expect(thinkingIndicator).toContain('<ThinkingBar label={action} />');
    // The thinking label IS the indicator — a blinking text line, not a dot.
    expect(thinkingBar).toContain('<TextBlink');
    expect(thinkingBar).not.toContain('animate-ping');
  });

  it('phase 3 uses SystemMessage for the usage-limit state', () => {
    const workspace = read('components/chippi/chippi-workspace.tsx');
    expect(workspace).toContain("import { SystemMessage } from '@/components/ai/prompt-kit'");
    expect(workspace).toContain('<SystemMessage');
    expect(workspace).toContain('heading="You\'ve reached the 50-message limit for this conversation."');
  });

  it('phase 4 renders tool calls and grouped tool runs through Tool and Steps primitives', () => {
    const toolCall = read('components/ai/blocks/tool-call-block-view.tsx');
    const toolGroup = read('components/ai/blocks/tool-group-block-view.tsx');
    const promptKitIndex = read('components/ai/prompt-kit/index.ts');

    expect(promptKitIndex).toContain("export { Tool, ToolStatus, type ToolState } from './tool';");
    expect(promptKitIndex).toContain("export { Steps } from './steps';");
    expect(toolCall).toContain("import { Tool, ToolStatus, type ToolState } from '@/components/ai/prompt-kit'");
    expect(toolCall).toContain('<Tool state={status}>');
    expect(toolCall).toContain('<ToolStatus state={status} label={label} icon={iconEl}');
    expect(toolGroup).toContain("import { Steps } from '@/components/ai/prompt-kit';");
    expect(toolGroup).toContain('<Steps state={state} count={blocks.length}>');
  });

  it('phase 5 provides source primitives without wiring unscoped source rendering into transcripts', () => {
    const promptKitIndex = read('components/ai/prompt-kit/index.ts');
    const source = read('components/ai/prompt-kit/source.tsx');
    const transcript = read('components/ai/blocks/transcript.tsx');

    expect(promptKitIndex).toContain("export { Source, SourceList, type ChatSource, type ChatSourceKind } from './source';");
    expect(source).toContain("export type ChatSourceKind = 'contact' | 'deal' | 'property' | 'document' | 'brokerage' | 'web' | 'other';");
    expect(source).toContain('export function SourceList');
    expect(transcript).not.toContain('SourceList');
  });


  it('sanitizes source links before rendering anchors', () => {
    const source = read('components/ai/prompt-kit/source.tsx');
    expect(source).toContain("import { cn, safeHref } from '@/lib/utils';");
    expect(source).toContain('const href = safeHref(source.url);');
    expect(source).toContain('if (hasSafeHref)');
    expect(source).toContain("rel={rel ?? 'noreferrer'}");
  });

  it('phase 6 renders reasoning through Reasoning and ChainOfThought primitives', () => {
    const promptKitIndex = read('components/ai/prompt-kit/index.ts');
    const reasoningBlock = read('components/ai/blocks/reasoning-block-view.tsx');
    const thinkingIndicator = read('components/ai/blocks/thinking-indicator.tsx');

    expect(promptKitIndex).toContain("export { ChainOfThought } from './chain-of-thought';");
    expect(promptKitIndex).toContain("export { Reasoning, ReasoningTrigger } from './reasoning';");
    expect(reasoningBlock).toContain("import { ChainOfThought, Reasoning, ReasoningTrigger } from '@/components/ai/prompt-kit';");
    expect(reasoningBlock).toContain('<Reasoning open={expanded}>');
    expect(reasoningBlock).toContain('<ChainOfThought content={block.content} streaming={streaming}');
    expect(thinkingIndicator).toContain("import { ChainOfThought, ThinkingBar } from '@/components/ai/prompt-kit';");
    expect(thinkingIndicator).toContain("content={streamingReasoning ?? ''}");
  });
});
