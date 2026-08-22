'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { workExecutionChipLabel } from '@/lib/chippi/chat-ux';
import type { WorkExecutionMode } from '@/lib/chat/work-execution-mode';

const OPTIONS: Array<{
  value: WorkExecutionMode;
  title: string;
  description: string;
}> = [
  {
    value: 'review',
    title: 'Review',
    description: 'Chippi pauses before it changes data or acts outside Chippi.',
  },
  {
    value: 'autonomous',
    title: 'Fully autonomous',
    description: 'Chippi completes explicitly requested actions. Irreversible actions still require permission.',
  },
];

export function WorkExecutionModeMenu({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkExecutionMode;
  onChange: (value: WorkExecutionMode) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Work execution: ${workExecutionChipLabel(value)}`}
          title="How Chippi works"
          className="h-8 rounded-full border-border/60 bg-background/90 px-2.5 text-[11px] font-medium text-foreground/80 shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-md hover:bg-background hover:text-foreground"
        >
          {workExecutionChipLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-[296px] rounded-2xl p-2">
        <div className="px-2 pb-2 pt-1">
          <p className="text-[13px] font-medium text-foreground">How Chippi works</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            This changes execution, not what Chippi drafts when you explicitly ask for a draft.
          </p>
        </div>
        <div role="radiogroup" aria-label="Work execution mode" className="space-y-1">
          {OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(option.value)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150',
                  selected ? 'bg-foreground/[0.055]' : 'hover:bg-foreground/[0.035]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-foreground">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-4 items-center justify-center rounded-full border',
                    selected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background',
                  )}
                >
                  {selected && <Check className="size-2.5" strokeWidth={2.5} />}
                </span>
              </button>
            );
          })}
        </div>
        {value === 'autonomous' && (
          <p className="mx-2 mb-1 mt-2 border-t border-border/60 pt-2 text-[10.5px] leading-4 text-muted-foreground">
            Autonomous work can send messages and update your CRM when your request is explicit. You remain responsible for the result.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

