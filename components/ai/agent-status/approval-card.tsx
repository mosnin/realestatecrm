'use client';

import { CircleHelp } from 'lucide-react';
import React from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AgentApprovalCardProps {
  title?: ReactNode;
  description?: ReactNode;
  interactive?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Chippi's lightweight BEUI Approval Card frame. The existing QuestionFlow and
 * OptionList remain the interaction authority; this adds a consistent, honest
 * decision header without nesting them inside a second visual card.
 */
export function AgentApprovalCard({
  title = 'Chippi needs your input',
  description,
  interactive = true,
  children,
  className,
}: AgentApprovalCardProps) {
  return (
    <section
      data-beui-surface="approval-card"
      data-agent-surface-style="inline"
      data-state={interactive ? 'pending' : 'history'}
      aria-label={typeof title === 'string' ? title : 'Agent question'}
      className={cn(
        'mt-2 w-full max-w-lg border-y border-border/40 bg-transparent py-3',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 items-start gap-2">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold leading-4 text-foreground/90">{title}</p>
            {description ? (
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {interactive ? 'Response needed' : 'Past prompt'}
        </span>
      </div>
      {children}
    </section>
  );
}
