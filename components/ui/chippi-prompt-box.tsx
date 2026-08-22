'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  AtSign,
  X,
  Loader2,
  User,
  Briefcase,
  FileText,
  Paperclip,
  Mic,
  Square,
  StopCircle,
  Plus,
  ImagePlus,
  Search,
  Slash,
  MessageCircle,
  Send,
  Sunrise,
  UserPlus,
  ClipboardCheck,
  Target,
  Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BorderBeam } from 'border-beam';
import { Liquid } from 'liquid-gooey';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  type: 'contact' | 'deal' | 'app';
  label: string;
  subtitle?: string;
}

/** Product-facing conversation mode. `work` replaces the old Agent label. */
export type ChatMode = 'chat' | 'work';

/** A skill the realtor can pick from the `/` menu. */
export interface SkillItem {
  slug: string;
  title: string;
  description: string;
  /** Composer text; may carry one {placeholder} for the realtor to fill. */
  prompt: string;
  /** Selecting this skill can move the conversation into the required mode. */
  mode?: ChatMode;
}

/**
 * Expand a skill prompt for the composer. A single {placeholder} token, if
 * present, is unwrapped and its inner text becomes the initial selection so
 * the realtor types straight over it; with no token the cursor lands at the
 * end. Exported for unit tests.
 */
export function expandSkillPrompt(prompt: string): {
  text: string;
  selStart: number;
  selEnd: number;
} {
  const open = prompt.indexOf('{');
  const close = prompt.indexOf('}');
  if (open >= 0 && close > open) {
    const inner = prompt.slice(open + 1, close);
    const text = prompt.slice(0, open) + inner + prompt.slice(close + 1);
    return { text, selStart: open, selEnd: open + inner.length };
  }
  return { text: prompt, selStart: prompt.length, selEnd: prompt.length };
}

/** Per-skill menu icons, keyed by slug. Falls back to the Chippi mark. */
const SKILL_ICONS: Record<string, LucideIcon> = {
  'my-day': Sunrise,
  'new-lead': UserPlus,
  'follow-ups': Send,
  'meeting-prep': ClipboardCheck,
  'my-deals': Briefcase,
  goal: Target,
};

/**
 * Built-in slash commands — always in the "/" menu, ahead of the skills.
 * Same SkillItem contract (prompt injection; one {placeholder} becomes the
 * initial selection), so filtering, keyboard nav, and selection are shared
 * with skills instead of a second command system. Exported for tests.
 *
 * /goal is a convenience that puts the conversation in Work mode and seeds a
 * natural-language outcome. It does not open another surface.
 */
export const BUILTIN_COMMANDS: SkillItem[] = [
  {
    slug: 'goal',
    title: 'Set a work goal',
    description: 'Give Chippi an outcome to pursue until it is done',
    prompt:
      'Set this as the active Work goal: {describe the outcome, e.g. prepare the Henderson listing packet with comps, pricing rationale, and seller talking points}',
    mode: 'work',
  },
];

type Mode = 'draft' | null;

/** The single top-of-page mode selector used by the Chippi workspace. */
export function ChatWorkModeSwitch({
  mode,
  onChange,
  disabled = false,
  className,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(nextMode) => {
        if (nextMode === 'chat' || nextMode === 'work') onChange(nextMode);
      }}
      disabled={disabled}
      aria-label="Conversation mode"
      className={cn(
        'relative inline-flex items-center rounded-full border border-border/60 bg-background/90 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-md',
        className,
      )}
    >
      <Liquid
        aria-hidden="true"
        blur={5}
        contrast={20}
        fill="var(--chippi-liquid-selected)"
        shadow="0 1px 2px rgba(0, 0, 0, 0.04)"
        className="chippi-mode-liquid pointer-events-none"
        data-mode={mode}
        style={{ position: 'absolute', inset: '0.125rem' }}
      >
        <Liquid.Item
          effect="move"
          move={{ springiness: 0.82, wobble: 0.12, stretch: 0.18, trail: 0.16 }}
          radius={999}
        >
          <span className="chippi-mode-liquid-surface block h-7 w-16 rounded-full" />
        </Liquid.Item>
      </Liquid>
      {(['chat', 'work'] as const).map((item) => {
        const active = mode === item;
        return (
          <ToggleGroupItem
            key={item}
            type="button"
            value={item}
            title={
              item === 'chat'
                ? 'Fast answers and everyday questions'
                : 'Longer tasks, actions, and finished deliverables'
            }
            className={cn(
              'chippi-mode-toggle-item relative z-10 inline-flex h-7 w-16 items-center justify-center rounded-full border border-transparent bg-transparent px-0 text-[12px] font-medium transition-[color,opacity] duration-150 ease-out',
              'hover:bg-transparent data-[state=on]:bg-transparent data-[spacing=0]:rounded-full data-[spacing=0]:first:rounded-full data-[spacing=0]:last:rounded-full',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              !active && 'border border-transparent hover:text-foreground',
            )}
          >
            {item === 'chat' ? 'Chat' : 'Work'}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/**
 * Chat vs Work — the experience the realtor picks for the conversation.
 *   - 'chat'  → fast, cheap answer. One model call + read-only search over
 *               their data. Finds and explains; never acts.
 *   - 'work'  → Chippi can act, use tools, and hand sustained goals to the
 *               durable background runtime without opening a launch form.
 */

/** Metadata passed up on send so the optimistic user bubble can show the
 *  attached files as chips/thumbnails before the server round-trips. */
export interface SentAttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  isImage: boolean;
  sizeBytes?: number;
  previewUrl?: string;
}

interface ChippiPromptBoxProps {
  placeholder?: string;
  onSend?: (
    message: string,
    mentions: MentionItem[],
    attachmentIds?: string[],
    mode?: ChatMode,
    /** Lightweight metadata for the sent files so the optimistic user bubble
     *  can render chips/thumbnails immediately (before the server persists). */
    attachmentsMeta?: SentAttachmentMeta[],
  ) => boolean | Promise<boolean>;
  /** Replace the active Work turn at its next safe boundary with this text. */
  onSteer?: (message: string, mentions: MentionItem[], mode?: ChatMode) => boolean | Promise<boolean>;
  onMentionSearch?: (query: string) => Promise<MentionItem[]>;
  onAttach?: (files: File[]) => void;
  onVoiceStart?: () => void;
  /** Called when the Send button has transformed into Stop (i.e. the
   *  parent is streaming). The parent is expected to abort the active
   *  stream. When omitted, the Send button stays disabled while loading
   *  instead of swapping to Stop. */
  onAbort?: () => void;
  /** Controlled conversation mode selected by the top-of-page switch. */
  chatMode?: ChatMode;
  /** A slash skill such as /goal may move the top switch into Work mode. */
  onModeChange?: (mode: ChatMode) => void;
  /** Once the first user message is sent, conversation type is immutable. */
  modeLocked?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  autoFocus?: boolean;
  /**
   * External prefill — when `nonce` changes, the composer adopts `text` as
   * its current value and focuses the textarea (cursor at end). Used by the
   * day-one welcome to seed "Hi Chippi, my most recent lead is …" without
   * having to lift composer state into the parent.
   */
  prefill?: { text: string; nonce: number };
  /** Skills offered in the `/` menu. Empty or omitted → no menu. */
  skills?: SkillItem[];
}

type UploadedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  isImage: boolean;
  extractionStatus: 'pending' | 'skipped' | 'done' | 'failed';
  // local-only fields
  localId: string;
  uploadStatus: 'uploading' | 'ready' | 'error';
  error?: string;
  // image preview for the uploading state — once `ready` lands we keep using
  // it because the public URL works too, but the object URL displays instantly.
  previewUrl?: string;
  abort?: AbortController;
};

const MAX_HEIGHT_PX = 240;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches /api/ai/attachments

const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
]);

const ACCEPT_ATTR =
  'image/png,image/jpeg,image/webp,image/gif,' +
  'application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'text/plain,text/csv,application/json,text/markdown';

const MODE_META: Record<Exclude<Mode, null>, {
  label: string;
  Icon: typeof FileText;
  activeClasses: string;
  placeholder: string;
  prefix: string;
}> = {
  draft: {
    label: 'Draft',
    Icon: FileText,
    activeClasses:
      'bg-foreground/[0.06] border-border/60 text-foreground',
    placeholder: 'Draft a longer message…',
    prefix: 'Draft',
  },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const ChippiPromptBox = React.forwardRef<HTMLTextAreaElement, ChippiPromptBoxProps>(
  function ChippiPromptBox(
    {
      placeholder = 'Message Chippi…',
      onSend,
      onSteer,
      onMentionSearch,
      onAttach,
      onVoiceStart,
      onAbort,
      chatMode = 'chat',
      onModeChange,
      modeLocked = false,
      disabled = false,
      isLoading = false,
      className,
      autoFocus = false,
      prefill,
      skills = [],
    },
    ref,
  ) {
    const [message, setMessage] = useState('');
    const [mentions, setMentions] = useState<MentionItem[]>([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState<MentionItem[]>([]);
    const [mentionLoading, setMentionLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // Slash (skills) menu — opens when the message starts with "/".
    const [slashOpen, setSlashOpen] = useState(false);
    const [slashIndex, setSlashIndex] = useState(0);
    const slashRef = useRef<HTMLDivElement>(null);
    // Sticky dismissal: Esc closes the menu and keeps it closed until the
    // "/" token is cleared, so it doesn't reopen on the next keystroke.
    const slashDismissedRef = useRef(false);

    const [mode, setMode] = useState<Mode>(null);
    // Send flash — one brightness surge on the border beam the moment a
    // message is dispatched. Keyed to the isLoading RISING edge (send →
    // turn starts), never the falling edge, so the beam settles back to its
    // steady glow while the turn streams.
    const [sendFlash, setSendFlash] = useState(false);
    const prevLoadingRef = useRef(false);
    useEffect(() => {
      const was = prevLoadingRef.current;
      prevLoadingRef.current = isLoading;
      if (isLoading && !was) {
        setSendFlash(true);
        const t = setTimeout(() => setSendFlash(false), 950);
        return () => clearTimeout(t);
      }
    }, [isLoading]);
    const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const localCounterRef = useRef(0);

    const [isRecording, setIsRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [, setVisualizerTick] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mentionRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Separate ref for image-only picking — sets accept="image/*" so the
    // OS file picker pre-filters. Re-uses uploadFiles for handling.
    const imageInputRef = useRef<HTMLInputElement>(null);
    // Plus-menu (the "+" button to the left of the textarea that opens
    // contact-mention / file / image / draft-mode / search options).
    const plusMenuRef = useRef<HTMLDivElement>(null);
    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const recordTimerRef = useRef<number | null>(null);
    const visualizerRafRef = useRef<number | null>(null);

    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

    const hasReadyAttachments = attachments.some((a) => a.uploadStatus === 'ready');
    const hasUploadingAttachments = attachments.some((a) => a.uploadStatus === 'uploading');
    const hasContent = message.trim().length > 0 || hasReadyAttachments;
    // NOT gated on isLoading: submitting while Chippi is streaming QUEUES the
    // message (the parent's send() holds it and dispatches when the turn
    // ends) — the ChatGPT-Work interaction. Attachments stay blocked while
    // uploading either way.
    const sendDisabled = disabled || isSubmitting || !hasContent || hasUploadingAttachments;

    // Slash menu — built-in commands (/goal, …) lead, then the skills. The
    // message after "/" is the live filter query.
    const menuSkills = [
      ...BUILTIN_COMMANDS.filter(
        (skill) => !modeLocked || !skill.mode || skill.mode === chatMode,
      ),
      ...skills,
    ];
    const slashQuery = slashOpen ? message.slice(1).toLowerCase() : '';
    const filteredSkills =
      slashOpen
        ? menuSkills.filter(
            (s) =>
              !slashQuery ||
              s.title.toLowerCase().includes(slashQuery) ||
              s.description.toLowerCase().includes(slashQuery),
          )
        : [];
    const safeSlashIndex =
      filteredSkills.length === 0
        ? 0
        : Math.min(slashIndex, filteredSkills.length - 1);

    const activePlaceholder =
      isRecording
        ? ''
        : mode
          ? MODE_META[mode].placeholder
          : chatMode === 'work'
            ? 'What should Chippi work on?'
            : placeholder;

    // Auto-resize
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    }, [message]);

    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    // External prefill — when the parent bumps `prefill.nonce` we adopt the
    // text and focus the cursor at the end. Used by the day-one welcome to
    // seed the composer without lifting state up. Nonce-keyed instead of
    // text-keyed so the realtor can edit/clear without us re-stomping it.
    const prefillNonceRef = useRef<number | null>(null);
    useEffect(() => {
      if (!prefill) return;
      if (prefillNonceRef.current === prefill.nonce) return;
      prefillNonceRef.current = prefill.nonce;
      setMessage(prefill.text);
      // Defer focus until after the textarea reflects the new value.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const end = prefill.text.length;
        try {
          el.setSelectionRange(end, end);
        } catch {
          /* some browsers/elements throw; harmless */
        }
      });
    }, [prefill]);

    // Close mention dropdown on outside click
    useEffect(() => {
      if (!mentionOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!mentionRef.current?.contains(e.target as Node)) setMentionOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [mentionOpen]);

    // Close the slash (skills) menu on outside click. Clicks inside the
    // textarea keep it open — the realtor is still typing the query.
    useEffect(() => {
      if (!slashOpen) return;
      const onDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (!slashRef.current?.contains(t) && t !== textareaRef.current) {
          setSlashOpen(false);
        }
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [slashOpen]);

    // Close Plus menu on outside click + Escape
    useEffect(() => {
      if (!plusMenuOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!plusMenuRef.current?.contains(e.target as Node)) setPlusMenuOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setPlusMenuOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [plusMenuOpen]);

    // Debounced mention search
    const searchMentions = useCallback(
      async (q: string) => {
        if (!onMentionSearch) return;
        setMentionLoading(true);
        try {
          const results = await onMentionSearch(q);
          setMentionResults(results);
          setHighlightedIndex(0);
        } finally {
          setMentionLoading(false);
        }
      },
      [onMentionSearch],
    );

    useEffect(() => {
      if (!mentionOpen) return;
      const t = setTimeout(() => searchMentions(mentionQuery), 180);
      return () => clearTimeout(t);
    }, [mentionQuery, mentionOpen, searchMentions]);

    // Cleanup attachment preview object URLs + abort any in-flight uploads on unmount
    useEffect(() => {
      return () => {
        setAttachments((prev) => {
          for (const a of prev) {
            if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
            a.abort?.abort();
          }
          return prev;
        });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Recording timer + visualizer animation
    useEffect(() => {
      if (!isRecording) return;
      setRecordSeconds(0);
      const start = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - start) / 1000));
      }, 250);
      const tick = () => {
        setVisualizerTick((t) => (t + 1) % 1_000_000);
        visualizerRafRef.current = requestAnimationFrame(tick);
      };
      visualizerRafRef.current = requestAnimationFrame(tick);
      return () => {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        if (visualizerRafRef.current) {
          cancelAnimationFrame(visualizerRafRef.current);
          visualizerRafRef.current = null;
        }
      };
    }, [isRecording]);

    function resetAttachments() {
      setAttachments((prev) => {
        for (const a of prev) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
          a.abort?.abort();
        }
        return [];
      });
    }

    async function uploadFile(file: File) {
      const mime = (file.type || '').toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        setAttachError(`Unsupported file type: ${mime || 'unknown'}`);
        return;
      }
      if (file.size <= 0) {
        setAttachError('Empty file');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setAttachError(
          `File exceeds ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB limit`,
        );
        return;
      }
      setAttachError(null);

      const isImage = mime.startsWith('image/');
      const localId = `local-${++localCounterRef.current}`;
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      const abort = new AbortController();

      const initial: UploadedAttachment = {
        id: localId,
        filename: file.name || 'file',
        mimeType: mime,
        sizeBytes: file.size,
        publicUrl: '',
        isImage,
        extractionStatus: isImage ? 'skipped' : 'pending',
        localId,
        uploadStatus: 'uploading',
        previewUrl,
        abort,
      };
      setAttachments((prev) => [...prev, initial]);

      // Notify the parent if it cares — this is informational only now,
      // since the actual upload happens here.
      try {
        onAttach?.([file]);
      } catch {
        /* parent handler is best-effort */
      }

      const form = new FormData();
      form.append('file', file);

      let res: Response;
      try {
        res = await fetch('/api/ai/attachments', {
          method: 'POST',
          body: form,
          signal: abort.signal,
        });
      } catch (err) {
        // Aborted = user removed the chip; we already popped it from state.
        if ((err as { name?: string })?.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Upload failed';
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, uploadStatus: 'error', error: message }
              : a,
          ),
        );
        return;
      }

      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json?.error) message = json.error;
        } catch {
          /* ignore parse error */
        }
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, uploadStatus: 'error', error: message }
              : a,
          ),
        );
        return;
      }

      let data: {
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        publicUrl: string;
        isImage: boolean;
        extractionStatus: 'pending' | 'skipped' | 'done' | 'failed';
      };
      try {
        data = await res.json();
      } catch {
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, uploadStatus: 'error', error: 'Bad server response' }
              : a,
          ),
        );
        return;
      }

      setAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? {
                ...a,
                id: data.id,
                filename: data.filename,
                mimeType: data.mimeType,
                sizeBytes: data.sizeBytes,
                publicUrl: data.publicUrl,
                isImage: data.isImage,
                extractionStatus: data.extractionStatus,
                uploadStatus: 'ready',
                abort: undefined,
              }
            : a,
        ),
      );
    }

    function uploadFiles(incoming: File[]) {
      for (const f of incoming) {
        void uploadFile(f);
      }
    }

    function removeAttachment(localId: string) {
      const target = attachments.find((a) => a.localId === localId);
      if (!target) return;
      // Abort upload if still in flight
      target.abort?.abort();
      // Best-effort server-side delete if the row exists
      if (target.uploadStatus === 'ready' && target.id && !target.id.startsWith('local-')) {
        void fetch(`/api/ai/attachments?id=${encodeURIComponent(target.id)}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
      if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      setAttachments((prev) => prev.filter((a) => a.localId !== localId));
    }

    async function handleSubmit() {
      if (sendDisabled) return;
      // Block submit while uploads are still in flight — readiness is the
      // entire point of the upload-on-select model.
      if (hasUploadingAttachments) return;
      const base = message.trim();
      const wrapped = mode && base
        ? `[${MODE_META[mode].prefix}: ${base}]`
        : base;
      const readyAttachments = attachments.filter((a) => a.uploadStatus === 'ready');
      const readyAttachmentIds = readyAttachments.map((a) => a.id);
      const finalText = wrapped;
      if (!finalText && readyAttachmentIds.length === 0) return;
      // Metadata for the optimistic user bubble. The object URL is handed off
      // to the transcript for an instant image thumbnail — so we must NOT
      // revoke those below (the receiver owns them now).
      const attachmentsMeta: SentAttachmentMeta[] = readyAttachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        isImage: a.isImage,
        sizeBytes: a.sizeBytes,
        ...(a.isImage && a.previewUrl ? { previewUrl: a.previewUrl } : {}),
      }));
      setIsSubmitting(true);
      let accepted = false;
      try {
        accepted = (await onSend?.(
          finalText,
          mentions,
          readyAttachmentIds.length ? readyAttachmentIds : undefined,
          chatMode,
          attachmentsMeta.length ? attachmentsMeta : undefined,
        )) !== false;
      } catch {
        accepted = false;
      } finally {
        setIsSubmitting(false);
      }
      // The durable queue owns the instruction only after its 201 receipt.
      // Preserve text, mentions, attachments, and object URLs on any failure
      // so retry never means reconstructing the user's work.
      if (!accepted) {
        setAttachError('Chippi could not accept that message yet. Nothing was cleared — try again.');
        return;
      }
      setMessage('');
      setMentions([]);
      setMode(null);
      // Chat/Work is sticky per conversation in the parent workspace, so the
      // composer never snaps back to Chat after a send.
      // Don't DELETE the rows — the server is keeping them as part of the
      // turn. Revoke object URLs we did NOT hand off to the transcript;
      // handed-off image previews stay alive for the optimistic thumbnail.
      for (const a of attachments) {
        const handedOff = a.isImage && a.uploadStatus === 'ready' && !!a.previewUrl;
        if (a.previewUrl && !handedOff) URL.revokeObjectURL(a.previewUrl);
      }
      setAttachments([]);
      setAttachError(null);
    }

    async function handleSteer() {
      if (sendDisabled || !onSteer || attachments.length > 0) return;
      const base = message.trim();
      if (!base) return;
      const wrapped = mode ? `[${MODE_META[mode].prefix}: ${base}]` : base;
      setIsSubmitting(true);
      let accepted = false;
      try {
        accepted = (await onSteer(wrapped, mentions, chatMode)) !== false;
      } catch {
        accepted = false;
      } finally {
        setIsSubmitting(false);
      }
      if (!accepted) {
        setAttachError('Chippi could not accept that steering instruction yet. It is still here.');
        return;
      }
      setMessage('');
      setMentions([]);
      setMode(null);
    }

    function selectMention(item: MentionItem) {
      if (!mentions.find((m) => m.id === item.id && m.type === item.type)) {
        setMentions((prev) => [...prev, item]);
      }
      setMentionOpen(false);
      setMentionQuery('');
      textareaRef.current?.focus();
    }

    function removeMention(item: MentionItem) {
      setMentions((prev) => prev.filter((m) => !(m.id === item.id && m.type === item.type)));
    }

    function openMention() {
      if (disabled || isLoading) return;
      setMentionOpen(true);
      setMentionQuery('');
      void searchMentions('');
    }

    function toggleMode(next: Exclude<Mode, null>) {
      if (disabled || isLoading) return;
      setMode((prev) => (prev === next ? null : next));
      textareaRef.current?.focus();
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      setMessage(v);
      // A message that begins with "/" and has no space/newline yet is a
      // skill query. Once it's a real sentence (space) or empty, the menu
      // closes; clearing the "/" also lifts a prior Esc dismissal.
      const isSlash = v.startsWith('/') && !v.includes(' ') && !v.includes('\n');
      // Built-in commands mean the menu always has at least one entry.
      if (isSlash) {
        if (!slashDismissedRef.current) {
          setSlashOpen(true);
          setSlashIndex(0);
        }
      } else {
        setSlashOpen(false);
        if (!v.startsWith('/')) slashDismissedRef.current = false;
      }
    }

    function selectSkill(skill: SkillItem) {
      if (skill.mode && (!modeLocked || skill.mode === chatMode)) {
        onModeChange?.(skill.mode);
      }
      const { text, selStart, selEnd } = expandSkillPrompt(skill.prompt);
      setMessage(text);
      setSlashOpen(false);
      slashDismissedRef.current = false;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch {
          /* some browsers throw; harmless */
        }
      });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (slashOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex((p) => (p < filteredSkills.length - 1 ? p + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((p) => (p > 0 ? p - 1 : filteredSkills.length - 1));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          // While the menu is open, Enter is for the menu — never sends.
          e.preventDefault();
          if (filteredSkills.length > 0) selectSkill(filteredSkills[safeSlashIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSlashOpen(false);
          slashDismissedRef.current = true;
          return;
        }
      }
      if (mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((p) => (p < mentionResults.length - 1 ? p + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((p) => (p > 0 ? p - 1 : mentionResults.length - 1));
          return;
        }
        if (e.key === 'Enter' && mentionResults.length > 0) {
          e.preventDefault();
          selectMention(mentionResults[highlightedIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        isLoading &&
        (e.metaKey || e.ctrlKey) &&
        onSteer
      ) {
        e.preventDefault();
        void handleSteer();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    }

    function handleDrop(e: React.DragEvent) {
      // Files first — uploadFile() validates the mime/size, so just hand
      // everything through.
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        uploadFiles(Array.from(e.dataTransfer.files));
        return;
      }
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        e.preventDefault();
        setMessage((m) => (m ? `${m} ${text}` : text));
        textareaRef.current?.focus();
      }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) pastedFiles.push(f);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        uploadFiles(pastedFiles);
      }
    }

    function startRecording() {
      if (disabled || isLoading) return;
      // When the parent wires its own voice surface (the workspace mounts a
      // dedicated VoiceMode dialog), defer to it entirely — the local
      // recorder UI is a fallback for chat surfaces without one. Avoids
      // having two simultaneous voice interfaces.
      if (onVoiceStart) {
        onVoiceStart();
        return;
      }
      setIsRecording(true);
    }

    function stopRecording() {
      const seconds = recordSeconds;
      setIsRecording(false);
      if (seconds > 0) {
        onSend?.(`[Voice message - ${seconds}s]`, mentions);
        setMentions([]);
      }
    }

    // Right-slot button. Priority order:
    //   streaming + onAbort  → live Stop (matches ChatGPT / Claude)
    //   streaming, no onAbort → disabled Stop placeholder
    //   has content          → Send (ArrowUp)
    //   has voice mode       → Mic that opens voice mode (NOT dictation)
    //   else                 → inert Send slot for layout consistency
    function renderRightButton() {
      if (isLoading) {
        // Enter still queues typed text and ⌘↵ still steers. Keep the visible
        // control surface to one stable Stop button; queued-message actions
        // live in the rail above the composer.
        if (onAbort) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onAbort}
                  aria-label="Stop generating"
                  className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-full',
                    'bg-foreground text-background hover:bg-foreground/90',
                    'transition-all duration-150 active:scale-[0.96]',
                  )}
                >
                  <Square size={12} strokeWidth={2.25} className="fill-current" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                Stop
              </TooltipContent>
            </Tooltip>
          );
        }
        return (
          <button
            type="button"
            disabled
            aria-label="Stop generating"
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-full',
              'bg-foreground/[0.06] text-muted-foreground',
              'transition-all duration-150',
            )}
          >
            <Square size={12} strokeWidth={2.25} className="fill-current" />
          </button>
        );
      }

      if (hasContent) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sendDisabled}
                aria-label="Send"
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-full',
                  'bg-foreground text-background hover:bg-foreground/90',
                  'transition-all duration-150 active:scale-[0.96]',
                  sendDisabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <ArrowUp size={15} strokeWidth={2.25} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Send · Enter
            </TooltipContent>
          </Tooltip>
        );
      }

      if (onVoiceStart) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onVoiceStart()}
                disabled={disabled}
                aria-label="Start voice mode"
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-full',
                  'bg-foreground/[0.06] text-muted-foreground/70 hover:text-foreground',
                  'hover:bg-foreground/[0.08] transition-all duration-150 active:scale-[0.96]',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <Mic size={15} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Voice mode
            </TooltipContent>
          </Tooltip>
        );
      }

      // No mic, no content — show inert send slot for layout consistency
      return (
        <button
          type="button"
          disabled
          aria-label="Send"
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-full',
            'bg-foreground/[0.06] text-muted-foreground/60 cursor-not-allowed',
          )}
        >
          <ArrowUp size={15} strokeWidth={2.25} />
        </button>
      );
    }

    return (
      <TooltipProvider>
        <div ref={containerRef} className={cn('relative', className)}>
          {/* Work-mode border beam — the <BorderBeam> (border-beam package)
              wraps the composer shell and travels a sunset beam around its
              1px border while Chippi is in Work mode. `active` flips with the
              top-level Chat/Work switch; the beam auto-detects the shell's rounded-3xl
              radius. In Chat mode it's inert (no ring, no cost).
              Brightness rides two levels above the package default so the
              ring reads unmistakably, and the moment a message is sent
              (`sendFlash`, the isLoading rising edge) it surges brighter and
              faster for ~a second — the input visibly "fires" the turn. */}
          <BorderBeam
            size="md"
            colorVariant="sunset"
            theme="auto"
            active={chatMode === 'work'}
            brightness={sendFlash ? 3.2 : 2.2}
            saturation={sendFlash ? 1.7 : 1.4}
            duration={sendFlash ? 1.1 : 1.96}
          >
          <div
            className={cn(
              'chippi-composer-shell rounded-3xl border border-border/70 bg-background',
              'shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
              'transition-[border-color,box-shadow] duration-200 ease-out',
              'focus-within:border-foreground/30',
              'focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]',
              disabled && 'opacity-60',
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Hidden file input — full mime list */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list && list.length > 0) uploadFiles(Array.from(list));
                if (e.target) e.target.value = '';
              }}
            />
            {/* Hidden image-only input — same upload handler, narrower picker */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list && list.length > 0) uploadFiles(Array.from(list));
                if (e.target) e.target.value = '';
              }}
            />

            {/* Attachment chips row */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {attachments.map((a) => {
                  const isImg = a.isImage || (a.previewUrl != null);
                  const showSrc = a.previewUrl || (a.publicUrl || '');
                  const errorTone = a.uploadStatus === 'error';
                  if (isImg) {
                    return (
                      <div
                        key={a.localId}
                        className={cn(
                          'relative w-16 h-16 rounded-lg overflow-hidden border bg-foreground/[0.03]',
                          'transition-colors duration-150',
                          errorTone ? 'border-rose-400/70' : 'border-border/60',
                        )}
                      >
                        {showSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={showSrc}
                            alt={a.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <FileText size={18} />
                          </div>
                        )}
                        {a.uploadStatus === 'uploading' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                            <Loader2 size={14} className="text-foreground animate-spin" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.localId)}
                          aria-label={`Remove ${a.filename}`}
                          className={cn(
                            'absolute top-0.5 right-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full',
                            'bg-background/90 border border-border/60 text-foreground',
                            'hover:bg-background transition-colors duration-150',
                          )}
                        >
                          <X size={9} />
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={a.localId}
                      className={cn(
                        'relative inline-flex items-center gap-2 h-12 pl-2 pr-7 rounded-lg border',
                        'bg-foreground/[0.04] transition-colors duration-150',
                        errorTone ? 'border-rose-400/70' : 'border-border/60',
                      )}
                      title={a.error || a.filename}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-background/70 text-muted-foreground flex-shrink-0">
                        <FileText size={13} />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate max-w-[180px] text-[12px] font-medium text-foreground leading-tight">
                          {a.filename.length > 24 ? `${a.filename.slice(0, 24)}…` : a.filename}
                        </span>
                        <span
                          className={cn(
                            'truncate max-w-[180px] text-[10.5px] leading-tight',
                            errorTone ? 'text-rose-500' : 'text-muted-foreground',
                          )}
                        >
                          {errorTone
                            ? a.error || 'Upload failed'
                            : a.uploadStatus === 'uploading'
                              ? 'Uploading…'
                              : a.mimeType || 'file'}
                        </span>
                      </div>
                      {a.uploadStatus === 'uploading' && (
                        <span
                          aria-hidden
                          className="absolute left-0 right-0 bottom-0 h-px overflow-hidden"
                        >
                          <span className="block h-full w-1/3 bg-foreground/40 animate-pulse" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.localId)}
                        aria-label={`Remove ${a.filename}`}
                        className={cn(
                          'absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full',
                          'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]',
                          'transition-colors duration-150',
                        )}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Attachment-level error notice (validation, not per-chip) */}
            {attachError && (
              <div className="px-3 pt-2 text-[11px] text-rose-500">
                {attachError}
              </div>
            )}

            {/* Mention chips row */}
            {mentions.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pt-2.5">
                {mentions.map((m) => (
                  <span
                    key={`${m.type}-${m.id}`}
                    className="inline-flex items-center gap-1 h-6 pl-1.5 pr-1 rounded-md bg-foreground/[0.04] border border-border/60 text-[12px] text-foreground"
                  >
                    {m.type === 'contact' ? (
                      <User size={11} className="text-muted-foreground" />
                    ) : m.type === 'app' ? (
                      <Plug size={11} className="text-muted-foreground" />
                    ) : (
                      <Briefcase size={11} className="text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[180px]">{m.label}</span>
                    <button
                      type="button"
                      onClick={() => removeMention(m)}
                      aria-label={`Remove ${m.label}`}
                      className="inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Recording panel OR textarea */}
            {isRecording ? (
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-500" />
                  </span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatTime(recordSeconds)}
                  </span>
                  <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
                    {Array.from({ length: 32 }).map((_, i) => {
                      const heightPct =
                        30 + Math.abs(Math.sin(Date.now() / 200 + i * 0.4)) * 70;
                      return (
                        <span
                          key={i}
                          aria-hidden
                          className="w-0.5 rounded-full bg-foreground/40"
                          style={{ height: `${heightPct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={activePlaceholder}
                disabled={disabled}
                rows={1}
                spellCheck
                className={cn(
                  'w-full resize-none bg-transparent border-0 outline-none',
                  'px-4 pt-3 pb-1 text-[14px] leading-relaxed text-foreground',
                  'placeholder:text-muted-foreground/60',
                  'disabled:cursor-not-allowed',
                  '[&::-webkit-scrollbar]:w-1.5',
                  '[&::-webkit-scrollbar-track]:bg-transparent',
                  '[&::-webkit-scrollbar-thumb]:bg-foreground/10',
                  '[&::-webkit-scrollbar-thumb]:rounded-full',
                )}
                style={{ maxHeight: MAX_HEIGHT_PX }}
              />
            )}

            {/* Action row — Plus menu on the left, send/stop/voice on the
                right. The previous trio of @ / paperclip / draft was visually
                loud for daily use; the Plus pattern matches Slack / iMessage /
                ChatGPT and lets us add affordances later without crowding. */}
            <div className="flex items-center justify-between gap-2 px-2 py-2">
              <div className="flex items-center gap-1.5">
              <div className="relative" ref={plusMenuRef}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setPlusMenuOpen((v) => !v)}
                      disabled={disabled || isLoading || isRecording}
                      aria-label="More actions"
                      aria-expanded={plusMenuOpen}
                      aria-haspopup="menu"
                      className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full',
                        'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                        'transition-all duration-150 active:scale-[0.96]',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        plusMenuOpen && 'bg-foreground/[0.045] text-foreground rotate-45',
                      )}
                    >
                      <Plus size={16} strokeWidth={2} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Add — contacts, files, modes
                  </TooltipContent>
                </Tooltip>

                {plusMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Composer actions"
                    className={cn(
                      'absolute left-0 bottom-full mb-2 z-30 w-[244px]',
                      'rounded-xl border border-border/70 bg-popover shadow-lg shadow-foreground/5',
                      'overflow-hidden py-1',
                    )}
                  >
                    {/* Reference contact / deal */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        openMention();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'text-[13px] text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-100',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-foreground/[0.05] text-muted-foreground">
                        <AtSign size={13} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1">Reference a contact or deal</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground/70">@</span>
                    </button>

                    {/* Attach file */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'text-[13px] text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-100',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-foreground/[0.05] text-muted-foreground">
                        <Paperclip size={13} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1">Attach a file</span>
                    </button>

                    {/* Attach image */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        imageInputRef.current?.click();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'text-[13px] text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-100',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-foreground/[0.05] text-muted-foreground">
                        <ImagePlus size={13} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1">Attach an image</span>
                    </button>

                    {/* Search hint */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        // The agent treats `[Search: …]` as an instruction
                        // to lead with semantic recall. Insert at the cursor
                        // and focus.
                        setMessage((prev) => (prev ? `[Search: ] ${prev}` : '[Search: ] '));
                        setTimeout(() => {
                          const el = textareaRef.current;
                          if (!el) return;
                          el.focus();
                          // Place cursor between the colon and ]
                          const idx = el.value.indexOf(': ]');
                          if (idx >= 0) el.setSelectionRange(idx + 2, idx + 2);
                        }, 0);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'text-[13px] text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-100',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-foreground/[0.05] text-muted-foreground">
                        <Search size={13} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1">Search</span>
                    </button>

                    {/* Draft mode toggle — keeps the existing prefix-hint
                        contract with the agent. Active state stays
                        accessible from the menu so the user can flip it
                        without remembering the keystroke. */}
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={mode === 'draft'}
                      onClick={() => {
                        setPlusMenuOpen(false);
                        toggleMode('draft');
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'text-[13px] text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-100',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-7 h-7 rounded-md',
                          mode === 'draft'
                            ? 'bg-foreground/[0.06] text-foreground'
                            : 'bg-foreground/[0.05] text-muted-foreground',
                        )}
                      >
                        <FileText size={13} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1">
                        {mode === 'draft' ? 'Draft mode: on' : 'Draft mode'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              </div>

              {renderRightButton()}
            </div>
          </div>
          </BorderBeam>

          {/* Slash (skills) menu — type "/" to open */}
          {slashOpen && (
            <div
              ref={slashRef}
              role="listbox"
              aria-label="Skills"
              className={cn(
                'absolute left-0 right-0 bottom-full mb-2 z-30',
                'rounded-xl border border-border/70 bg-popover shadow-lg shadow-foreground/5',
                'max-h-[320px] overflow-y-auto',
              )}
            >
              <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 border-b border-border/60">
                <Slash size={12} className="text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Skills
                </span>
              </div>
              <div className="py-1">
                {filteredSkills.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12px] text-muted-foreground/70">
                    No skill matches.
                  </p>
                ) : (
                  filteredSkills.map((s, i) => {
                    const Icon = SKILL_ICONS[s.slug] ?? MessageCircle;
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        role="option"
                        aria-selected={i === safeSlashIndex}
                        onClick={() => selectSkill(s)}
                        onMouseEnter={() => setSlashIndex(i)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-1.5 text-left',
                          'transition-colors duration-100',
                          i === safeSlashIndex
                            ? 'bg-foreground/[0.04]'
                            : 'hover:bg-foreground/[0.025]',
                        )}
                      >
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-foreground/[0.05] text-muted-foreground flex-shrink-0">
                          <Icon size={12} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">
                            {s.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 truncate leading-tight mt-0.5">
                            {s.description}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Mention dropdown */}
          {mentionOpen && (
            <div
              ref={mentionRef}
              role="listbox"
              aria-label="Mention suggestions"
              className={cn(
                'absolute left-0 right-0 bottom-full mb-2 z-30',
                'rounded-xl border border-border/70 bg-popover shadow-lg shadow-foreground/5',
                'max-h-[280px] overflow-y-auto',
              )}
            >
              <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 border-b border-border/60">
                <AtSign size={12} className="text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={mentionQuery}
                  onChange={(e) => setMentionQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionOpen(false);
                      textareaRef.current?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedIndex((p) =>
                        p < mentionResults.length - 1 ? p + 1 : 0,
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex((p) =>
                        p > 0 ? p - 1 : mentionResults.length - 1,
                      );
                    } else if (e.key === 'Enter' && mentionResults.length > 0) {
                      e.preventDefault();
                      selectMention(mentionResults[highlightedIndex]);
                    }
                  }}
                  placeholder="Search people and deals…"
                  className="flex-1 text-[12px] bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 text-foreground"
                />
                {mentionLoading && (
                  <Loader2 size={12} className="text-muted-foreground animate-spin" />
                )}
              </div>
              <div className="py-1">
                {mentionResults.length === 0 && !mentionLoading ? (
                  <p className="px-3 py-2.5 text-[12px] text-muted-foreground/70">
                    No matches.
                  </p>
                ) : (
                  mentionResults.map((item, i) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === highlightedIndex}
                      onClick={() => selectMention(item)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left',
                        'transition-colors duration-100',
                        i === highlightedIndex
                          ? 'bg-foreground/[0.04]'
                          : 'hover:bg-foreground/[0.025]',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-foreground/[0.05] text-muted-foreground flex-shrink-0">
                        {item.type === 'contact' ? (
                          <User size={11} />
                        ) : item.type === 'app' ? (
                          <Plug size={11} />
                        ) : (
                          <Briefcase size={11} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">
                          {item.label}
                        </p>
                        {item.subtitle && (
                          <p className="text-[11px] text-muted-foreground/80 truncate leading-tight mt-0.5">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  },
);
