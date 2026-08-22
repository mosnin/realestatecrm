'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WorkSessionsStrip } from '@/components/chippi/work-sessions-strip';
import type { DelegatedWork } from '@/components/chippi/realtime-voice-dialog';
import {
  requestChippiVoice,
  subscribeToChippiVoiceWorkspaceEvents,
} from '@/components/chippi/persistent-chippi-voice';
import {
  ChippiPromptBox,
  ChatWorkModeSwitch,
  type MentionItem,
  type SkillItem,
  type SentAttachmentMeta,
} from '@/components/ui/chippi-prompt-box';
import { Button } from '@/components/ui/button';
import { History, Settings, ArrowLeft, Play, Loader2, NotebookText, RotateCcw, MoreHorizontal, SquarePen, BookOpen, Inbox, Flag, Trash2, Pencil } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Transcript } from '@/components/ai/blocks/transcript';
import { SuggestedActions } from '@/components/ai/blocks/suggested-actions';
import { ThinkingIndicator } from '@/components/ai/blocks/thinking-indicator';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { useAgentTask, type UiMessage, type ChatMode } from '@/components/ai/hooks/use-agent-task';
import { getTurn, consumeFinishedTurn, turnKey } from '@/components/ai/hooks/turn-runner';
import { blocksFromLegacyContent, type MessageBlock, type ToolCallBlock } from '@/lib/ai-tools/blocks';
import type { ChatConversation } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { toast } from 'sonner';
import { approvalKindForTool, approvalSubjectFromArgs, type ApprovalKind } from './approval-celebration';
import { PlanCard } from '@/components/chippi/plan-card';
import { useSplitPanel } from '@/hooks/use-split-panel';
import { SplitPanelToggle } from '@/components/chippi/split-panel-toggle';
import { RightPanel } from '@/components/chippi/right-panel';
import type { BrowserActionLogEntry } from '@/components/chippi/browser-control-panel';
import { PanelResizeHandle } from '@/components/chippi/panel-resize-handle';
import { ApprovalsPill } from '@/components/chippi/approvals-pill';
import { WorkExecutionModeMenu } from '@/components/chippi/work-execution-mode-menu';
import { WorkActivityTimeline } from '@/components/chippi/work-activity-timeline';
import { useChatLiveEdge } from '@/components/chippi/use-chat-live-edge';
import { chatSurfaceEndpoints } from '@/lib/chat/surface-endpoints';
import { requestChippiSidebarView } from '@/components/dashboard/chippi-sidebar-experience';
import {
  parseWorkExecutionMode,
  type WorkExecutionMode,
} from '@/lib/chat/work-execution-mode';
import { SystemMessage } from '@/components/ai/prompt-kit';
import { fallbackHeuristic } from '@/lib/ai-tools/chippi-voice';
import {
  boundedResearchSources,
  researchActivityFromToolResult,
  type ResearchSourceLink,
} from '@/lib/chippi/research-workspace';
import { consumeWorkDraftHandoff } from '@/lib/chippi/work-draft-handoff';
import { getSuggestionsForTurn } from '@/lib/ai-tools/suggestions';
import {
  shouldShowFollowUpSuggestions,
  shouldShowInlineWorkActivity,
  shouldShowPlanCard,
} from '@/lib/chippi/chat-ux';

/**
 * Legacy on-the-wire message shape from /api/ai/messages. The DB now also
 * carries `blocks` (Phase 3a migration); when present we prefer it, falling
 * back to rendering `content` as a single text block.
 */
interface LegacyMessage {
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[] | null;
}

interface ChippiWorkspaceProps {
  slug: string;
  /** When 'settings', renders the agent settings panel instead of the workspace. */
  view?: 'workspace' | 'settings';
  initialMessages: LegacyMessage[];
  initialConversations: ChatConversation[];
  initialConversationId: string | null;
  /** Pre-send this message on mount (used when arriving from the command palette). */
  initialInput?: string;
  /** Pre-populate the composer on mount but do NOT auto-send — the realtor
   *  finishes the sentence themselves. Used by "or just tell Chippi →"
   *  shortcuts on /contacts and /deals, and by morning-actions. Distinct
   *  from `initialInput` which auto-sends. */
  initialPrefill?: string;
  /** When true, render the "Connect Gmail to send your drafts →" tertiary
   *  line under the post-tour affordance. Snapshot at page load: the realtor
   *  has zero active integrations AND Composio is configured. Once they
   *  connect, the OAuth round-trip reloads the page and this flips false. */
  showConnectBanner?: boolean;
  /** Skills offered in the chat's `/` menu. From loadUserInvocableSkills(). */
  skills?: SkillItem[];
  /** Space id — enables the live work-sessions strip (Supabase Realtime filter). */
  spaceId?: string;
  /** Connected apps + custom plugins offered in the @ mention menu. */
  mentionApps?: { slug: string; label: string }[];
  /** Server-computed readiness. The browser never infers this from secrets. */
  realtimeVoiceEnabled?: boolean;
  /** Server-authorized, per-space entitlement for the Research Workspace. */
  researchEnabled?: boolean;
  /** Server-authorized, per-space entitlement for isolated Workspace Runs. */
  workspaceRunsEnabled?: boolean;
  /** Separate per-space rollout for continuation tasks in the terminal panel. */
  workspaceRunFollowUpsEnabled?: boolean;
  /** The realtor's Chippi profile name (DB User.name, chosen at onboarding).
   *  Preferred over the Clerk identity for the greeting so it doesn't fall back
   *  to the Google/Gmail name on the account. */
  accountName?: string | null;
  /**
   * Which Chippi variant this surface is rendering.
   *
   * - `realtor` (default) — solo / brokerage-member chat at /s/<slug>/chippi.
   *   Backed by `/api/ai/task` and the native realtor tool catalog.
   * - `broker` — chief-of-staff chat at /broker/chippi. Backed by the
   *   broker-gated `/api/ai/broker-task` (defense layer 2) and the
   *   `BROKER_TOOLS` registry (empty in Phase 1; Phase 2/3 will populate).
   *
   * The variant is a quiet signal, not a re-skin — same logo, same chat
   * shape, same composer. It switches the API endpoints and the empty-
   * state copy only.
   */
  variant?: 'realtor' | 'broker';
}

const MESSAGE_LIMIT = 50;
const RESEARCH_BROWSER_ACTION_TYPES = new Set([
  'navigate', 'click', 'type', 'press', 'scroll', 'read_dom', 'screenshot', 'wait',
]);

/**
 * What the history loader should do for the conversation the URL is asking
 * for. Pure so the decision — which is where the "input shoots up and back
 * down" glitch lived — is testable without a renderer.
 *
 *   - `idle`            nothing to do; the surface already shows this thread.
 *   - `reset`           no conversation at all → empty surface.
 *   - `useServerProps`  the server render already carries the right messages.
 *   - `fetch`           go get history from the messages endpoint.
 *
 * `clearFirst` is the important one. It is true ONLY when the transcript
 * currently on screen belongs to a DIFFERENT conversation, so a plain refresh
 * of the thread already displayed keeps its messages until the replacement is
 * in hand. Blanking first flips `isEmpty`, which swaps the surface back to the
 * greeting hero and FLIP-glides the composer to centre and back — and if the
 * re-fetch races the server's persistence, the answer that just streamed is
 * replaced by history that doesn't contain it yet.
 */
export type HistoryLoadPlan =
  | { action: 'idle' }
  | { action: 'reset' }
  | { action: 'useServerProps'; clearFirst: boolean }
  | { action: 'fetch'; clearFirst: boolean };

export function planHistoryLoad(input: {
  /** Conversation the URL (or the server props) is asking for. */
  targetId: string | null;
  /** Conversation whose messages are on screen. `null` = never loaded, `''` = deliberately empty. */
  loadedConvId: string | null;
  initialConversationId: string | null;
  hasServerMessages: boolean;
  /**
   * A turn finished for this conversation somewhere this surface wasn't
   * watching (another page, the bar, a closed tab). Turns this surface
   * streamed itself do NOT count — its transcript is already current, and
   * richer than history: it carries the error and cut-off lines the server
   * never persists.
   */
  turnFinishedElsewhere: boolean;
}): HistoryLoadPlan {
  const { targetId, loadedConvId, initialConversationId, hasServerMessages, turnFinishedElsewhere } =
    input;
  if (!targetId) return loadedConvId === '' ? { action: 'idle' } : { action: 'reset' };
  if (!turnFinishedElsewhere && targetId === loadedConvId) return { action: 'idle' };
  const clearFirst = loadedConvId !== null && loadedConvId !== targetId;
  if (!turnFinishedElsewhere && targetId === initialConversationId && hasServerMessages) {
    return { action: 'useServerProps', clearFirst };
  }
  return { action: 'fetch', clearFirst };
}

/**
 * Whether the top-of-page Chat/Work mode switch should render for a given
 * chat surface variant. The main Chippi surface (`/api/ai/task`) owns the
 * durable Work runtime. Broker chat can accept a legacy mode hint, but it
 * does not expose the same Work tools or lifecycle yet, so rendering the
 * switch there would overpromise product parity.
 */
export function shouldShowModeSwitch(variant: 'realtor' | 'broker'): boolean {
  return variant === 'realtor';
}

/** A conversation's type is chosen before its first user message and then fixed. */
export function isConversationModeLocked(
  messages: ReadonlyArray<{ role: string }>,
): boolean {
  return messages.some((message) => message.role === 'user');
}

export function storedConversationMode(
  conversations: ReadonlyArray<Pick<ChatConversation, 'id' | 'mode'>>,
  conversationId: string | null,
): ChatMode | null {
  if (!conversationId) return null;
  const mode = conversations.find((conversation) => conversation.id === conversationId)?.mode;
  return mode === 'chat' || mode === 'work' ? mode : null;
}

const CHAT_MODE_STORAGE_PREFIX = 'chippi-chat-mode:';
const CHAT_MODE_DRAFT_KEY = `${CHAT_MODE_STORAGE_PREFIX}__draft__`;

function chatModeStorageKey(conversationId: string | null): string {
  return conversationId ? `${CHAT_MODE_STORAGE_PREFIX}${conversationId}` : CHAT_MODE_DRAFT_KEY;
}

/** Reads both the new value and the old `agent` value for seamless migration. */
export function readStoredChatMode(conversationId: string | null): ChatMode {
  if (typeof window === 'undefined') return 'chat';
  try {
    const value = window.sessionStorage.getItem(chatModeStorageKey(conversationId));
    return value === 'work' || value === 'agent' ? 'work' : 'chat';
  } catch {
    return 'chat';
  }
}

function writeStoredChatMode(conversationId: string | null, mode: ChatMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(chatModeStorageKey(conversationId), mode);
  } catch {
    // Private/quota-limited storage does not block the in-memory choice.
  }
}

function clearDraftChatMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CHAT_MODE_DRAFT_KEY);
  } catch {
    // Ignore storage failures; the current component state remains authoritative.
  }
}

/**
 * Opt-in soft "tap" tone on message send. Generated via Web Audio API so
 * we don't ship any asset, fires once at a quiet -28dB-ish gain, and
 * gates on:
 *
 *   1. Browser context (server renders skip).
 *   2. `prefers-reduced-motion` — same surface the rest of the chat
 *      animation system respects. Sound is motion adjacent; calm-by-
 *      default means quiet-by-default for that audience.
 *   3. localStorage flag `chippi:sound:enabled === '1'`. Default OFF —
 *      sound is a delight the realtor chooses to turn on, never one we
 *      surprise them with on first send. No UI for the toggle in this
 *      pass; the key is documented for the inevitable settings cluster.
 *
 * Failures are swallowed (suspended AudioContexts, autoplay blocks,
 * Safari quirks) — a missing send tone is never a bug worth shouting
 * about.
 */
function softTap(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.localStorage?.getItem('chippi:sound:enabled') !== '1') return;
    type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WebkitAudioWindow;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660; // C5-ish — soft, not chime-y.
    gain.gain.setValueAtTime(0.04, ctx.currentTime); // -28dB-ish.
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // suspended context, autoplay block, or no AudioContext support — silent.
  }
}

/**
 * Parse a create_plan tool call result into { task, steps }.
 * Returns null if the data doesn't match the expected shape.
 */
function parsePlanResult(
  data: unknown,
): { task: string; steps: Array<{ title: string; description: string }> } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const task = typeof d.task === 'string' ? d.task : null;
  const steps = Array.isArray(d.steps) ? d.steps : null;
  if (!task || !steps) return null;
  const parsedSteps = steps.map((s: unknown) => {
    if (!s || typeof s !== 'object') return { title: '', description: '' };
    const step = s as Record<string, unknown>;
    return {
      title: typeof step.title === 'string' ? step.title : '',
      description: typeof step.description === 'string' ? step.description : '',
    };
  });
  return { task, steps: parsedSteps };
}

function legacyToUi(messages: LegacyMessage[]): UiMessage[] {
  return messages.map((m, i) => ({
    id: `hist_${i}`,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    blocks:
      Array.isArray(m.blocks) && m.blocks.length > 0
        ? m.blocks
        : blocksFromLegacyContent(typeof m.content === 'string' ? m.content : ''),
  }));
}

export function ChippiWorkspace({
  slug,
  view = 'workspace',
  initialMessages,
  initialConversations,
  initialConversationId,
  initialInput,
  initialPrefill,
  showConnectBanner = false,
  skills = [],
  accountName = null,
  variant = 'realtor',
  spaceId,
  mentionApps = [],
  realtimeVoiceEnabled = false,
  researchEnabled = false,
  workspaceRunsEnabled = false,
  workspaceRunFollowUpsEnabled = false,
}: ChippiWorkspaceProps) {
  const isBroker = variant === 'broker';
  const workbenchEnabled = process.env.NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED === 'true';
  const endpoints = useMemo(() => chatSurfaceEndpoints(variant, slug), [variant, slug]);
  const { user } = useUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [draftWorkExecutionMode, setDraftWorkExecutionMode] =
    useState<WorkExecutionMode>(() =>
      parseWorkExecutionMode(
        initialConversations.find((conversation) => conversation.id === initialConversationId)
          ?.executionMode,
      ),
    );
  const activeConversationExecutionMode = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  )?.executionMode;
  const workExecutionMode = activeConversationId
    ? parseWorkExecutionMode(activeConversationExecutionMode)
    : draftWorkExecutionMode;
  const modeConversationRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    setChatMode(
      storedConversationMode(initialConversations, activeConversationId)
      ?? (isConversationModeLocked(initialMessages) ? 'chat' : readStoredChatMode(activeConversationId)),
    );
    // Hydration restore only. Conversation changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const previous = modeConversationRef.current;
    modeConversationRef.current = activeConversationId;
    if (previous === activeConversationId) return;
    const persistedMode = storedConversationMode(conversations, activeConversationId);
    if (persistedMode) {
      setChatMode(persistedMode);
      writeStoredChatMode(activeConversationId, persistedMode);
      clearDraftChatMode();
      return;
    }
    if (previous === null && activeConversationId) {
      writeStoredChatMode(activeConversationId, chatMode);
      clearDraftChatMode();
      return;
    }
    setChatMode(readStoredChatMode(activeConversationId));
    // Carry-forward needs the current selection but must fire only on id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);
  const selectChatMode = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    writeStoredChatMode(activeConversationId, mode);
  }, [activeConversationId]);
  // Server-driven loading: pending during the soft-nav so we can show the
  // "One moment" placeholder instead of the previous conversation's
  // transcript flashing for a beat. `useTransition` is the natural fit —
  // wrap the `router.push` calls and the `isPending` flag flips for the
  // duration of the server re-render.
  const [isLoadingConversation, startConversationTransition] = useTransition();
  // The single sentence the realtor sees when they approve a celebrate-able
  // tool from the chat permission prompt. Set the moment the wrapped
  // approve/alwaysAllow callback fires; cleared by the celebration's own
  // onDone after the dwell. Anchored to the assistant message id whose
  // permission prompt was approved so a later turn's prompt can't inherit it.
  const [chatCelebration, setChatCelebration] = useState<
    { messageId: string; kind: ApprovalKind; subject?: string } | null
  >(null);
  const [queuedEditId, setQueuedEditId] = useState<string | null>(null);
  const [queuedEditText, setQueuedEditText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Single switch for every bespoke animation on this surface: the hero→dock
  // composer glide, the user-bubble lift, and the hero exit's vertical drift
  // all collapse to plain crossfades/snaps when the OS asks for less motion.
  const reduceMotion = useReducedMotion() ?? false;

  // Track which assistant message ids have already mounted so we only run the
  // 8px slide-in entrance the FIRST time a bubble appears. Loading a
  // conversation from history dumps the full transcript in at once; without
  // this gate every bubble would slide in on every navigation. Re-keyed by
  // active conversation id so a fresh thread starts with a clean set.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Reset on conversation switch — the next render's messages are a fresh
    // batch that should arrive without an animation cascade.
    seenMessageIdsRef.current = new Set();
  }, [activeConversationId]);

  const {
    isSplit,
    toggle: toggleSplit,
    rightTab,
    setRightTab,
    leftWidthPercent,
    setLeftWidthPercent,
    isMobileOverlay,
    closeMobileOverlay,
  } = useSplitPanel();
  // Split / live-work side panel is available on BOTH variants. For broker the
  // RightPanel embeds the brokerage-scoped /broker/* routes (people/deals/
  // properties) plus the universal live-work activity feed and in-panel
  // browser; see RightPanel's `variant` prop. (Previously forced off for
  // broker because the tabs were realtor-scoped.)
  const effectiveIsSplit = isSplit;
  // True only while the divider is being dragged. The right panel is an iframe,
  // which would otherwise swallow the mousemove events the drag listeners need —
  // so during a drag we shield it with pointer-events:none and the handle keeps
  // tracking the cursor instead of "getting stuck". The callbacks are stable so
  // the handle's listener effect doesn't tear down/re-add on every drag frame.
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [workbenchArtifactId, setWorkbenchArtifactId] = useState<string | null>(null);
  const [workbenchRefreshVersion, setWorkbenchRefreshVersion] = useState<number | null>(null);
  const [workspaceRunId, setWorkspaceRunId] = useState<string | null>(null);
  const [workspaceRunRefreshToken, setWorkspaceRunRefreshToken] = useState(0);
  // Durable re-entry: a page reload does not discard the latest workspace
  // attached to this conversation; the Workspace tab can reopen it.
  useEffect(() => {
    // Clear first: a new/no-match conversation must never borrow the prior
    // thread's local workspace id while this durable lookup is in flight.
    setWorkspaceRunId(null);
    if (!workspaceRunsEnabled || !activeConversationId) return;
    let active = true;
    void fetch(`/api/work-sessions?slug=${encodeURIComponent(slug)}&conversationId=${encodeURIComponent(activeConversationId)}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((payload: { sessions?: Array<{ conversationId?: string | null; workspaceRunId?: string | null }> } | null) => {
        const match = payload?.sessions?.find((session) => session.workspaceRunId);
        if (active && match?.workspaceRunId) setWorkspaceRunId(match.workspaceRunId);
      }).catch(() => {});
    return () => { active = false; };
  }, [activeConversationId, slug, workspaceRunsEnabled]);
  // Immediate, in-conversation activity. The Research Workspace also reads
  // the persisted browser-action timeline, so this state is just the small
  // gap between a streamed tool result and the next server refresh.
  const [researchActions, setResearchActions] = useState<BrowserActionLogEntry[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSourceLink[]>([]);
  const openedWorkbenchUrlRef = useRef<string | null>(null);
  const researchResultSequenceRef = useRef(0);
  useEffect(() => {
    researchResultSequenceRef.current = 0;
    setResearchActions([]);
    setResearchSources([]);
  }, [activeConversationId]);
  const handleSplitDragStart = useCallback(() => setIsResizingSplit(true), []);
  const handleSplitDragEnd = useCallback(() => setIsResizingSplit(false), []);
  const openWorkbenchArtifact = useCallback((artifactId: string, refreshVersion?: number) => {
    // Deep links and streamed tool results are untrusted entrypoints. Keeping
    // the tab out of the tab bar is not enough: an old/shared URL must not open
    // the split panel when the deployment has the Workbench rollout disabled.
    if (!workbenchEnabled) return;
    openedWorkbenchUrlRef.current = artifactId;
    setWorkbenchArtifactId(artifactId);
    if (typeof refreshVersion === 'number' && Number.isInteger(refreshVersion) && refreshVersion > 0) {
      setWorkbenchRefreshVersion(refreshVersion);
    } else {
      setWorkbenchRefreshVersion(null);
    }
    setRightTab('workbench');
    if (!effectiveIsSplit && !isMobileOverlay) toggleSplit();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('workbenchArtifact', artifactId);
      router.replace(`${endpoints.routeBase}?${params.toString()}`, { scroll: false });
    }
  }, [effectiveIsSplit, endpoints.routeBase, isMobileOverlay, router, setRightTab, toggleSplit, workbenchEnabled]);
  const handleWorkbenchToolResult = useCallback(({ name, data, ok }: { name: string; data: unknown; ok: boolean }) => {
    if (!ok || (name !== 'open_spreadsheet_in_workbench' && name !== 'apply_workbook_transformation') || !data || typeof data !== 'object') return;
    const { artifactId, versionNumber } = data as { artifactId?: unknown; versionNumber?: unknown };
    if (typeof artifactId === 'string') openWorkbenchArtifact(artifactId, name === 'apply_workbook_transformation' && typeof versionNumber === 'number' ? versionNumber : undefined);
  }, [openWorkbenchArtifact]);
  const openResearchWorkspace = useCallback(() => {
    // This matches the tab's deployment gate. A streamed browser result must
    // never expose a surface the deployment intentionally kept dark.
    if (!researchEnabled) return;
    setRightTab('research');
    if (!effectiveIsSplit && !isMobileOverlay) toggleSplit();
  }, [effectiveIsSplit, isMobileOverlay, researchEnabled, setRightTab, toggleSplit]);
  const handleResearchToolStart = useCallback(({ name }: { name: string }) => {
    // browser_task is the bounded cloud-research flow for an entitled public
    // task. control_browser may act in the realtor's paired extension, which
    // belongs in the existing Browser experience instead.
    if (name === 'browser_task') openResearchWorkspace();
  }, [openResearchWorkspace]);
  const handleResearchToolResult = useCallback(({ name, data, ok }: { name: string; data: unknown; ok: boolean }) => {
    const timestamp = new Date().toISOString();
    const idPrefix = `research:${++researchResultSequenceRef.current}`;
    const activity = researchActivityFromToolResult({ name, data, ok, idPrefix, timestamp });
    if (!activity) return;

    const validActions = activity.actions
      .filter((action) => RESEARCH_BROWSER_ACTION_TYPES.has(action.type))
      .map((action) => ({ ...action, type: action.type as BrowserActionLogEntry['type'] }));
    if (validActions.length > 0) {
      setResearchActions((previous) => [...previous, ...validActions].slice(-24));
    }
    if (activity.sources.length > 0) {
      setResearchSources((previous) => boundedResearchSources([...previous, ...activity.sources]));
    }
    if (activity.shouldOpen) openResearchWorkspace();
  }, [openResearchWorkspace]);
  const handleWorkspaceToolResult = useCallback((input: { name: string; data: unknown; ok: boolean }) => {
    if (workspaceRunsEnabled && input.name === 'continue_workspace_run' && input.ok && input.data && typeof input.data === 'object') {
      const runId = (input.data as { runId?: unknown; openWorkspacePanel?: unknown }).runId;
      if (typeof runId === 'string' && (input.data as { openWorkspacePanel?: unknown }).openWorkspacePanel === true) {
        setWorkspaceRunId(runId);
        setWorkspaceRunRefreshToken((value) => value + 1);
        setRightTab('workspace');
        if (!effectiveIsSplit && !isMobileOverlay) toggleSplit();
      }
    }
    handleWorkbenchToolResult(input);
    handleResearchToolResult(input);
  }, [effectiveIsSplit, handleResearchToolResult, handleWorkbenchToolResult, isMobileOverlay, setRightTab, toggleSplit, workspaceRunsEnabled]);

  // (no per-plan animation state needed — isAnimating is derived from the
  //  message's streaming flag, which already tracks live vs. settled.)

  const {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    approvalBusy,
    liveCallIds,
    error: agentError,
    streamingReasoning,
    currentAction: serverAction,
    activePlan,
    workActivities,
    send,
    steer,
    attachmentPreviewUrls,
    approve,
    deny,
    alwaysAllow,
    abort,
    retryLastMessage,
    rateLimitSeconds,
    queuedMessages,
    removeQueuedMessage,
    updateQueuedMessage,
  } = useAgentTask({
    spaceSlug: slug,
    conversationId: activeConversationId,
    taskEndpoint: endpoints.taskEndpoint,
    conversationsEndpoint: endpoints.conversationsEndpoint,
    resumeEndpointBase: endpoints.resumeEndpointBase,
    conversationCreatePayload: endpoints.conversationCreatePayload,
    onToolStart: handleResearchToolStart,
    activeWorkbookArtifactId: workbenchArtifactId,
    workExecutionMode,
    conversationMode: chatMode,
    onConversationCreated: (id, mode) => {
      setActiveConversationId(id);
      // Mark as loaded so the conversation-loading effect won't try to
      // re-fetch when the URL update below arrives (messages are already
      // in the UI from the optimistic send).
      loadedConvIdRef.current = id;
      // Minimal placeholder — the sidebar picks up the real title on refresh,
      // and `send` already titled the conversation server-side.
      setConversations((prev) =>
        prev.some((c) => c.id === id)
          ? prev
          : [
              {
                id,
                title: 'New conversation',
                createdAt: new Date(),
                updatedAt: new Date(),
                mode,
                executionMode: workExecutionMode,
              } as ChatConversation,
              ...prev,
            ],
      );
      // Reflect the new conversation in the URL so a refresh (or share)
      // lands on the same transcript. `replace` so the history doesn't
      // grow a step for every new chat.
      router.replace(`${endpoints.routeBase}?conversationId=${encodeURIComponent(id)}`, { scroll: false });
    },
    // The turn we just watched is now settled IN THIS transcript. Claim it so
    // the history loader (which wakes on the isStreaming flip) treats the
    // runner's finished-turn tombstone as already handled instead of blanking
    // and re-fetching the thread — the blank is what made the composer shoot
    // up to the hero and back, and it dropped any answer the server hadn't
    // finished persisting.
    onTurnSettled: (id) => {
      locallyStreamedConvIdRef.current = id;
      loadedConvIdRef.current = id;
    },
    onToolResult: handleWorkspaceToolResult,
  });
  const executionModeChangeDisabled =
    isStreaming || messages.some((message) => message.streaming === true);
  const handleWorkExecutionModeChange = useCallback(
    async (nextMode: WorkExecutionMode) => {
      if (isBroker || executionModeChangeDisabled || nextMode === workExecutionMode) return;

      const previousMode = workExecutionMode;
      setDraftWorkExecutionMode(nextMode);
      if (!activeConversationId) return;

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, executionMode: nextMode }
            : conversation,
        ),
      );

      try {
        const response = await fetch(
          `/api/ai/conversations/${encodeURIComponent(activeConversationId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executionMode: nextMode }),
          },
        );
        if (!response.ok) throw new Error(`execution mode update failed: ${response.status}`);
        const updated = (await response.json()) as ChatConversation;
        const confirmedMode = parseWorkExecutionMode(updated.executionMode);
        setDraftWorkExecutionMode(confirmedMode);
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === activeConversationId
              ? { ...conversation, ...updated, executionMode: confirmedMode }
              : conversation,
          ),
        );
      } catch (error) {
        console.error('[Chat] execution mode update failed', error);
        setDraftWorkExecutionMode(previousMode);
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === activeConversationId
              ? { ...conversation, executionMode: previousMode }
              : conversation,
          ),
        );
        toast.error("Couldn't change how Chippi works. Try again.");
      }
    },
    [
      activeConversationId,
      executionModeChangeDisabled,
      isBroker,
      workExecutionMode,
    ],
  );
  const conversationModeLocked = isConversationModeLocked(messages);
  // Permission prompts are server-authoritative. Review mode pauses for
  // mutations; Autonomous only interrupts for the destructive boundary.
  const pendingConfirmation = pendingApproval;

  // ── Retry support ────────────────────────────────────────────────────────
  // Track whether the user has sent anything this session, purely to decide
  // whether the tail "Try again" affordance is shown. The ACTUAL retry is the
  // hook's retryLastMessage, which re-sends with the original attachmentIds —
  // the old local retry re-sent text only and silently dropped attachments.
  const lastUserMsgRef = useRef<string>('');

  // Rate-limit countdown comes straight from the hook (rateLimitSeconds), which
  // parses the server's real Retry-After (e.g. 600s) and counts it down. The
  // old local timer hardcoded 60s off a brittle error-copy string-match, so the
  // composer re-enabled ~9 minutes early and the user retried into another 429.

  // Wrap approve / alwaysAllow so the moment the realtor approves a
  // celebrate-able tool, the prompt's surface flips into the win sentence.
  // The wrapped callbacks fire-and-forget the underlying action (the hook
  // already kicks off the continuation stream synchronously) and stamp
  // `chatCelebration` with the *current* tail assistant message id so the
  // line lands on the same bubble that asked for approval.
  function celebrateThen<
    F extends (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>,
  >(fn: F): F {
    return ((requestId, editedArgs) => {
      // Snapshot before the hook clears pendingApproval.
      const prompt = pendingApproval;
      if (prompt) {
        const kind = approvalKindForTool(prompt.name);
        if (kind) {
          // Find the assistant message the prompt sits under — it's the tail.
          const tail = [...messages].reverse().find((m) => m.role === 'assistant');
          if (tail) {
            setChatCelebration({
              messageId: tail.id,
              kind,
              subject: approvalSubjectFromArgs(prompt.name, prompt.args),
            });
          }
        }
      }
      return fn(requestId, editedArgs);
    }) as F;
  }
  const approveCelebrating = celebrateThen(approve);
  const alwaysAllowCelebrating = celebrateThen(alwaysAllow);

  // ── Conversation loading ─────────────────────────────────────────────────
  //
  // Single source of truth: the URL's `?conversationId=` param.
  //
  // When the URL changes (sidebar click, new conversation, etc.) we load the
  // matching messages. On initial mount we prefer the server-provided
  // initialMessages (already fetched server-side) to avoid a redundant
  // round-trip. When the server props are stale or empty we fall back to a
  // client fetch from /api/ai/messages.
  //
  // loadedConvIdRef guards against re-loading the same conversation twice
  // (e.g. when React fires the effect after an unrelated state change, or
  // when onConversationCreated updates the URL to the just-created conv).
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get('conversationId');
  const workbenchUrlArtifactId = searchParams.get('workbenchArtifact');
  const loadedConvIdRef = useRef<string | null>(null);
  // The conversation whose latest turn THIS surface watched stream to the end
  // (set by useAgentTask's onTurnSettled). Distinguishes "a turn finished
  // while you were elsewhere — go fetch it" from "the turn finished right
  // here, your transcript is already correct".
  const locallyStreamedConvIdRef = useRef<string | null>(null);
  // True while a history re-fetch is in flight. Suppresses the greeting hero
  // so a momentarily-empty transcript can never bounce the composer up to
  // centre and back down.
  const [historyReloading, setHistoryReloading] = useState(false);
  useEffect(() => {
    if (!workbenchEnabled || !workbenchUrlArtifactId) {
      openedWorkbenchUrlRef.current = null;
      return;
    }
    if (openedWorkbenchUrlRef.current === workbenchUrlArtifactId) return;
    openedWorkbenchUrlRef.current = workbenchUrlArtifactId;
    setWorkbenchArtifactId(workbenchUrlArtifactId);
    setRightTab('workbench');
    if (!effectiveIsSplit && !isMobileOverlay) toggleSplit();
  }, [effectiveIsSplit, isMobileOverlay, setRightTab, toggleSplit, workbenchEnabled, workbenchUrlArtifactId]);

  // Backwards-compatible deep-link: older links used `?view=history` for a
  // fixed overlay. Route that intent into the dashboard's one shared sidebar
  // surface, then clean the URL so refresh does not replay the transition.
  useEffect(() => {
    if (searchParams.get('view') === 'history') {
      requestChippiSidebarView('history', { reveal: true });
      const next = new URLSearchParams(searchParams.toString());
      next.delete('view');
      const qs = next.toString();
      router.replace(`${endpoints.routeBase}${qs ? `?${qs}` : ''}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-boot the Modal chat container the moment the surface mounts. The
  // realtor spends a few seconds reading/typing before the first send — this
  // ping spends those seconds booting the sandbox so the first message never
  // pays the cold start. Fire-and-forget; the server no-ops without Modal
  // configured and rate-limits per user. See app/api/ai/warmup/route.ts.
  useEffect(() => {
    fetch('/api/ai/warmup', { method: 'POST' }).catch(() => {});
  }, []);

  // Broker history comes from the broker-gated `/api/ai/broker-messages`
  // (reads "BrokerMessage"); realtor history from `/api/ai/messages` (reads
  // "Message"). Choosing by variant, mirroring taskEndpoint / conversations-
  // Endpoint above, is what fixes the broker "can't load history after reload"
  // 404 — the realtor endpoint refuses broker conversations by design.
  const messagesEndpoint = endpoints.messagesEndpoint;

  const loadConversation = useCallback(
    async (convId: string): Promise<LegacyMessage[] | null> => {
      try {
        const res = await fetch(`${messagesEndpoint}?conversationId=${encodeURIComponent(convId)}`);
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          console.error('[Chat] fetch failed', res.status, errBody);
          toast.error("Couldn't load that conversation.");
          return null;
        }
        return (await res.json()) as LegacyMessage[];
      } catch (err) {
        console.error('[Chat] fetch error', err);
        toast.error("Couldn't load that conversation.");
        return null;
      }
    },
    [messagesEndpoint],
  );

  useEffect(() => {
    if (isStreaming) return;

    // Determine which conversation the user should see right now.
    // URL is authoritative; fall back to what the server pre-loaded.
    const targetId = urlConversationId ?? initialConversationId ?? null;

    // A turn for this conversation is LIVE at module scope (turn-runner —
    // started on this page or before navigating here). The hook's re-attach
    // path owns the transcript right now; loading history would clobber the
    // streaming scaffold. This effect re-runs when the turn ends
    // (isStreaming dependency) and loads the full, settled history then.
    // Checked via the runner (not the isStreaming closure) because on the
    // mount that re-attaches, this effect still sees the pre-attach false.
    if (targetId && getTurn(turnKey(endpoints.taskEndpoint, targetId))?.status === 'streaming') {
      return;
    }

    // Consume the finished-turn tombstone either way (it's ours to clear), but
    // only ACT on it when the turn finished somewhere this surface wasn't
    // watching. `onTurnSettled` records the ones we streamed ourselves.
    const finished = targetId
      ? Boolean(consumeFinishedTurn(turnKey(endpoints.taskEndpoint, targetId)))
      : false;
    const plan = planHistoryLoad({
      targetId,
      loadedConvId: loadedConvIdRef.current,
      initialConversationId,
      hasServerMessages: initialMessages.length > 0,
      turnFinishedElsewhere: finished && locallyStreamedConvIdRef.current !== targetId,
    });

    if (plan.action === 'idle') return;
    if (plan.action === 'reset') {
      loadedConvIdRef.current = '';
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    const convId = targetId as string;
    setActiveConversationId(convId);
    if (plan.clearFirst) setMessages([]);

    // Server already fetched the right messages for this exact conversation —
    // use them immediately (zero extra round-trip).
    if (plan.action === 'useServerProps') {
      loadedConvIdRef.current = convId;
      const history = legacyToUi(initialMessages);
      // Pre-warm the seen-set: history arrives settled, never animated.
      for (const m of history) seenMessageIdsRef.current.add(m.id);
      setMessages(history);
      return;
    }

    // Server props are empty or stale (e.g. router-cache served an old render,
    // or this is a conversation outside the server's top-50 list). Fetch fresh.
    let cancelled = false;
    setHistoryReloading(true);
    void loadConversation(convId).then((data) => {
      if (cancelled) return;
      setHistoryReloading(false);
      if (data) {
        loadedConvIdRef.current = convId;
        const history = legacyToUi(data);
        // Pre-warm the seen-set: history arrives settled, never animated.
        for (const m of history) seenMessageIdsRef.current.add(m.id);
        setMessages(history);
        return;
      }

      // Load failed (loadConversation already toasted).
      if (!plan.clearFirst) {
        // We're refreshing the thread already on screen — keep it. Wiping a
        // perfectly good transcript because a re-fetch blipped is strictly
        // worse than showing slightly stale history. Claim the id so this
        // effect doesn't immediately retry in a loop.
        loadedConvIdRef.current = convId;
        return;
      }
      // We had already blanked for a switch, so there is nothing to preserve:
      // fall back to the empty surface and drop the bad id from the URL.
      loadedConvIdRef.current = '';
      setActiveConversationId(null);
      setMessages([]);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('conversationId');
      const qs = next.toString();
      router.replace(`${endpoints.routeBase}${qs ? `?${qs}` : ''}`, { scroll: false });
    });

    return () => {
      cancelled = true;
      setHistoryReloading(false);
    };
  }, [
    urlConversationId,
    initialConversationId,
    initialMessages,
    isStreaming,
    loadConversation,
    setMessages,
    searchParams,
    router,
    endpoints.routeBase,
    endpoints.taskEndpoint,
  ]);

  // ── Reopen recovery — the browser-close half of turn survival ───────────
  // A turn keeps generating server-side when the browser closes; the marker
  // (lib/chat/turn-presence.ts) is how a client that reopens later finds
  // out. When the loaded transcript ends in an unanswered user message, ask
  // /api/ai/turn-status: while a turn is in flight, show the thinking row
  // and poll; the moment it clears, fetch fresh history — the persisted
  // answer lands without a manual reload.
  const [recoveringTurn, setRecoveringTurn] = useState(false);
  useEffect(() => {
    if (isStreaming) return;
    const convId = activeConversationId;
    if (!convId || messages.length === 0) return;
    if (messages[messages.length - 1]?.role !== 'user') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sawInFlight = false;
    const startedAt = Date.now();
    // Turns are server-bounded (Modal 600s ceiling + presence TTL 15 min);
    // polling past that would be lying about hope.
    const CAP_MS = 15 * 60_000;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      if (Date.now() - startedAt > CAP_MS) {
        setRecoveringTurn(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/ai/turn-status?conversationId=${encodeURIComponent(convId)}`,
        );
        if (cancelled) return;
        const data = res.ok
          ? ((await res.json()) as { inFlight?: boolean; known?: boolean })
          : null;
        if (cancelled) return;
        if (!data?.known) {
          // Presence unknowable (no Redis) — don't fake a signal.
          setRecoveringTurn(false);
          return;
        }
        if (data.inFlight) {
          sawInFlight = true;
          setRecoveringTurn(true);
          timer = setTimeout(() => void tick(), 2500);
          return;
        }
        // No turn in flight. Only refetch when we actually watched one
        // finish — an unanswered tail with no live turn is settled history
        // (a failed old turn), and refetching would loop this effect.
        setRecoveringTurn(false);
        if (sawInFlight) {
          const fresh = await loadConversation(convId);
          if (cancelled || !fresh) return;
          const history = legacyToUi(fresh);
          for (const m of history) seenMessageIdsRef.current.add(m.id);
          setMessages(history);
        }
      } catch {
        if (!cancelled) setRecoveringTurn(false);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setRecoveringTurn(false);
    };
  }, [messages, activeConversationId, isStreaming, loadConversation, setMessages]);

  // Resolve the route base once. Same URL shape both variants — broker
  // sits at /broker, realtor at /s/<slug>/chippi.
  const chippiBaseUrl = endpoints.routeBase;

  async function handleNewConversation() {
    try {
      const res = await fetch(endpoints.conversationsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...endpoints.conversationCreatePayload,
          ...(!isBroker ? { executionMode: workExecutionMode } : {}),
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't start a new chat.", {
          action: { label: 'Retry', onClick: () => void handleNewConversation() },
        });
        return;
      }
      const conv = (await res.json()) as ChatConversation;
      setConversations((prev) => [conv, ...prev]);
      startConversationTransition(() => {
        router.push(`${chippiBaseUrl}?conversationId=${encodeURIComponent(conv.id)}`, { scroll: false });
      });
    } catch (err) {
      console.error('[Chat] new conversation failed', err);
      toast.error("Couldn't start a new chat.", {
        action: { label: 'Retry', onClick: () => void handleNewConversation() },
      });
    }
  }

  const handleMentionSearch = useCallback(
    async (query: string): Promise<MentionItem[]> => {
      const results: MentionItem[] = [];
      if (isBroker) {
        // Broker mentions are brokerage-scoped: one endpoint searches contacts
        // + deals across ALL member spaces (never a single realtor workspace).
        // Falls through to the shared apps/plugins loop below.
        try {
          const res = await fetch(`/api/broker/mentions?search=${encodeURIComponent(query)}`);
          if (res.ok) {
            const items = (await res.json()) as MentionItem[];
            for (const item of items.slice(0, 20)) results.push(item);
          }
        } catch (err) {
          console.error('[Chat] Broker mention search failed:', err);
          toast.error("Couldn't search contacts or deals.", { id: 'mention-search-error' });
        }
        const bq = query.toLowerCase();
        for (const app of mentionApps) {
          if (!bq || app.label.toLowerCase().includes(bq) || app.slug.toLowerCase().includes(bq)) {
            results.push({ id: `app-${app.slug}`, type: 'app', label: app.label, subtitle: 'App / plugin' });
          }
        }
        return results;
      }
      try {
        const [contactsRes, dealsRes] = await Promise.all([
          fetch(`/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}`),
          fetch(`/api/deals?slug=${encodeURIComponent(slug)}`),
        ]);

        if (contactsRes.ok) {
          const contacts = await contactsRes.json();
          for (const c of contacts.slice(0, 10)) {
            results.push({
              id: c.id,
              type: 'contact',
              label: c.name,
              subtitle: c.email || c.phone || undefined,
            });
          }
        }

        if (dealsRes.ok) {
          const deals = await dealsRes.json();
          const lowerQuery = query.toLowerCase();
          const filtered = lowerQuery
            ? deals.filter((d: { title: string }) => d.title.toLowerCase().includes(lowerQuery))
            : deals;
          for (const d of filtered.slice(0, 10)) {
            results.push({
              id: d.id,
              type: 'deal',
              label: d.title,
              subtitle: d.value ? `$${Number(d.value).toLocaleString()}` : d.address || undefined,
            });
          }
        }
      } catch (err) {
        console.error('[Chat] Mention search failed:', err);
        // Deduplicated by id so a fast typist offline doesn't get a wall
        // of stacked toasts. Sonner replaces the prior toast with the same
        // id; once a search succeeds again the realtor just dismisses it.
        toast.error("Couldn't search contacts or deals.", {
          id: 'mention-search-error',
        });
      }
      // Connected apps + custom plugins — the ChatGPT-Work "@-mention an app
      // to bring its context in". Local filter; the list came from the server.
      const q = query.toLowerCase();
      for (const app of mentionApps) {
        if (!q || app.label.toLowerCase().includes(q) || app.slug.toLowerCase().includes(q)) {
          results.push({ id: `app-${app.slug}`, type: 'app', label: app.label, subtitle: 'App / plugin' });
        }
      }
      return results;
    },
    [isBroker, slug, mentionApps],
  );

  const handleSend = useCallback(
    async (
      text: string,
      mentions: MentionItem[],
      attachmentIds?: string[],
      mode: ChatMode = 'chat',
      attachmentsMeta?: SentAttachmentMeta[],
    ) => {
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      if (!text && !hasAttachments) return false;
      let contextPrefix = '';
      if (mentions.length > 0) {
        const labels = mentions.map((m) =>
          m.type === 'app'
            ? `[Use the ${m.label} app/plugin for this request]`
            : `[${m.type === 'contact' ? 'Contact' : 'Deal'}: ${m.label}]`,
        );
        contextPrefix = `(Referencing: ${labels.join(', ')})\n\n`;
      }

      // Record the full text so the retry button can replay it.
      lastUserMsgRef.current = contextPrefix + text;
      // The first send fixes this conversation's product mode locally while
      // the database claim runs. Existing server modes always win.
      if (activeConversationId) {
        setConversations((previous) => previous.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, mode: conversation.mode ?? mode }
            : conversation,
        ));
      }
      // Opt-in send chime. Gated inside softTap() so the call site stays
      // clean — the helper no-ops when the realtor hasn't enabled sound
      // or when reduced-motion is on.
      softTap();

      const accepted = await send(contextPrefix + text, attachmentIds, mode, attachmentsMeta);
      if (!accepted) return false;

      // Bump the sidebar's conversation ordering.
      const cid = activeConversationId;
      if (cid) {
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === cid);
          if (!conv) return prev;
          return [{ ...conv, updatedAt: new Date() }, ...prev.filter((c) => c.id !== cid)];
        });
      }
      return true;
    },
    [send, activeConversationId],
  );

  const handleSteer = useCallback(
    async (text: string, mentions: MentionItem[], mode: ChatMode = 'work') => {
      if (!text.trim()) return false;
      const references = mentions.map((mention) =>
        mention.type === 'app'
          ? `[Use the ${mention.label} app/plugin for this request]`
          : `[${mention.type === 'contact' ? 'Contact' : 'Deal'}: ${mention.label}]`,
      );
      const contextPrefix = references.length > 0
        ? `(Referencing: ${references.join(', ')})\n\n`
        : '';
      softTap();
      return steer(contextPrefix + text, mode);
    },
    [steer],
  );

  const steerQueuedMessage = useCallback(async (turnId: string, text: string, mode: ChatMode) => {
    const removed = await removeQueuedMessage(turnId);
    if (!removed) return;
    await handleSteer(text, [], mode);
  }, [handleSteer, removeQueuedMessage]);

  const saveQueuedEdit = useCallback(async () => {
    if (!queuedEditId) return;
    const saved = await updateQueuedMessage(queuedEditId, queuedEditText);
    if (saved) {
      setQueuedEditId(null);
      setQueuedEditText('');
    }
  }, [queuedEditId, queuedEditText, updateQueuedMessage]);

  // Auto-send when arriving from the command palette via ?q= — fires once on
  // mount only. handleSendRef lets us read the latest handleSend without
  // adding it to the deps array (which would re-trigger on every send).
  const autoSentRef = useRef(false);
  const handleSendRef = useRef(handleSend);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => {
    if (initialInput && initialMessages.length === 0 && !autoSentRef.current) {
      autoSentRef.current = true;
      void handleSendRef.current(initialInput, []);
    }
    // Intentionally empty deps — this must fire exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atLimit = messages.length >= MESSAGE_LIMIT;
  // The greeting hero. Gated on BOTH loading signals: an empty `messages` in
  // the middle of a conversation switch or a history re-fetch is a transient,
  // not "this realtor has no conversation" — and treating it as the latter
  // swaps the surface to the hero and FLIP-glides the composer to centre and
  // back, the "input shoots up and then back down" glitch.
  const isEmpty = messages.length === 0 && !isLoadingConversation && !historyReloading;
  // Prefer the Chippi profile name (chosen at onboarding) over the Clerk
  // identity, which Google OAuth seeds from the user's Gmail account.
  const firstName = (accountName ?? '').trim().split(/\s+/)[0] || (user?.firstName ?? '');

  // Time-of-day greeting for the empty-state hero. Computed client-side
  // (the server doesn't know the realtor's local hour); we render an
  // invisible non-breaking space until the hour is set so the heading
  // doesn't collapse and bump the composer up on first paint.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);
  const greeting = (() => {
    if (hour === null) return '';
    const name = firstName.trim();
    if (hour >= 5 && hour < 12) return name ? `Good morning, ${name}` : 'Good morning';
    if (hour >= 12 && hour < 19) return name ? `Good afternoon, ${name}` : 'Good afternoon';
    return 'Working late?';
  })();

  // Composer prefill — bumped by the day-one welcome's "Tell me about a lead"
  // action, and seeded on mount when arriving from `?prefill=` (the
  // "or just tell Chippi →" shortcuts on /contacts and /deals, and
  // morning-actions). Nonce so identical text twice in a row still re-applies.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(
    initialPrefill ? { text: initialPrefill, nonce: Date.now() } : null,
  );
  useEffect(() => {
    if (initialConversationId || initialMessages.length > 0) return;
    let handoff: ReturnType<typeof consumeWorkDraftHandoff> = null;
    try {
      handoff = consumeWorkDraftHandoff(window.sessionStorage, slug);
    } catch {
      return;
    }
    if (!handoff) return;
    setChatMode('work');
    writeStoredChatMode(null, 'work');
    setDraftWorkExecutionMode(handoff.executionMode);
    // Today is a direct Work launcher, not another drafting surface. Submit
    // the consumed handoff through the same durable acceptance path as the
    // composer. If acceptance fails, restore the exact goal to the composer
    // so nothing is lost and the realtor can retry.
    void handleSendRef.current(handoff.text, [], undefined, 'work').then((accepted) => {
      if (!accepted) setPrefill({ text: handoff.text, nonce: Date.now() });
    });
  }, [initialConversationId, initialMessages.length, slug]);
  const handleTellMeAboutLead = useCallback((text: string) => {
    setPrefill({ text, nonce: Date.now() });
  }, []);

  const handleVoiceDelegated = useCallback(
    (work: DelegatedWork) => {
      setActiveConversationId(work.conversationId);
      setConversations((prev) => {
        const existing = prev.find((conversation) => conversation.id === work.conversationId);
        if (existing) {
          return [
            { ...existing, updatedAt: new Date() },
            ...prev.filter((conversation) => conversation.id !== work.conversationId),
          ];
        }
        return [
          {
            id: work.conversationId,
            title: fallbackHeuristic(work.goal),
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ChatConversation,
          ...prev,
        ];
      });
      setMessages((prev) => {
        if (
          prev.some((message) =>
            message.blocks.some(
              (block) => block.type === 'work_session' && block.sessionId === work.sessionId,
            ),
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            id: `voice-user-${work.sessionId}`,
            role: 'user',
            blocks: [{ type: 'text', content: `Start a work session: ${work.goal}` }],
          },
          {
            id: `voice-assistant-${work.sessionId}`,
            role: 'assistant',
            blocks: [
              { type: 'text', content: 'I started this as a background work session.' },
              {
                type: 'work_session',
                sessionId: work.sessionId,
                goal: work.goal,
                source: 'voice',
              },
            ],
          },
        ];
      });
      router.replace(
        `${chippiBaseUrl}?conversationId=${encodeURIComponent(work.conversationId)}`,
        { scroll: false },
      );
      toast.success('Work session started. Voice is still connected.');
    },
    [chippiBaseUrl, router, setMessages],
  );

  const handleVoiceWorkspaceContinuation = useCallback((work: { conversationId: string; callId: string; instruction: string; runId: string; taskId: string; status: string }) => {
    if (!workspaceRunsEnabled) return;
    setWorkspaceRunId(work.runId);
    setWorkspaceRunRefreshToken((value) => value + 1);
    setRightTab('workspace');
    if (!effectiveIsSplit && !isMobileOverlay) toggleSplit();
    setMessages((previous) => {
      if (previous.some((message) => message.blocks.some((block) => block.type === 'tool_call' && block.callId === work.callId))) return previous;
      return [...previous,
        { id: `voice-user-${work.callId}`, role: 'user', blocks: [{ type: 'text', content: `Continue the workspace: ${work.instruction}` }] },
        { id: `voice-assistant-${work.callId}`, role: 'assistant', blocks: [
          { type: 'text', content: 'I started a private workspace continuation.' },
          { type: 'tool_call', callId: work.callId, name: 'continue_workspace_run', args: { instruction: work.instruction }, result: { ok: true, summary: 'I started a private workspace continuation.', data: { runId: work.runId, taskId: work.taskId, status: work.status, openWorkspacePanel: true } }, status: 'complete', display: 'success' },
        ] },
      ];
    });
  }, [effectiveIsSplit, isMobileOverlay, setMessages, setRightTab, toggleSplit, workspaceRunsEnabled]);

  const handleVoiceSpecialistControlled = useCallback((runId: string) => {
    window.dispatchEvent(new CustomEvent('chippi:swarm-refresh', { detail: { runId } }));
  }, []);

  const handleVoiceSpecialistSpawned = useCallback((work: { conversationId: string; runId: string; callId: string; goal: string; status: string }) => {
    setActiveConversationId(work.conversationId);
    loadedConvIdRef.current = work.conversationId;
    setConversations((previous) => previous.some((conversation) => conversation.id === work.conversationId)
      ? previous
      : [{
          id: work.conversationId,
          title: fallbackHeuristic(work.goal),
          createdAt: new Date(),
          updatedAt: new Date(),
          mode: 'work',
          executionMode: workExecutionMode,
        } as ChatConversation, ...previous]);
    setMessages((previous) => {
      if (previous.some((message) => message.blocks.some((block) => block.type === 'subagent_task' && block.runId === work.runId))) return previous;
      return [...previous,
        { id: `voice-user-${work.callId}`, role: 'user', blocks: [{ type: 'text', content: `Start a specialist team: ${work.goal}` }] },
        { id: `voice-assistant-${work.callId}`, role: 'assistant', blocks: [
          { type: 'text', content: work.status === 'queued' ? 'I queued a specialist team for this background goal.' : 'The specialist request is being reconciled.' },
          { type: 'subagent_task', callId: work.callId, runId: work.runId, goal: work.goal },
        ] },
      ];
    });
    router.replace(`${chippiBaseUrl}?conversationId=${encodeURIComponent(work.conversationId)}`, { scroll: false });
    toast.success('Specialist team queued. Voice is still connected.');
  }, [chippiBaseUrl, router, setMessages, workExecutionMode]);

  useEffect(() => subscribeToChippiVoiceWorkspaceEvents((event) => {
    if (event.type === 'delegated') {
      handleVoiceDelegated(event.work);
      return;
    }
    if (event.type === 'workspace_continued') {
      handleVoiceWorkspaceContinuation(event.work);
      return;
    }
    if (event.type === 'specialist_spawned') {
      handleVoiceSpecialistSpawned(event.work);
      return;
    }
    handleVoiceSpecialistControlled(event.runId);
  }), [
    handleVoiceDelegated,
    handleVoiceSpecialistControlled,
    handleVoiceSpecialistSpawned,
    handleVoiceWorkspaceContinuation,
  ]);

  // Counts for the header status sentence. Fetch only when we're rendering
  // the today view — no point pinging while in an active conversation. The
  // child sections still self-fetch their own data; this is a lightweight
  // duplicate read for a one-line summary.
  //
  // Broker variant doesn't surface drafts/questions on the chat home —
  // those endpoints are space-scoped (realtor-only). Skip the fetch.
  const [counts, setCounts] = useState<{ drafts: number; questions: number }>({
    drafts: 0,
    questions: 0,
  });
  const [countsLoaded, setCountsLoaded] = useState(false);
  useEffect(() => {
    if (!isEmpty) return;
    if (isBroker) {
      setCountsLoaded(true);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const [draftsRes, questionsRes] = await Promise.all([
          fetch('/api/agent/drafts?status=pending&limit=50', { signal: controller.signal }),
          fetch('/api/agent/questions?status=pending&limit=50', { signal: controller.signal }),
        ]);
        const drafts = draftsRes.ok ? await draftsRes.json() : [];
        const questions = questionsRes.ok ? await questionsRes.json() : [];
        setCounts({
          drafts: Array.isArray(drafts) ? drafts.length : 0,
          questions: Array.isArray(questions) ? questions.length : 0,
        });
      } catch {
        // non-critical — header just falls back to a generic line
      } finally {
        setCountsLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [isEmpty, isBroker]);


  // Run Now — kicks off a background sweep and tells the user via toast.
  const [running, setRunning] = useState(false);
  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      if (res.ok && data?.triggered) {
        toast.success(
          data.method === 'modal'
            ? "On it. New drafts will land here."
            : "Queued. I'll pick it up on the next sweep (~15 min).",
        );
      } else {
        toast.error("Couldn't kick myself off. Try again.");
      }
    } catch {
      toast.error("I lost the connection. Try again.");
    } finally {
      setRunning(false);
    }
  }

  // The trailing assistant message — used to detect the "thinking" state
  // and to pin the permission prompt at the end of the transcript.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  // A turn is live from the moment `send` pushes the optimistic assistant
  // bubble, not from the moment the SSE connection opens. Those differ by a
  // whole `POST /api/ai/conversations` round-trip on a fresh chat; keying the
  // indicator on `isStreaming` alone left that window showing a hollow
  // orb-and-nothing bubble with no thinking line — dead air on the very first
  // message, which is exactly where confidence is won or lost.
  const turnActive = isStreaming || Boolean(tailMessage?.streaming);
  // The indicator block (avatar + shimmer line + optional plan card) only
  // renders when the runtime has something real to show.
  // Once real assistant text starts flowing, currentAction → null and
  // the indicator slides out — the chat bubble takes over.

  // Best-effort: map tool name keywords to which plan step is likely active.
  // Matches on lower-cased step title. Not guaranteed to be exact — just a
  // visual hint while the agent is running.
  const TOOL_STEP_KEYWORDS: Record<string, string[]> = {
    search_contacts: ['contact'],
    find_contacts: ['contact'],
    find_person: ['contact'],
    get_contact: ['contact'],
    send_email: ['email', 'draft'],
    draft_email: ['email', 'draft'],
    send_sms: ['sms', 'message', 'text'],
    draft_sms: ['sms', 'message', 'text'],
    advance_deal_stage: ['deal', 'stage'],
    create_deal: ['deal'],
    mark_deal_won: ['deal'],
    mark_deal_lost: ['deal'],
    find_deal: ['deal'],
    search_deals: ['deal'],
    find_stuck_deals: ['deal'],
    pipeline_summary: ['pipeline', 'deal'],
    schedule_tour: ['tour', 'calendar', 'schedule'],
    reschedule_tour: ['tour', 'calendar', 'schedule'],
    find_tours: ['tour', 'calendar'],
    set_followup: ['follow'],
    clear_followup: ['follow'],
    recall_history: ['history', 'note'],
    note_on_person: ['note'],
    note_on_deal: ['note'],
  };

  const activePlanStepIndex = useMemo<number | undefined>(() => {
    if (!tailMessage || !liveCallIds || liveCallIds.size === 0) return undefined;
    // Find the name of the currently live tool call.
    let liveToolName: string | undefined;
    for (const block of tailMessage.blocks) {
      if (
        block.type === 'tool_call' &&
        'callId' in block &&
        liveCallIds.has((block as { callId: string }).callId)
      ) {
        liveToolName = (block as { name: string }).name;
        break;
      }
    }
    if (!liveToolName) return undefined;
    // Find the plan (create_plan) block in the same message to get step list.
    const planBlock = tailMessage.blocks.find(
      (b): b is ToolCallBlock => b.type === 'tool_call' && (b as ToolCallBlock).name === 'create_plan',
    );
    if (!planBlock) return undefined;
    const plan = parsePlanResult(planBlock.result?.data ?? planBlock.args);
    if (!plan) return undefined;
    // Match the live tool name against step titles via keywords.
    const keywords = TOOL_STEP_KEYWORDS[liveToolName] ?? [];
    if (keywords.length === 0) return undefined;
    const matchIndex = plan.steps.findIndex((s) =>
      keywords.some((kw) => s.title.toLowerCase().includes(kw)),
    );
    return matchIndex >= 0 ? matchIndex : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailMessage, liveCallIds]);

  const inlineWorkSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      for (const block of message.blocks) {
        if (block.type === 'work_session') ids.add(block.sessionId);
      }
    }
    return ids;
  }, [messages]);

  // Activity copy comes from the runtime stream. The workspace no longer
  // guesses whether a Work turn is cold-starting or rotates timer-based Modal
  // phrases; normalized status/tool events are the only source of truth.
  const currentAction = turnActive ? serverAction : null;

  // Keep the optimistic assistant row visibly alive from acceptance through
  // the first grounded runtime receipt. "Thinking…" is the one deliberately
  // non-specific pre-grounded label; once text arrives the hook clears the
  // tail streaming state and this line yields to the response in place.
  const showThinking =
    (turnActive && tailMessage?.role === 'assistant') ||
    recoveringTurn;

  const chatLiveEdge = useChatLiveEdge({
    conversationKey: activeConversationId,
    reduceMotion,
  });

  // Live state for Chippi's orb avatar, read from what the turn is doing right
  // now: running a tool or executing a plan reads as "solving" (energetic);
  // streaming/reasoning with nothing concrete yet is "working" (the thinking
  // read); idle between turns is "listening". Settled history rows freeze the
  // orb via `paused`.
  const orbState: OrbState = useMemo(() => {
    if ((liveCallIds && liveCallIds.size > 0) || activePlan) return 'solving';
    if (turnActive || recoveringTurn) return 'working';
    return 'listening';
  }, [liveCallIds, activePlan, turnActive, recoveringTurn]);

  // Reusable input — shared between the empty hero and the docked footer
  // so the focal point lives wherever it should. The `/` skills menu lives
  // inside ChippiPromptBox itself.
  const renderInput = () => (
    <div>
      {/* Live background work sessions — plan progress, questions,
          and the finished report, updating over Supabase Realtime. */}
      {spaceId && !isBroker && (
        <WorkSessionsStrip
          slug={slug}
          spaceId={spaceId}
          hiddenSessionIds={inlineWorkSessionIds}
        />
      )}
      {/* Keep the existing composer and mode control exactly where they are.
          Queue controls live in one bounded rail immediately above it. */}
      {queuedMessages.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {queuedMessages.map((q) => (
            <div
              key={q.id}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm"
            >
              {queuedEditId === q.id ? (
                <input
                  autoFocus
                  value={queuedEditText}
                  onChange={(event) => setQueuedEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveQueuedEdit();
                    if (event.key === 'Escape') setQueuedEditId(null);
                  }}
                  aria-label="Edit queued message"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{q.text}</span>
              )}
              {queuedEditId === q.id ? (
                <button
                  type="button"
                  onClick={() => { void saveQueuedEdit(); }}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { void steerQueuedMessage(q.id, q.text, q.mode); }}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Steer
                </button>
              )}
              <button
                type="button"
                onClick={() => { void removeQueuedMessage(q.id); }}
                aria-label="Remove queued message"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Queued message options"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem
                    onSelect={() => {
                      setQueuedEditId(q.id);
                      setQueuedEditText(q.text);
                    }}
                  >
                    <Pencil size={14} />
                    Edit message
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
      <ChippiPromptBox
        placeholder="Tell me what you need, or press / for skills…"
        onSend={handleSend}
        onSteer={handleSteer}
        onMentionSearch={handleMentionSearch}
        onAbort={abort}
        // NOT locked while streaming or waiting on an approval — typing
        // stays live and Enter queues the next thought. Rate limits still lock it.
        disabled={rateLimitSeconds > 0}
        isLoading={turnActive}
        prefill={prefill ?? undefined}
        skills={skills}
        chatMode={chatMode}
        onModeChange={conversationModeLocked ? undefined : selectChatMode}
        modeLocked={conversationModeLocked}
        onVoiceStart={
          realtimeVoiceEnabled && !isBroker
            ? () => requestChippiVoice({ conversationId: activeConversationId })
            : undefined
        }
      />
      {/* Rate-limit countdown — shown below the composer when the API is
          throttling. Counts down from 60 s and disappears automatically. */}
      {rateLimitSeconds > 0 && (
        <p className="text-xs text-muted-foreground/70 text-center py-2">
          Ready in {Math.floor(rateLimitSeconds / 60)}:{String(rateLimitSeconds % 60).padStart(2, '0')}
        </p>
      )}
    </div>
  );

  // Settings view — entirely separate surface; no chat input, no today feed.
  if (view === 'settings') {
    return (
      <div className="relative flex flex-col h-full min-h-0 overflow-y-auto">
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Link
                href={`/s/${slug}/chippi`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={12} />
                Back to Chippi
              </Link>
              <h1
                className="text-3xl tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Tune what Chippi does on its own and what it brings to you.
              </p>
            </div>
          </div>
          <AgentSettingsPanel slug={slug} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      {/* ── Main content area — supports split panel on desktop ──── */}
      <div className="flex flex-1 min-w-0 overflow-hidden" ref={containerRef}>
        {/* Left panel — all chat/workspace content */}
        <div
          className="relative flex flex-col h-full overflow-hidden min-w-0"
          style={{ width: effectiveIsSplit ? `${leftWidthPercent}%` : '100%' }}
        >
      {shouldShowModeSwitch(variant)
        && !conversationModeLocked
        && !historyReloading
        && !isLoadingConversation && (
        <div className="absolute left-1/2 top-1.5 z-20 hidden -translate-x-1/2 sm:top-2 sm:block">
          <ChatWorkModeSwitch
            mode={chatMode}
            onChange={selectChatMode}
            disabled={pendingConfirmation !== null || rateLimitSeconds > 0}
          />
        </div>
      )}
      {/* Floating control cluster — top-right, no top bar chrome.
          Four affordances + one menu trigger. The composer below is the
          focal element on this surface; this row stays a small calm
          shelf instead of competing with it. Voice, Run now, memory, and
          settings live inside the More menu — primary chat actions (new
          chat, history, Chat confirmations, split) earn the visible row.
          Pre-fix this cluster carried eight competing icons plus a
          message-limit counter; the DOET audit (PR #101) called it a
          score-2 Discoverability failure.

          STRUCTURAL fix: this cluster lives INSIDE the left (chat) pane's
          container — which is `relative` and sized to exactly
          `leftWidthPercent`% — instead of the workspace root. That makes
          overlap with the right panel impossible by construction: the
          cluster's `absolute` positioning resolves against a box that never
          extends past the chat pane's own right edge, split or not, mid-drag
          or settled. A previous fix chased this with an inline
          `right: calc((100-leftWidthPercent)% + 1rem)` offset against the
          workspace root; that arithmetic drifted and the cluster still
          covered the right panel's Documents/Browser tabs (screenshot-
          verified bug). No calc() needed once the cluster is anchored to the
          pane it actually belongs to. */}
      <div className="absolute top-1.5 right-2 sm:top-2 sm:right-3 z-20 flex items-center gap-1.5">
        {!isBroker && chatMode === 'work' && (
          <WorkExecutionModeMenu
            value={workExecutionMode}
            onChange={(mode) => void handleWorkExecutionModeChange(mode)}
            disabled={executionModeChangeDisabled}
          />
        )}
        {!isBroker &&
          (chatMode === 'chat' ||
            (chatMode === 'work' && workExecutionMode === 'review')) && (
            <ApprovalsPill />
          )}
        {/* One three-dots menu — folds New chat, History, Brief/Drafts, and
            (realtor) Run now / Memory / Chippi settings into a single animated
            dropdown so the chat surface stays open instead of carrying a row of
            stacked icons. The fade+slide is the shared EASE_OUT curve baked
            into DropdownMenuContent (components/ui/dropdown-menu.tsx,
            motion-reduce aware). Routes resolve per variant — realtor:
            /s/<slug>/chippi/*, broker: /broker/* — never a broken /s//… href. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors data-[state=open]:bg-foreground/[0.045] data-[state=open]:text-foreground"
              title="Menu"
              aria-label="Chat menu"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-48">
            <DropdownMenuItem onSelect={() => void handleNewConversation()} className="cursor-pointer">
              <SquarePen size={14} className="mr-2" />
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => requestChippiSidebarView('history', { reveal: true })}
              className="cursor-pointer"
            >
              <History size={14} className="mr-2" />
              History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href={isBroker ? '/broker/brief' : `/s/${slug}/chippi/brief`}
                className="cursor-pointer"
              >
                <BookOpen size={14} className="mr-2" />
                Brief
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={isBroker ? '/broker/reviews' : `/s/${slug}/chippi/inbox`}
                className="cursor-pointer"
              >
                <Inbox size={14} className="mr-2" />
                {isBroker ? 'Reviews' : 'Drafts'}
              </Link>
            </DropdownMenuItem>
            {!isBroker && (
              <>
                <DropdownMenuSeparator />
                {isEmpty && (
                  <DropdownMenuItem
                    onSelect={() => void handleRunNow()}
                    disabled={running}
                    className="cursor-pointer"
                  >
                    {running ? (
                      <Loader2 size={14} className="mr-2 animate-spin" />
                    ) : (
                      <Play size={14} className="mr-2" />
                    )}
                    Run now
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href={`/s/${slug}/chippi/memory`} className="cursor-pointer">
                    <NotebookText size={14} className="mr-2" />
                    Memory
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/s/${slug}/chippi?tab=settings`} className="cursor-pointer">
                    <Settings size={14} className="mr-2" />
                    Chippi settings
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Split / live-work side panel — enabled on both variants. Broker's
            RightPanel embeds the brokerage-scoped /broker/* routes plus the
            universal activity + browser tabs (see RightPanel variant).
            Below md, `toggle` opens the mobile full-screen overlay instead
            of the desktop split (see useSplitPanel) — `isOpen` reflects
            whichever of the two is actually showing so the icon/label stays
            honest on every width. */}
        <SplitPanelToggle isSplit={effectiveIsSplit || isMobileOverlay} onToggle={toggleSplit} />
      </div>

      {/* ── Today view (no active conversation) ───────────────────── */}
      {isLoadingConversation || (historyReloading && messages.length === 0) ? (
        /* Skeleton mirrors the empty-state hero shape below — a centered
           greeting-sized placeholder + a composer-sized rectangle pinned to
           the bottom. Same shapes as app/s/[slug]/chippi/loading.tsx so the
           in-component transition between conversations and the route-level
           Suspense fallback feel like one calm fade, not two surfaces. */
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-16 sm:pb-20">
            <div className="w-full max-w-2xl flex flex-col items-center">
              <div
                className="h-10 w-2/3 max-w-md rounded-lg bg-muted/40 animate-pulse"
                aria-hidden
              />
            </div>
          </div>
          <div className="sticky bottom-0 z-10 w-full max-w-3xl mx-auto chat-content-wrap pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div
              className="h-14 w-full rounded-2xl bg-muted/40 animate-pulse"
              aria-hidden
            />
          </div>
          <span className="sr-only">Loading conversation…</span>
        </>
      ) : (
        /* Empty ⇄ active — ONE composer, two homes.
           The composer renders exactly once, OUTSIDE the AnimatePresence
           below, as a `layout`-animated motion.div near the bottom of this
           flex column. In the empty state, the flex spacer after it holds
           it at the vertical center under the greeting; when the first
           message sends, the hero region swaps for the transcript, the
           spacer unmounts, and framer-motion's FLIP layout animation GLIDES
           the composer down to its docked position — no remount, no focus
           loss, and structurally never two textareas in the DOM (the
           failure mode of the earlier shared-layoutId attempt; a layoutId
           stays unnecessary because the element itself persists). The
           optimistic user bubble + thinking indicator mount in the same
           React commit as the flip — popLayout pops the exiting hero out of
           flow immediately, so there is NO dead-time window before the
           first visible signal. `initial={false}` keeps the first paint
           static. Reduced motion: the glide collapses to an instant snap
           (layout={false}) and the region swap is a plain crossfade. */
        <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {isEmpty ? (
            <motion.div
              key="empty-hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="flex-1 min-h-0 flex flex-col items-center justify-end px-4 sm:px-6"
            >
              {/* The daily brief lives at /chippi/brief (sidebar entry).
                  It used to render inline above the composer here on the
                  empty workspace, but the focal serif headline + cards
                  competed with the chat hero — two focal elements on one
                  page. The brief is the brief's surface; the workspace
                  home is the chat surface. Each does one thing. */}
              <div className="w-full max-w-2xl">
                <motion.h1
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: greeting ? 1 : 0, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                    className="text-center text-[2.25rem] sm:text-[2.75rem] tracking-tight leading-tight text-foreground mb-3 sm:mb-4"
                    style={{ fontFamily: 'var(--font-title)' }}
                  >
                    {greeting || ' '}
                  </motion.h1>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key="active-conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Active thread */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <ScrollArea ref={chatLiveEdge.rootRef} className="h-full">
              <div
                ref={chatLiveEdge.contentRef}
                className="w-full max-w-3xl mx-auto chat-content-wrap pt-12 sm:pt-14 pb-36"
                aria-busy={turnActive || recoveringTurn}
              >
                {/* Conversation title — quiet, only when we have one */}
                {activeConversationId && (
                  <div className="mb-6">
                    <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {conversations.find((c) => c.id === activeConversationId)?.title ?? ''}
                    </p>
                  </div>
                )}

                <div className="space-y-7">
                  {messages.map((msg, i) => {
                    const isTail = i === messages.length - 1;
                    // First time we see this id → run the entrance animation.
                    // Subsequent renders (re-mount during scroll virtualization
                    // would also hit this code path, though we don't virtualize)
                    // skip it, and loading a conversation from history mounts
                    // silently (the seen-set is pre-warmed per conversation).
                    // Assistant bubbles: 8px slide-in. User bubbles: a short
                    // upward lift (+12px) from the direction of the composer,
                    // so a sent message reads as lifting OUT of the input and
                    // into the transcript — one continuous gesture with the
                    // hero→dock composer glide on the first send. Both are
                    // suppressed under reduced motion.
                    const isFresh = !seenMessageIdsRef.current.has(msg.id);
                    if (isFresh) seenMessageIdsRef.current.add(msg.id);
                    const animateEntrance =
                      isFresh && !reduceMotion && msg.role === 'assistant';
                    const animateUserLift =
                      isFresh && !reduceMotion && msg.role === 'user';

                    if (msg.role === 'assistant') {
                      // Find any create_plan tool call in this message and
                      // render a PlanCard inline below the transcript blocks.
                      const planBlocks = msg.blocks.filter(
                        (b): b is ToolCallBlock =>
                          b.type === 'tool_call' && b.name === 'create_plan',
                      );

                      return (
                        <motion.div
                          key={msg.id}
                          className="flex gap-3"
                          initial={animateEntrance ? { opacity: 0, y: 8 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {/* mt-[3px] centers the 20px orb on the first text
                              line (pt-0.5 + text-sm leading-relaxed ≈ 23px). */}
                          <ThinkingOrb
                            state={msg.streaming && turnActive ? orbState : 'listening'}
                            paused={!(msg.streaming && turnActive)}
                            size={20}
                            className="mt-[3px]"
                          />
                          <div className="flex-1 min-w-0 pt-0.5 space-y-3">
                            {shouldShowInlineWorkActivity({
                              chatMode,
                              isTail,
                              turnActive,
                              eventCount: workActivities.length,
                            }) && (
                              <WorkActivityTimeline events={workActivities} />
                            )}
                            {isTail && showThinking && activePlan && planBlocks.length === 0 && shouldShowPlanCard(activePlan.steps.length) && (
                              <PlanCard
                                task={activePlan.task}
                                steps={activePlan.steps}
                                isAnimating={true}
                                activeStepIndex={activePlanStepIndex}
                              />
                            )}
                            {/* PlanCard — rendered for each create_plan tool
                                call. Falls back to args so the card appears
                                immediately on tool_call_start (before result
                                comes in), which is the only data available in
                                the Modal runtime path. */}
                            {planBlocks.map((planBlock) => {
                              const plan = parsePlanResult(planBlock.result?.data ?? planBlock.args);
                              if (!plan || !shouldShowPlanCard(plan.steps.length)) return null;
                              // Animate steps in while the message is still
                              // streaming; show settled state for history.
                              const isAnimating = !!(msg.streaming && turnActive);
                              return (
                                <PlanCard
                                  key={planBlock.callId}
                                  task={plan.task}
                                  steps={plan.steps}
                                  isAnimating={isAnimating}
                                  activeStepIndex={isAnimating ? activePlanStepIndex : undefined}
                                />
                              );
                            })}
                            {isTail && showThinking && (
                              <ThinkingIndicator
                                currentAction={
                                  recoveringTurn
                                    ? 'Still working on your last message…'
                                    : currentAction ?? 'Thinking…'
                                }
                                streamingReasoning={streamingReasoning}
                              />
                            )}
                            <Transcript
                              blocks={msg.blocks}
                              messageId={msg.id}
                              role={msg.role}
                              streaming={msg.streaming && turnActive}
                              announceText={!(
                                isTail &&
                                chatMode === 'work' &&
                                workActivities.length > 0
                              )}
                              liveCallIds={liveCallIds}
                              onUserIntent={(text) => {
                                void handleSend(text, [], undefined, chatMode);
                              }}
                              onOpenWorkbench={workbenchEnabled ? openWorkbenchArtifact : undefined}
                              pendingApproval={
                                isTail && pendingConfirmation
                                  ? {
                                      prompt: pendingConfirmation,
                                      onApprove: approveCelebrating,
                                      onDeny: deny,
                                      onAlwaysAllow:
                                        chatMode === 'chat' ? alwaysAllowCelebrating : undefined,
                                      busy: approvalBusy,
                                    }
                                  : undefined
                              }
                              approvalCelebration={
                                chatCelebration && chatCelebration.messageId === msg.id
                                  ? {
                                      kind: chatCelebration.kind,
                                      subject: chatCelebration.subject,
                                      onDone: () => setChatCelebration(null),
                                    }
                                  : undefined
                              }
                            />
                            {/* Inline retry button — shown on the tail error
                                message so the realtor doesn't have to retype. */}
                            {shouldShowFollowUpSuggestions({
                              isTail,
                              role: 'assistant',
                              turnActive,
                              hasError: Boolean(agentError),
                              pendingApproval: pendingConfirmation !== null,
                            }) && (
                              <SuggestedActions
                                suggestions={getSuggestionsForTurn(msg.blocks)}
                                onSelect={(text) => {
                                  void handleSend(text, [], undefined, chatMode);
                                }}
                              />
                            )}
                            {isTail && agentError && !isStreaming && lastUserMsgRef.current && (
                              <button
                                type="button"
                                onClick={() => void retryLastMessage()}
                                className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                              >
                                <RotateCcw size={11} />
                                Try again
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    }
                    return (
                      <motion.div
                        key={msg.id}
                        initial={animateUserLift ? { opacity: 0, y: 12 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                      >
                        <Transcript
                          blocks={msg.blocks}
                          messageId={msg.id}
                          role={msg.role}
                          streaming={msg.streaming && turnActive}
                          liveCallIds={liveCallIds}
                          localUrls={attachmentPreviewUrls}
                          onUserIntent={(text) => {
                            void handleSend(text, [], undefined, chatMode);
                          }}
                          onOpenWorkbench={workbenchEnabled ? openWorkbenchArtifact : undefined}
                        />
                      </motion.div>
                    );
                  })}

                  {/* Errors land inline as Chippi assistant messages
                      (see useAgentTask.landChippiError) so the failure mode
                      reads like Chippi talking, not a red system banner. The
                      `error` state is still tracked for telemetry / a11y but
                      not rendered here. */}

                  <div ref={bottomRef} />
                </div>
              </div>
            </ScrollArea>
            <AnimatePresence>
              {!chatLiveEdge.following && chatLiveEdge.hasNewContent && (
                <motion.button
                  key="jump-to-latest"
                  type="button"
                  onClick={chatLiveEdge.jumpToLatest}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Jump to latest
                </motion.button>
              )}
            </AnimatePresence>
          </div>

            </motion.div>
          )}
        </AnimatePresence>

          {/* The standalone Stop button used to live here — moved into the
              composer's right-slot (Send → Stop swap) so the abort affordance
              sits exactly where the user's eye is. ChatGPT / Claude pattern. */}

          {/* The ONE composer — hero-centered or bottom-docked, same element.
              `layout="position"` FLIP-glides it between the two homes when
              `isEmpty` flips (see the architecture note above); width is
              max-w-3xl in both states so the glide is pure translation, no
              scale distortion of the textarea. The docked state keeps the
              sticky pin + bottom fade so long transcripts scroll under it. */}
          <motion.div
            layout={reduceMotion ? false : 'position'}
            // Only re-measure (and glide) when the hero⇄dock state flips —
            // without this, every keystroke that grows the textarea or adds a
            // queued-message chip would animate the composer's position too.
            layoutDependency={isEmpty}
            transition={{ layout: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } }}
            className={cn(
              'w-full max-w-3xl mx-auto chat-content-wrap',
              isEmpty
                ? 'pb-2'
                : 'sticky bottom-0 z-10 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-background/0',
            )}
          >
            {atLimit ? (
              <SystemMessage
                tone="warning"
                heading="You've reached the 50-message limit for this conversation."
                description="Start a new conversation to continue chatting."
                action={(
                  <Button
                    size="sm"
                    onClick={handleNewConversation}
                    variant="outline"
                  >
                    Start new conversation
                  </Button>
                )}
              />
            ) : (
              renderInput()
            )}
          </motion.div>

          {/* Hero balance spacer — grows slightly more than the greeting
              region above so the composer rests a touch above true center
              (the same optical bias the old pb-16 hero carried). Unmounts
              the instant a conversation starts, which is what hands the
              composer its docked position to glide to. */}
          {isEmpty && <div className="flex-[1.15] min-h-10" aria-hidden />}
        </div>
      )}

        </div>{/* end left panel */}

        {/* Right panel — visible only when split. The divider renders instantly;
            the panel is wrapped in AnimatePresence (with a stable key) so its
            enter/exit actually run and a rapid toggle can't strand it mid-slide. */}
        {effectiveIsSplit && (
          <PanelResizeHandle
            onResize={setLeftWidthPercent}
            containerRef={containerRef}
            currentLeftWidth={leftWidthPercent}
            onDragStart={handleSplitDragStart}
            onDragEnd={handleSplitDragEnd}
          />
        )}
        <AnimatePresence initial={false}>
          {effectiveIsSplit && (
            <RightPanel
              key="chippi-right-panel"
              slug={slug}
              variant={variant}
              workbenchArtifactId={workbenchArtifactId}
              workbenchRefreshVersion={workbenchRefreshVersion}
              researchActions={researchActions}
              researchSources={researchSources}
              researchEnabled={researchEnabled}
              workspaceRunsEnabled={workspaceRunsEnabled}
              workspaceRunFollowUpsEnabled={workspaceRunFollowUpsEnabled}
              workspaceRunId={workspaceRunId}
              workspaceRunRefreshToken={workspaceRunRefreshToken}
              onOpenWorkbench={openWorkbenchArtifact}
              onContinueWorkspace={() => { setRightTab('activity'); }}
              activeTab={rightTab}
              onTabChange={setRightTab}
              className="flex-1 min-w-0"
              isResizing={isResizingSplit}
            />
          )}
        </AnimatePresence>
      </div>{/* end split panel container */}

      {/* Mobile full-screen panel overlay — below md, the desktop two-pane
          split has no room, so `toggle` opens THIS instead (see
          useSplitPanel / nextResizeState). Rather than silently disabling
          the panel on narrow screens (the old behavior), the realtor gets a
          real, full-screen People/Deals/Documents/Browser/Activity surface
          with its own top bar (tabs + an X to dismiss, via RightPanel's
          `onClose`). Slides up from the bottom on open; reduced-motion
          collapses that to a plain crossfade. `md:hidden` is a belt-and-
          braces guard — nextResizeState already closes this the instant the
          viewport crosses back to desktop width. */}
      <AnimatePresence>
        {isMobileOverlay && (
          <motion.div
            key="chippi-mobile-panel-overlay"
            className="fixed inset-0 z-40 bg-background md:hidden"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <RightPanel
              slug={slug}
              variant={variant}
              workbenchArtifactId={workbenchArtifactId}
              workbenchRefreshVersion={workbenchRefreshVersion}
              researchActions={researchActions}
              researchSources={researchSources}
              researchEnabled={researchEnabled}
              workspaceRunsEnabled={workspaceRunsEnabled}
              workspaceRunFollowUpsEnabled={workspaceRunFollowUpsEnabled}
              workspaceRunId={workspaceRunId}
              workspaceRunRefreshToken={workspaceRunRefreshToken}
              onOpenWorkbench={openWorkbenchArtifact}
              onContinueWorkspace={() => { setRightTab('activity'); closeMobileOverlay(); }}
              activeTab={rightTab}
              onTabChange={setRightTab}
              className="h-full"
              onClose={closeMobileOverlay}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
