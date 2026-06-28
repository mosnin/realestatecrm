'use client';

/**
 * WorkflowCanvasLazy — a code-split wrapper around WorkflowCanvas.
 *
 * React Flow (@xyflow/react) and its stylesheet are heavy and only needed when
 * the realtor opens ADVANCED mode. This dynamic import (ssr: false, since the
 * canvas measures the DOM and can't render server-side) keeps that bundle out
 * of the linear builder's path until advanced mode is actually opened. The
 * loading skeleton matches the canvas's fixed height so the layout doesn't jump.
 *
 * Same props/contract as WorkflowCanvas — consumers import THIS instead of the
 * raw component to avoid pulling React Flow into their bundle.
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { CAPTION } from '@/lib/typography';
import { cn } from '@/lib/utils';
import type { WorkflowCanvasProps } from './workflow-canvas';

function CanvasSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex h-[560px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/10">
          <p className={cn(CAPTION, 'animate-pulse')}>Loading the canvas…</p>
        </div>
        <Skeleton className="hidden h-[560px] w-[300px] rounded-xl lg:block" />
      </div>
    </div>
  );
}

export const WorkflowCanvasLazy = dynamic<WorkflowCanvasProps>(
  () => import('./workflow-canvas').then((m) => m.WorkflowCanvas),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);
