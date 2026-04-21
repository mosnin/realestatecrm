import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { ActionCard, type CRMAction, type ActionResult } from './action-card';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  onAction?: (action: CRMAction) => Promise<ActionResult>;
  userAvatarUrl?: string | null;
  assistantAvatarUrl?: string;
}

// Combined regex to match both ACTION and APPLIED blocks
const BLOCK_REGEX = /<<(ACTION|APPLIED)>>([\s\S]*?)(?:<{2}\/\1>>|<\/\1>>?)/g;

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

type ParsedPart =
  | { type: 'text'; value: string }
  | { type: 'action'; value: CRMAction; applied: boolean };

/** Parse content into text segments and action blocks */
function parseContent(content: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(BLOCK_REGEX.source, 'g');

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const tag = match[1]; // "ACTION" or "APPLIED"
    const json = match[2];
    try {
      const action = JSON.parse(json.trim()) as CRMAction;
      if (action.type && action.id && action.changes) {
        parts.push({ type: 'action', value: action, applied: tag === 'APPLIED' });
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

export function MessageBubble({ role, content, onAction, userAvatarUrl, assistantAvatarUrl }: MessageBubbleProps) {
  const isUser = role === 'user';
  const userAvatarSrc = userAvatarUrl ?? null;
  const assistantAvatarSrc = assistantAvatarUrl ?? '/chip-avatar.png';

  const Avatar = ({ src, alt, fallback }: { src?: string | null; alt: string; fallback: string }) => (
    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground flex-shrink-0 mt-1">
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );

  if (isUser) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-primary text-primary-foreground rounded-br-md shadow-sm">
          {content}
        </div>
        <Avatar src={userAvatarSrc} alt="You" fallback="You" />
      </div>
    );
  }

  const parts = parseContent(content);
  const hasActions = parts.some((p) => p.type === 'action');

  if (!hasActions) {
    return (
      <div className="flex justify-start gap-2">
        <Avatar src={assistantAvatarSrc} alt="Chip" fallback="AI" />
        <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-muted text-foreground rounded-bl-md border border-border/50">
          {renderMarkdown(content)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <Avatar src={assistantAvatarSrc} alt="Chip" fallback="AI" />
      <div className="max-w-[85%] space-y-2">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            part.value.trim() ? (
              <div key={i} className="rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-muted text-foreground rounded-bl-md border border-border/50">
                {renderMarkdown(part.value.trim())}
              </div>
            ) : null
          ) : (
            <ActionCard
              key={i}
              action={part.value}
              initialApplied={part.applied}
              onApprove={onAction ?? (async () => ({ ok: false, error: 'No action handler' }))}
            />
          )
        )}
      </div>
    </div>
  );
}
