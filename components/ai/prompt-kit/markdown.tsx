'use client';

import { Fragment, type ReactNode } from 'react';
import { cn, safeImageSrc } from '@/lib/utils';

function renderInline(text: string, keyOffset = 0): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let key = keyOffset;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    if (match[0].startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground/90">
          {match[2]}
        </code>,
      );
    } else if (match[0].startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[3]}
        </strong>,
      );
    } else {
      parts.push(<em key={key++}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function isRawJsonLeak(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 4) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

export interface MarkdownProps {
  id?: string;
  children: string;
  streaming?: boolean;
  className?: string;
}

/**
 * Prompt Kit-inspired Markdown renderer for chat messages.
 *
 * Keeps the existing Chippi safety behavior: pure JSON tool-argument leaks are
 * hidden, image URLs are validated with safeImageSrc(), and streaming assistant
 * text can show a trailing cursor without changing the persisted message model.
 */
export function Markdown({ id, children, streaming, className }: MarkdownProps) {
  if (isRawJsonLeak(children)) return null;

  const nodes: ReactNode[] = [];
  const lines = children.split('\n');
  let i = 0;
  let keyCounter = 0;
  const key = () => `${id ?? 'md'}-${keyCounter++}`;

  while (i < lines.length) {
    const line = lines[i];

    const imageMatch = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (imageMatch) {
      const safeSrc = safeImageSrc(imageMatch[2]);
      if (safeSrc) {
        nodes.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key()}
            src={safeSrc}
            alt={imageMatch[1] || 'image'}
            className="my-2 max-w-full rounded-lg border border-border/60"
          />,
        );
      }
      i++;
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      nodes.push(
        <pre
          key={key()}
          className="my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[12px] text-foreground/90 whitespace-pre"
        >
          {codeLines.join('\n')}
        </pre>,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const Heading = headingMatch[1].length <= 2 ? 'h2' : 'h3';
      nodes.push(
        <Heading key={key()} className="mt-3 mb-1 text-sm font-semibold text-foreground">
          {renderInline(headingMatch[2])}
        </Heading>,
      );
      i++;
      continue;
    }

    const bulletMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = /^\s*[-*]\s+(.+)$/.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i++;
      }
      nodes.push(
        <ul key={key()} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, idx * 10)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const orderedMatch = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (orderedMatch) {
      const start = Number.parseInt(orderedMatch[1], 10);
      const items: string[] = [];
      while (i < lines.length) {
        const match = /^\s*\d+\.\s+(.+)$/.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i++;
      }
      nodes.push(
        <ol
          key={key()}
          start={Number.isFinite(start) && start > 0 ? start : undefined}
          className="my-2 list-decimal space-y-1 pl-5"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, idx * 10)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const paragraphLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    nodes.push(
      <p key={key()} className="my-1 whitespace-pre-wrap leading-relaxed">
        {paragraphLines.map((paragraphLine, idx) => (
          <Fragment key={idx}>
            {renderInline(paragraphLine, idx * 100)}
            {idx < paragraphLines.length - 1 && '\n'}
          </Fragment>
        ))}
      </p>,
    );
  }

  const lastNode = nodes[nodes.length - 1];
  const lastIsParagraph =
    lastNode != null &&
    typeof lastNode === 'object' &&
    'type' in lastNode &&
    (lastNode as React.ReactElement).type === 'p';

  return (
    <div className={cn('space-y-1', className)}>
      {nodes}
      {streaming && !lastIsParagraph && <span className="chippi-cursor" aria-hidden="true" />}
      {streaming && lastIsParagraph && <span className="chippi-cursor" aria-hidden="true" />}
    </div>
  );
}
