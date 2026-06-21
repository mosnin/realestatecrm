'use client';

/**
 * ReasoningBlockView — collapsed reasoning/work-log row shown above the
 * assistant's reply. The Prompt Kit primitives keep the disclosure chrome
 * consistent with the rest of the chat UI.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ReasoningBlock } from '@/lib/ai-tools/blocks';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { ChainOfThought, Reasoning, ReasoningTrigger } from '@/components/ai/prompt-kit';

function formatDuration(ms?: number): string | null {
  if (!ms || ms < 500) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export interface ReasoningBlockViewProps {
  block: ReasoningBlock;
  /** When true, the header label keeps the shimmer on (turn still streaming). */
  streaming?: boolean;
}

export function ReasoningBlockView({ block, streaming }: ReasoningBlockViewProps) {
  const [expanded, setExpanded] = useState(false);
  const elapsed = formatDuration(block.durationMs);
  const label = streaming ? 'Thinking' : elapsed ? `Reasoned for ${elapsed}` : 'Reasoning';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
    >
      <Reasoning open={expanded}>
        <ReasoningTrigger
          open={expanded}
          streaming={streaming}
          label={label}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        />

        {expanded && (
          <div className="pl-5 pr-2 pb-2">
            <ChainOfThought content={block.content} streaming={streaming} className="mt-1" />
          </div>
        )}
      </Reasoning>
    </motion.div>
  );
}
