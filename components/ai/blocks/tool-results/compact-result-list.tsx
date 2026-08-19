'use client';

import { useState, type ReactNode } from 'react';
import { countLabel } from '@/lib/formatting';
import { cn } from '@/lib/utils';

export interface CompactResultItem {
  id: string;
  title: string;
  subtitle?: string;
}

export function CompactResultList({
  items,
  noun,
  plural,
  className,
  onItemClick,
  children,
}: {
  items: CompactResultItem[];
  noun: string;
  plural?: string;
  className?: string;
  onItemClick?: (id: string) => void;
  /** Full table / carousel shown on desktop, and on mobile after expand. */
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const preview = items.slice(0, 3);
  const remaining = items.length - preview.length;

  return (
    <div className={cn('mt-2', className)}>
      <div className={cn(expanded ? 'hidden' : 'md:hidden')}>
        <ul className="divide-y divide-border/40 border-y border-border/40">
          {preview.map((item) => {
            const row = (
              <>
                <p className="truncate text-[13px] font-medium text-foreground/90">{item.title}</p>
                {item.subtitle ? (
                  <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
                ) : null}
              </>
            );
            return (
              <li key={item.id}>
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={() => onItemClick(item.id)}
                    className="w-full py-2 text-left"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-[12px] font-medium text-foreground/80 underline underline-offset-4"
          >
            Open {countLabel(items.length, noun, plural)}
          </button>
        ) : null}
      </div>
      <div className={cn(expanded ? 'block' : 'hidden md:block')}>{children}</div>
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-[12px] font-medium text-muted-foreground underline underline-offset-4 md:hidden"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}
