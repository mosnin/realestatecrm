import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { ActionCard, type CRMAction, type ActionResult } from './action-card';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  onAction?: (action: CRMAction) => Promise<ActionResult>;
}

// Match both <<ACTION>>...json...<</ACTION>> and <<ACTION>>...json...</ACTION>
// LLMs may output either format despite being told the double-bracket version.
const ACTION_REGEX = /<<ACTION>>([\s\S]*?)(?:<{2}\/ACTION>>|<\/ACTION>>?)/g;

/** Render inline markdown: **bold** and *italic* */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[0].startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    } else {
      parts.push(<em key={key++}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Convert a markdown string to React nodes, preserving newlines */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {renderInline(line)}
      {i < lines.length - 1 && '\n'}
    </Fragment>
  ));
}

/** Parse content into text segments and action blocks */
function parseContent(content: string): Array<{ type: 'text'; value: string } | { type: 'action'; value: CRMAction }> {
  const parts: Array<{ type: 'text'; value: string } | { type: 'action'; value: CRMAction }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(ACTION_REGEX.source, 'g');

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    try {
      const action = JSON.parse(match[1].trim()) as CRMAction;
      if (action.type && action.id && action.changes) {
        parts.push({ type: 'action', value: action });
      } else {
        parts.push({ type: 'text', value: match[0] });
      }
    } catch {
      parts.push({ type: 'text', value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}

export function MessageBubble({ role, content, onAction }: MessageBubbleProps) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap bg-primary text-primary-foreground rounded-br-sm">
          {content}
        </div>
      </div>
    );
  }

  const parts = parseContent(content);
  const hasActions = parts.some((p) => p.type === 'action');

  if (!hasActions) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap bg-muted text-foreground rounded-bl-sm">
          {renderMarkdown(content)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            part.value.trim() ? (
              <div key={i} className="rounded-lg px-4 py-3 text-sm whitespace-pre-wrap bg-muted text-foreground rounded-bl-sm">
                {renderMarkdown(part.value.trim())}
              </div>
            ) : null
          ) : (
            <ActionCard
              key={i}
              action={part.value}
              onApprove={onAction ?? (async () => ({ ok: false, error: 'No action handler' }))}
            />
          )
        )}
      </div>
    </div>
  );
}
