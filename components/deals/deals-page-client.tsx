'use client';

import { useState } from 'react';
import { KanbanBoard } from './kanban-board';
import { cn } from '@/lib/utils';

export function DealsPageClient({ slug }: { slug: string }) {
  const [pipelineType, setPipelineType] = useState<'rental' | 'buyer'>('rental');

  return (
    <div className="space-y-4">
      {/* Pipeline toggle */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setPipelineType('rental')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            pipelineType === 'rental'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Rental Pipeline
        </button>
        <button
          onClick={() => setPipelineType('buyer')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            pipelineType === 'buyer'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Buyer Pipeline
        </button>
      </div>

      <KanbanBoard slug={slug} pipelineType={pipelineType} />
    </div>
  );
}
