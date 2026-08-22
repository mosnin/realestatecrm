'use client';

import { cn } from '@/lib/utils';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { TextBlockView } from './text-block-view';
import { AttachmentBlockView } from './attachment-block-view';
import { ToolGroupBlockView } from './tool-group-block-view';
import { SubagentBlockView } from './subagent-block-view';
import { groupTranscriptItems } from './group-transcript-items';
import { SubagentTaskBlockView } from './subagent-task-block-view';
import { WorkSessionBlockView } from './work-session-block-view';
import { ReasoningBlockView } from './reasoning-block-view';
import { PermissionBlockView } from './permission-block-view';
import { PermissionPromptView, type PermissionPromptData } from './permission-prompt-view';
import { ApprovalCelebration, type ApprovalKind } from '@/components/chippi/approval-celebration';

interface TranscriptProps {
  blocks: MessageBlock[];
  /** Whose turn these blocks belong to. User turns only carry text blocks. */
  role: 'user' | 'assistant';
  /** Stable persisted message id, used to key per-message UI primitives. */
  messageId?: string;
  /**
   * When this turn is still streaming, the trailing text block gets a
   * pulsing caret. Pass `true` for the assistant turn that is currently
   * emitting deltas; omit or false for saved history.
   */
  streaming?: boolean;
  /** Disable text announcements when a grounded activity surface in the same
   * assistant row already owns the live region. */
  announceText?: boolean;
  /**
   * Tool callIds that are currently in-flight (the model called them in
   * this turn but the handler hasn't resolved yet). Lets the block view
   * render the "Running" state even though `status` is still a placeholder.
   */
  liveCallIds?: Set<string>;
  /**
   * Optional interactive permission prompt. Shown below the blocks when the
   * turn paused for approval. The parent owns the approve/deny callbacks so
   * the Transcript stays a pure presentational component.
   */
  pendingApproval?: {
    prompt: PermissionPromptData;
    onApprove: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
    onDeny: (requestId: string) => Promise<void>;
    onAlwaysAllow?: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
    busy?: boolean;
  };
  /**
   * When present, the surface the approval prompt occupied is replaced by
   * one calm Chippi-voiced sentence for ~2.5s. The parent owns the dwell —
   * the celebration calls `onDone` when its time is up so the parent can
   * clear this state and let the next streamed blocks (or whatever's next)
   * take the floor.
   */
  approvalCelebration?: {
    kind: ApprovalKind;
    subject?: string;
    onDone: () => void;
  };
  /** Bubbled by interactive tool-result cards (currently the availability
   *  picker). The workspace forwards the text as the realtor's next
   *  message. Omit on read-only history surfaces. */
  onUserIntent?: (text: string) => void;
  /** Opens a durable workbook artifact from a live or historical tool result. */
  onOpenWorkbench?: (artifactId: string) => void;
  /**
   * Optimistic object URLs for just-sent attachments, keyed by attachment id.
   * Lets a freshly-sent image thumbnail render instantly without waiting on a
   * signed-URL round-trip. History surfaces omit this — the block view signs
   * a URL on demand instead.
   */
  localUrls?: Record<string, string>;
  className?: string;
}

/**
 * Renders an ordered list of blocks. Each block type maps to a dedicated
 * view; this component is strictly a dispatcher. Stable keys come from
 * callId for tool-related blocks (so re-renders don't flicker during
 * streaming) and from index for text blocks (text is append-only per turn).
 */
export function Transcript({
  blocks,
  role,
  messageId,
  streaming,
  announceText = true,
  liveCallIds,
  pendingApproval,
  approvalCelebration,
  onUserIntent,
  onOpenWorkbench,
  localUrls,
  className,
}: TranscriptProps) {
  // Find the last text block so we can scope the streaming caret to it.
  let lastTextIndex = -1;
  if (streaming && role === 'assistant') {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'text') {
        lastTextIndex = i;
        break;
      }
    }
  }

  // Every non-subagent tool in this turn collapses into one dropdown,
  // including a single call and retries split by intervening text. Subagents
  // stay on their own row. Workbench cards without an opener are omitted.
  const items = groupTranscriptItems(blocks, { hideWorkbench: !onOpenWorkbench });

  return (
    <div className={cn('space-y-2.5', className)}>
      {items.map((item) => {
        switch (item.kind) {
          case 'text':
            return (
              <TextBlockView
                key={`text-${item.originalIndex}`}
                block={item.block}
                role={role}
                markdownId={messageId ? `${messageId}-${item.originalIndex}` : undefined}
                streaming={item.originalIndex === lastTextIndex}
                announce={announceText}
              />
            );
          case 'tool-group':
            return (
              <ToolGroupBlockView
                key={item.groupId}
                blocks={item.blocks}
                liveCallIds={liveCallIds}
                onUserIntent={onUserIntent}
                onOpenWorkbench={onOpenWorkbench}
              />
            );
          case 'subagent':
            return (
              <SubagentBlockView
                key={`subagent-${item.block.callId}`}
                block={item.block}
                live={liveCallIds?.has(item.block.callId)}
              />
            );
          case 'subagent-task':
            return (
              <SubagentTaskBlockView
                key={`subagent-task-${item.block.runId}`}
                block={item.block}
              />
            );
          case 'work-session':
            return (
              <WorkSessionBlockView
                key={`work-session-${item.block.sessionId}`}
                block={item.block}
              />
            );
          case 'reasoning':
            return (
              <ReasoningBlockView
                key={`reasoning-${item.block.content.length}`}
                block={item.block}
                streaming={streaming && role === 'assistant'}
              />
            );
          case 'permission':
            return <PermissionBlockView key={`perm-${item.block.callId}`} block={item.block} />;
          case 'attachments':
            return (
              <div key={item.groupId} className="flex flex-wrap gap-2">
                {item.blocks.map((att) => (
                  <AttachmentBlockView key={`att-${att.id}`} block={att} localUrl={localUrls?.[att.id]} />
                ))}
              </div>
            );
        }
      })}

      {/* Celebration takes precedence over the approval prompt — the moment
          the realtor approves a celebrate-able tool, the parent flips
          `approvalCelebration` and the prompt is swapped for the win line on
          the same surface. */}
      {approvalCelebration ? (
        <ApprovalCelebration
          kind={approvalCelebration.kind}
          subject={approvalCelebration.subject}
          onDone={approvalCelebration.onDone}
        />
      ) : (
        pendingApproval && (
          <PermissionPromptView
            prompt={pendingApproval.prompt}
            onApprove={pendingApproval.onApprove}
            onDeny={pendingApproval.onDeny}
            onAlwaysAllow={pendingApproval.onAlwaysAllow}
            busy={pendingApproval.busy}
          />
        )
      )}
    </div>
  );
}
