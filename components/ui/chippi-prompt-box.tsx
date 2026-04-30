'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  AtSign,
  X,
  Loader2,
  User,
  Briefcase,
  Globe,
  BrainCog,
  FileText,
  Paperclip,
  Mic,
  Square,
  StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  type: 'contact' | 'deal';
  label: string;
  subtitle?: string;
}

type Mode = 'search' | 'think' | 'draft' | null;

interface ChippiPromptBoxProps {
  placeholder?: string;
  onSend?: (message: string, mentions: MentionItem[], attachmentIds?: string[]) => void;
  onMentionSearch?: (query: string) => Promise<MentionItem[]>;
  onAttach?: (files: File[]) => void;
  onVoiceStart?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  autoFocus?: boolean;
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
  Icon: typeof Globe;
  activeClasses: string;
  placeholder: string;
  prefix: string;
}> = {
  search: {
    label: 'Search',
    Icon: Globe,
    activeClasses:
      'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400',
    placeholder: 'Search the web…',
    prefix: 'Search',
  },
  think: {
    label: 'Think',
    Icon: BrainCog,
    activeClasses:
      'bg-orange-500/10 border-orange-500/40 text-orange-600 dark:text-orange-400',
    placeholder: 'Think this through with me…',
    prefix: 'Think',
  },
  draft: {
    label: 'Draft',
    Icon: FileText,
    activeClasses:
      'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400',
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
      onMentionSearch,
      onAttach,
      onVoiceStart,
      disabled = false,
      isLoading = false,
      className,
      autoFocus = false,
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

    const [mode, setMode] = useState<Mode>(null);
    const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const localCounterRef = useRef(0);

    const [isRecording, setIsRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [, setVisualizerTick] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mentionRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recordTimerRef = useRef<number | null>(null);
    const visualizerRafRef = useRef<number | null>(null);

    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

    const hasReadyAttachments = attachments.some((a) => a.uploadStatus === 'ready');
    const hasUploadingAttachments = attachments.some((a) => a.uploadStatus === 'uploading');
    const hasContent = message.trim().length > 0 || hasReadyAttachments;
    const sendDisabled =
      disabled || isLoading || !hasContent || hasUploadingAttachments;

    const activePlaceholder =
      isRecording
        ? ''
        : mode
          ? MODE_META[mode].placeholder
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

    // Close mention dropdown on outside click
    useEffect(() => {
      if (!mentionOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!mentionRef.current?.contains(e.target as Node)) setMentionOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [mentionOpen]);

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

    function handleSubmit() {
      if (sendDisabled) return;
      // Block submit while uploads are still in flight — readiness is the
      // entire point of the upload-on-select model.
      if (hasUploadingAttachments) return;
      const base = message.trim();
      const wrapped = mode && base
        ? `[${MODE_META[mode].prefix}: ${base}]`
        : base;
      const readyAttachmentIds = attachments
        .filter((a) => a.uploadStatus === 'ready')
        .map((a) => a.id);
      const finalText = wrapped;
      if (!finalText && readyAttachmentIds.length === 0) return;
      onSend?.(
        finalText,
        mentions,
        readyAttachmentIds.length ? readyAttachmentIds : undefined,
      );
      setMessage('');
      setMentions([]);
      setMode(null);
      // Don't DELETE the rows — the server is keeping them as part of the
      // turn. Just clear local state and revoke object URLs.
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      setAttachments([]);
      setAttachError(null);
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

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
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

    // Right-slot button: Send / Stop (loading) / Mic / StopCircle (recording)
    function renderRightButton() {
      if (isLoading) {
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
            <Square size={13} strokeWidth={2} />
          </button>
        );
      }

      if (isRecording) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={stopRecording}
                aria-label="Stop recording"
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-full',
                  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                  'hover:bg-rose-500/15 transition-all duration-150 active:scale-[0.96]',
                )}
              >
                <StopCircle size={16} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Stop recording
            </TooltipContent>
          </Tooltip>
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
                onClick={startRecording}
                disabled={disabled}
                aria-label="Start voice message"
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
              Voice message
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
          <div
            className={cn(
              'rounded-3xl border border-border/70 bg-background',
              'transition-[border-color,box-shadow] duration-150',
              'focus-within:border-foreground/30 focus-within:shadow-[0_1px_0_rgba(0,0,0,0.02)]',
              disabled && 'opacity-60',
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Hidden file input */}
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
                onChange={(e) => setMessage(e.target.value)}
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

            {/* Action row */}
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
              <div className="flex items-center gap-0.5">
                {/* @-mention */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={openMention}
                      disabled={disabled || isLoading || isRecording}
                      aria-label="Mention a contact or deal"
                      className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full',
                        'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-150',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        mentionOpen && 'bg-foreground/[0.045] text-foreground',
                      )}
                    >
                      <AtSign size={15} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Mention a contact or deal
                  </TooltipContent>
                </Tooltip>

                {/* Paperclip — file attach */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={disabled || isLoading || isRecording}
                      aria-label="Attach a file"
                      className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full',
                        'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-150',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                      )}
                    >
                      <Paperclip size={15} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Attach a file
                  </TooltipContent>
                </Tooltip>

                {/* Divider */}
                <span aria-hidden className="w-px h-4 bg-border/60 mx-0.5" />

                {/* Mode toggles */}
                {(['search', 'think', 'draft'] as const).map((m, idx) => {
                  const meta = MODE_META[m];
                  const Icon = meta.Icon;
                  const isActive = mode === m;
                  return (
                    <React.Fragment key={m}>
                      {idx > 0 && (
                        <span aria-hidden className="w-px h-4 bg-border/60 mx-0.5" />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleMode(m)}
                        disabled={disabled || isLoading || isRecording}
                        aria-pressed={isActive}
                        aria-label={meta.label}
                        className={cn(
                          'inline-flex items-center h-8 rounded-full border',
                          'transition-colors duration-150',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                          isActive
                            ? meta.activeClasses
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                          isActive ? 'pl-2 pr-3' : 'px-2',
                        )}
                      >
                        <Icon size={14} strokeWidth={1.85} />
                        <AnimatePresence initial={false}>
                          {isActive && (
                            <motion.span
                              key="label"
                              initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                              animate={{ width: 'auto', opacity: 1, marginLeft: 6 }}
                              exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="overflow-hidden whitespace-nowrap text-[12px] font-medium"
                            >
                              {meta.label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {renderRightButton()}
            </div>
          </div>

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
                  placeholder="Search contacts and deals…"
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
