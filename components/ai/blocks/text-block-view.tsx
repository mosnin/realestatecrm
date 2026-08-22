'use client';

import { cn } from '@/lib/utils';
import type { TextBlock } from '@/lib/ai-tools/blocks';
import { Markdown, Message, MessageContent } from '@/components/ai/prompt-kit';
import {
  StreamingResponse,
  type StreamingResponseCollapseOptions,
} from '@/components/ai/chat/streaming-response';
import type { ChatSource } from '@/components/ai/prompt-kit/source';

interface TextBlockViewProps {
  block: TextBlock;
  /** Whether the text is still streaming — shows a blinking caret. */
  streaming?: boolean;
  /** Whether this is the user's turn or the assistant's. */
  role?: 'user' | 'assistant';
  /** Stable markdown instance id, usually derived from the parent message id. */
  markdownId?: string;
  /** Optional, grounded source disclosure. No footer renders when omitted. */
  sources?: ChatSource[];
  /** Opt-in settled-message disclosure. Streaming content is never clamped. */
  collapse?: StreamingResponseCollapseOptions | false;
  /** Plays only when this stable text row first mounts. */
  animateIn?: boolean;
  /** Set false if a surrounding transcript log already announces this text. */
  announce?: boolean;
  className?: string;
}

export function TextBlockView({
  block,
  streaming,
  role = 'assistant',
  markdownId,
  sources,
  collapse = false,
  animateIn = false,
  announce = true,
  className,
}: TextBlockViewProps) {
  const markdown = (
    <Markdown id={markdownId ?? block.content.slice(0, 24)} streaming={streaming}>
      {block.content}
    </Markdown>
  );

  return (
    <Message role={role} animateIn={animateIn} className={className}>
      <MessageContent role={role}>
        {role === 'assistant' ? (
          <StreamingResponse
            status={streaming ? 'streaming' : 'complete'}
            sources={sources}
            collapse={collapse}
            announce={announce}
          >
            {markdown}
          </StreamingResponse>
        ) : (
          markdown
        )}
      </MessageContent>
    </Message>
  );
}
