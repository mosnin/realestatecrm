'use client';

import { cn } from '@/lib/utils';
import type { TextBlock } from '@/lib/ai-tools/blocks';
import { Markdown, Message, MessageContent } from '@/components/ai/prompt-kit';

interface TextBlockViewProps {
  block: TextBlock;
  /** Whether the text is still streaming — shows a blinking caret. */
  streaming?: boolean;
  /** Whether this is the user's turn or the assistant's. */
  role?: 'user' | 'assistant';
  /** Stable markdown instance id, usually derived from the parent message id. */
  markdownId?: string;
  className?: string;
}

export function TextBlockView({
  block,
  streaming,
  role = 'assistant',
  markdownId,
  className,
}: TextBlockViewProps) {
  return (
    <Message role={role} className={className}>
      <MessageContent
        role={role}
        aria-live={streaming ? 'polite' : undefined}
        aria-atomic={streaming ? false : undefined}
      >
        <Markdown id={markdownId ?? block.content.slice(0, 24)} streaming={streaming}>
          {block.content}
        </Markdown>
      </MessageContent>
    </Message>
  );
}
