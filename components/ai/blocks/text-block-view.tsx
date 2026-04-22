'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { TextBlock } from '@/lib/ai-tools/blocks';

/** Render `**bold**` + `*italic*` inline. Matches the existing MessageBubble. */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[0].startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[2]}
        </strong>,
      );
    } else {
      parts.push(<em key={key++}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

interface TextBlockViewProps {
  block: TextBlock;
  /** Whether the text is still streaming — shows a pulsing caret. */
  streaming?: boolean;
  /** Whether this is the user's turn or the assistant's. */
  role?: 'user' | 'assistant';
  className?: string;
}

export function TextBlockView({
  block,
  streaming,
  role = 'assistant',
  className,
}: TextBlockViewProps) {
  const lines = block.content.split('\n');

  if (role === 'user') {
    return (
      <div className={cn('flex justify-end', className)}>
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">
          <p className="whitespace-pre-wrap leading-relaxed">
            {lines.map((line, i) => (
              <Fragment key={i}>
                {renderInline(line)}
                {i < lines.length - 1 && '\n'}
              </Fragment>
            ))}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('text-sm text-foreground leading-relaxed whitespace-pre-wrap', className)}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {renderInline(line)}
          {i < lines.length - 1 && '\n'}
        </Fragment>
      ))}
      {streaming && (
        <span
          aria-hidden
          className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-foreground/60 animate-pulse"
        />
      )}
    </div>
  );
}
