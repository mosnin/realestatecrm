'use client';

import { Columns2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SplitPanelToggleProps {
  /** Whether the panel is currently open — the desktop split OR the mobile
   *  full-screen overlay. `useSplitPanel().toggle` already decides which one
   *  a click opens/closes based on the live viewport width, so this button
   *  works unchanged on both desktop and mobile. */
  isSplit: boolean;
  onToggle: () => void;
  className?: string;
}

export function SplitPanelToggle({ isSplit, onToggle, className }: SplitPanelToggleProps) {
  // Visible at every width — below md a click opens the mobile full-screen
  // overlay instead of the desktop split (see useSplitPanel.toggle), so the
  // affordance to reach People/Deals/Documents/Browser must stay reachable
  // on narrow screens too, not just >= md as before.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            aria-label={isSplit ? 'Close panel' : 'Open panel'}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg',
              'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
              'transition-colors',
              className,
            )}
          >
            {isSplit ? <Square size={15} /> : <Columns2 size={15} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isSplit ? 'Close panel' : 'Open panel'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
