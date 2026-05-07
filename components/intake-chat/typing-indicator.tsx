'use client';

import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TypingIndicatorProps {
  agentPhoto?: string | null;
  agentName?: string;
  accentColor?: string; // hex like '#ff964f'
}

/** Derive up to two initials from an agent name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function AgentAvatar({
  agentPhoto,
  agentName,
  accentColor,
}: {
  agentPhoto?: string | null;
  agentName?: string;
  accentColor?: string;
}) {
  const hasPhoto = Boolean(agentPhoto);
  const hasName = Boolean(agentName?.trim());

  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agentPhoto!}
        alt={agentName ?? 'Agent'}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
      />
    );
  }

  if (hasName) {
    return (
      <span
        className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center text-[9px] font-medium text-background leading-none select-none"
        style={{ backgroundColor: accentColor ?? 'var(--brand)' }}
        aria-hidden="true"
      >
        {initials(agentName!)}
      </span>
    );
  }

  // Fallback: Sparkles icon in a neutral circle
  return (
    <span
      className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-foreground/[0.06]"
      aria-hidden="true"
    >
      <Sparkles className="w-3 h-3 text-muted-foreground" />
    </span>
  );
}

export function TypingIndicator({ agentPhoto, agentName, accentColor }: TypingIndicatorProps) {
  return (
    <motion.div
      className="flex items-center gap-2.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AgentAvatar
        agentPhoto={agentPhoto}
        agentName={agentName}
        accentColor={accentColor}
      />

      <div
        className={cn('flex items-center gap-1')}
        role="status"
        aria-label="Typing"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full bg-foreground/40"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
