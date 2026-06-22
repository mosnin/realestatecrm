'use client';

import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { cn, safeHref } from '@/lib/utils';

export type ChatSourceKind = 'contact' | 'deal' | 'property' | 'document' | 'brokerage' | 'web' | 'other';

export interface ChatSource {
  id: string;
  title: string;
  kind: ChatSourceKind;
  url?: string;
  subtitle?: string;
}

export interface SourceProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  source: ChatSource;
  icon?: ReactNode;
}

export function Source({ source, icon, className, target, rel, ...props }: SourceProps) {
  const href = safeHref(source.url);
  const hasSafeHref = href !== '#';

  const content = (
    <>
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon ?? <FileText size={12} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">{source.title}</span>
        {source.subtitle && (
          <span className="block truncate text-[11px] text-muted-foreground">{source.subtitle}</span>
        )}
      </span>
      {hasSafeHref && <ExternalLink size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );

  if (hasSafeHref) {
    return (
      <a
        href={href}
        target={target ?? '_blank'}
        rel={rel ?? 'noreferrer'}
        data-source-kind={source.kind}
        className={cn(
          'inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/40',
          className,
        )}
        {...props}
      >
        {content}
      </a>
    );
  }

  return (
    <span
      data-source-kind={source.kind}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left',
        className,
      )}
    >
      {content}
    </span>
  );
}

export interface SourceListProps extends HTMLAttributes<HTMLDivElement> {
  sources: ChatSource[];
}

export function SourceList({ sources, className, ...props }: SourceListProps) {
  if (sources.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)} {...props}>
      {sources.map((source) => (
        <Source key={source.id} source={source} />
      ))}
    </div>
  );
}
