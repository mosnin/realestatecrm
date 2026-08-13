'use client';

import { Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PermissionBlock } from '@/lib/ai-tools/blocks';

interface PermissionBlockViewProps {
  block: PermissionBlock;
  className?: string;
}

/**
 * Historical view of a denied / dismissed permission prompt. Shown on page
 * reload so the transcript explains why the thread ended without a send.
 * Compact by design — the active approval card (PermissionPromptView) is
 * where the interactive surface lives; this is read-only history.
 */
export function PermissionBlockView({ block, className }: PermissionBlockViewProps) {
  const label = block.decision === 'denied' ? 'Denied' : 'Dismissed';
  return (
    <div
      data-agent-surface-style="inline"
      className={cn(
        'flex items-center gap-2.5 border-y border-border/40 bg-transparent px-0 py-3',
        className,
      )}
    >
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground">
        <Lock size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{block.summary}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground flex-shrink-0">
        <X size={11} />
        {label}
      </span>
    </div>
  );
}
