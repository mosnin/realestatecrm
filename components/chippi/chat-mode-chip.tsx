'use client';

import { cn } from '@/lib/utils';
import { chatModeChipLabel } from '@/lib/chippi/chat-ux';

export function ChatModeChip({
  mode,
  className,
}: {
  mode: 'chat' | 'work';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5',
        'text-[10.5px] font-medium tracking-wide text-muted-foreground',
        className,
      )}
      aria-label={chatModeChipLabel(mode)}
    >
      {chatModeChipLabel(mode)}
    </span>
  );
}
