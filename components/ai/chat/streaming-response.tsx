'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { DURATION_FAST, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  SourceList,
  type ChatSource,
} from '@/components/ai/prompt-kit/source';

export type StreamingResponseStatus = 'streaming' | 'complete' | 'error';
export type StreamingResponseCollapsedLines = 2 | 3 | 4 | 5 | 6;

export interface StreamingResponseCollapseOptions {
  /** Controlled expansion state. */
  open?: boolean;
  /** Initial expansion state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapsedLines?: StreamingResponseCollapsedLines;
  moreLabel?: ReactNode;
  lessLabel?: ReactNode;
}

export interface StreamingResponseProps extends HTMLAttributes<HTMLDivElement> {
  status?: StreamingResponseStatus;
  /** Plain text copied by the completion action. */
  copyText?: string;
  /** Overrides the built-in clipboard write. */
  onCopy?: () => void | Promise<void>;
  /** Grounded sources only. Omit or pass [] when no sources were returned. */
  sources?: ChatSource[];
  sourcesOpen?: boolean;
  defaultSourcesOpen?: boolean;
  onSourcesOpenChange?: (open: boolean) => void;
  sourceIdPrefix?: string;
  /** Disable when a surrounding conversation log owns announcements. */
  announce?: boolean;
  /** Completion actions never render while content is still streaming. */
  showActions?: boolean;
  /** Opt-in disclosure for settled long content. Live content is never clamped. */
  collapse?: StreamingResponseCollapseOptions | false;
  contentClassName?: string;
  actionsClassName?: string;
}

const COPY_RESET_MS = 1800;

function useDisclosureState(
  controlled: boolean | undefined,
  defaultValue: boolean,
  onChange: ((open: boolean) => void) | undefined,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const open = controlled ?? uncontrolled;

  const setOpen = (next: boolean) => {
    if (controlled === undefined) setUncontrolled(next);
    onChange?.(next);
  };

  return [open, setOpen] as const;
}

/**
 * Stable assistant-response surface. Its outer node never keys off content,
 * so streamed deltas update in place and cannot replay message entrance motion.
 */
export function StreamingResponse({
  status = 'streaming',
  copyText,
  onCopy,
  sources = [],
  sourcesOpen,
  defaultSourcesOpen = false,
  onSourcesOpenChange,
  sourceIdPrefix,
  announce = true,
  showActions = true,
  collapse = false,
  contentClassName,
  actionsClassName,
  className,
  children,
  ...props
}: StreamingResponseProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const generatedId = useId();
  const sourceRegionId = `${sourceIdPrefix ?? `response-${generatedId}`}-sources`;
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);
  const hasStreamed = useRef(status === 'streaming');
  if (status === 'streaming') hasStreamed.current = true;

  const [areSourcesOpen, setSourcesOpen] = useDisclosureState(
    sourcesOpen,
    defaultSourcesOpen,
    onSourcesOpenChange,
  );
  const [isContentOpen, setContentOpen] = useDisclosureState(
    collapse === false ? undefined : collapse.open,
    collapse === false ? false : (collapse.defaultOpen ?? false),
    collapse === false ? undefined : collapse.onOpenChange,
  );

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  const streaming = status === 'streaming';
  const complete = status === 'complete';
  const canCopy = complete && showActions && (copyText !== undefined || onCopy !== undefined);
  const canShowSources = complete && sources.length > 0;
  const canCollapse = complete && collapse !== false;
  const shouldClamp = canCollapse && !isContentOpen;
  const shouldAnnounce = announce && hasStreamed.current;
  const collapsedLines = collapse === false ? 4 : (collapse.collapsedLines ?? 4);

  const handleCopy = async () => {
    try {
      if (onCopy) {
        await onCopy();
      } else if (copyText !== undefined && navigator.clipboard) {
        await navigator.clipboard.writeText(copyText);
      } else {
        return;
      }

      setCopied(true);
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard access can be unavailable in non-secure contexts. Keep the
      // action honest by leaving it in the uncopied state.
      setCopied(false);
    }
  };

  return (
    <div
      data-streaming-response=""
      data-status={status}
      aria-busy={streaming}
      className={cn('min-w-0', className)}
      {...props}
    >
      <div
        aria-live={shouldAnnounce ? 'polite' : undefined}
        aria-atomic={shouldAnnounce ? 'false' : undefined}
        className={cn(
          'min-w-0',
          shouldClamp && 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]',
          contentClassName,
        )}
        style={shouldClamp ? { WebkitLineClamp: collapsedLines } : undefined}
      >
        {children}
      </div>

      {canCollapse ? (
        <button
          type="button"
          aria-expanded={isContentOpen}
          onClick={() => setContentOpen(!isContentOpen)}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isContentOpen ? collapse.lessLabel ?? 'Show less' : collapse.moreLabel ?? 'Show more'}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn('transition-transform', isContentOpen && 'rotate-180')}
          />
        </button>
      ) : null}

      <AnimatePresence initial={false}>
        {canCopy || canShowSources ? (
          <motion.div
            key="settled-actions"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            className={cn('mt-2 flex flex-wrap items-center gap-1', actionsClassName)}
          >
            {canCopy ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-label={copied ? 'Response copied' : 'Copy response'}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              </button>
            ) : null}

            {canShowSources ? (
              <button
                type="button"
                aria-expanded={areSourcesOpen}
                aria-controls={sourceRegionId}
                onClick={() => setSourcesOpen(!areSourcesOpen)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sources.length} {sources.length === 1 ? 'source' : 'sources'}
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className={cn('transition-transform', areSourcesOpen && 'rotate-180')}
                />
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {canShowSources && areSourcesOpen ? (
          <motion.div
            id={sourceRegionId}
            key="sources"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            className="mt-2"
          >
            <SourceList sources={sources} aria-label="Sources" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
