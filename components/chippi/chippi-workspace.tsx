'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ConversationSidebar } from '@/components/ai/conversation-sidebar';
import { GradientAIChatInput, type MentionItem } from '@/components/ui/gradient-ai-chat-input';
import { Button } from '@/components/ui/button';
import { History, X, AlertCircle, Plus, Mic, Square, Settings, ArrowLeft, Play, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { VoiceMode } from '@/components/ai/voice-mode';
import { Transcript } from '@/components/ai/blocks/transcript';
import { useAgentTask, type UiMessage } from '@/components/ai/hooks/use-agent-task';
import { blocksFromLegacyContent, type MessageBlock } from '@/lib/ai-tools/blocks';
import type { Conversation } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import { TodayFeed } from './today-feed';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { toast } from 'sonner';

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
  initialConversations: Conversation[];
  initialConversationId: string | null;
  /** Pre-send this message on mount (used when arriving from the command palette). */
  initialInput?: string;
}

const MESSAGE_LIMIT = 50;

const SUGGESTIONS: { emoji: string; text: string }[] = [
  { emoji: '✍️', text: 'Draft a follow-up for my hottest lead' },
  { emoji: '📋', text: 'Who needs a check-in today?' },
  { emoji: '🏠', text: 'Help me prep for my next tour' },
  { emoji: '📊', text: "Summarize what changed this week" },
];

// Neutralize the input's conic gradient so it reads as a calm ring
// instead of an "AI startup" peach badge. Light/dark stops match
// existing border tokens.
const CALM_INPUT_GRADIENT = {
  light: { topLeft: '#E5E5E5', topRight: '#E5E5E5', bottomRight: '#E5E5E5', bottomLeft: '#E5E5E5' },
  dark: { topLeft: '#3A3A3A', topRight: '#3A3A3A', bottomRight: '#3A3A3A', bottomLeft: '#3A3A3A' },
};

function timeBasedGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
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
}: ChippiWorkspaceProps) {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    setMessages,
    isStreaming,
    pendingApproval,
    liveCallIds,
    error,
    send,
    approve,
    deny,
    alwaysAllow,
    abort,
    clearError,
  } = useAgentTask({
    spaceSlug: slug,
    conversationId: activeConversationId,
    onConversationCreated: (id) => {
      setActiveConversationId(id);
      // Minimal placeholder — the sidebar picks up the real title on refresh,
      // and `send` already titled the conversation server-side.
      setConversations((prev) =>
        prev.some((c) => c.id === id)
          ? prev
          : [
              {
                id,
                spaceId: '',
                title: 'New conversation',
                createdAt: new Date(),
                updatedAt: new Date(),
              } as Conversation,
              ...prev,
            ],
      );
    },
  });

  // Hydrate the transcript from initial server data on first render.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (initialMessages.length > 0) {
      setMessages(legacyToUi(initialMessages));
    }
  }, [initialMessages, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingApproval, isStreaming]);

  const loadConversationMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/ai/messages?conversationId=${conversationId}`);
        if (res.ok) {
          const data = (await res.json()) as LegacyMessage[];
          setMessages(legacyToUi(data));
        }
      } finally {
        setLoadingMessages(false);
      }
    },
    [setMessages],
  );

  async function handleSelectConversation(conv: Conversation) {
    setActiveConversationId(conv.id);
    setDrawerOpen(false);
    await loadConversationMessages(conv.id);
  }

  async function handleNewConversation() {
    const res = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) {
      const conv = (await res.json()) as Conversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setDrawerOpen(false);
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('[Chat] Failed to delete conversation:', res.status);
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('[Chat] Error deleting conversation:', err);
    }
  }

  async function handleRenameConversation(id: string, title: string) {
    const res = await fetch(`/api/ai/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Conversation;
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  const handleMentionSearch = useCallback(
    async (query: string): Promise<MentionItem[]> => {
      const results: MentionItem[] = [];
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
      }
      return results;
    },
    [slug],
  );

  const handleSend = useCallback(
    async (text: string, mentions: MentionItem[]) => {
      if (!text) return;
      let contextPrefix = '';
      if (mentions.length > 0) {
        const labels = mentions.map(
          (m) => `[${m.type === 'contact' ? 'Contact' : 'Deal'}: ${m.label}]`,
        );
        contextPrefix = `(Referencing: ${labels.join(', ')})\n\n`;
      }
      await send(contextPrefix + text);

      // Bump the sidebar's conversation ordering.
      const cid = activeConversationId;
      if (cid) {
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === cid);
          if (!conv) return prev;
          return [{ ...conv, updatedAt: new Date() }, ...prev.filter((c) => c.id !== cid)];
        });
      }
    },
    [send, activeConversationId],
  );

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
  const isEmpty = messages.length === 0 && !loadingMessages;
  const firstName = user?.firstName ?? '';
  const greeting = useMemo(timeBasedGreeting, []);

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
            ? 'Chippi is on it — new drafts will appear here'
            : 'Queued — Chippi will pick this up at the next heartbeat (~15 min)',
        );
      } else {
        toast.error("Couldn't kick off Chippi — please try again");
      }
    } catch {
      toast.error('Could not reach server');
    } finally {
      setRunning(false);
    }
  }

  // The trailing assistant message — used to detect the "thinking" state
  // (streaming but no blocks have landed yet) and to pin the permission
  // prompt at the end of the transcript.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  const showThinking =
    isStreaming && tailMessage?.role === 'assistant' && tailMessage.blocks.length === 0;

  // Reusable input — shared between the empty hero and the docked footer
  // so the focal point lives wherever it should.
  const renderInput = () => (
    <GradientAIChatInput
      placeholder="Message Chippi — draft a follow-up, prep a tour, summarize your day..."
      onSend={handleSend}
      onMentionSearch={handleMentionSearch}
      disabled={isStreaming || pendingApproval !== null}
      enableShadows={false}
      mainGradient={CALM_INPUT_GRADIENT}
      outerGradient={CALM_INPUT_GRADIENT}
    />
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
      {/* Floating control cluster — top-right, no top bar chrome */}
      <div className="absolute top-1.5 right-2 sm:top-2 sm:right-3 z-20 flex items-center gap-0.5">
        {messages.length >= MESSAGE_LIMIT * 0.8 && (
          <span className="hidden sm:inline text-[11px] tabular-nums text-amber-600 dark:text-amber-400 font-semibold px-2">
            {messages.length}/{MESSAGE_LIMIT}
          </span>
        )}
        {isEmpty && (
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={running}
            className="hidden sm:inline-flex items-center gap-1.5 mr-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            title="Run Chippi now"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Run now
          </button>
        )}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Conversation history"
          aria-label="Open conversation history"
        >
          <History size={15} />
        </button>
        <button
          type="button"
          onClick={() => setVoiceOpen((v) => !v)}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            voiceOpen
              ? 'bg-foreground text-background'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
          )}
          title="Voice mode"
          aria-label="Toggle voice mode"
        >
          <Mic size={15} />
        </button>
        <button
          type="button"
          onClick={handleNewConversation}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="New conversation"
          aria-label="Start a new conversation"
        >
          <Plus size={15} />
        </button>
        <Link
          href={`/s/${slug}/chippi?tab=settings`}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Settings"
          aria-label="Chippi settings"
        >
          <Settings size={15} />
        </Link>
      </div>

      {/* Conversation history drawer — softened overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-80 max-w-[85vw] bg-background border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <span className="font-semibold text-sm">History</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                aria-label="Close history"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ConversationSidebar
                slug={slug}
                conversations={conversations}
                activeId={activeConversationId}
                onSelect={handleSelectConversation}
                onNew={handleNewConversation}
                onDelete={handleDeleteConversation}
                onRename={handleRenameConversation}
              />
            </div>
          </div>
          <div className="flex-1 bg-foreground/10" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* ── Today view (no active conversation) ───────────────────── */}
      {loadingMessages ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      ) : isEmpty ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-14 pb-6 space-y-10">
              {/* Greeting + status */}
              <header className="space-y-1.5">
                <h1
                  className="text-3xl sm:text-4xl tracking-tight text-foreground"
                  style={{ fontFamily: 'var(--font-title)' }}
                >
                  {greeting}
                  {firstName ? `, ${firstName}` : ''}.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Here&apos;s what Chippi has for you. Ask anything below.
                </p>
              </header>

              {/* Today's work */}
              <TodayFeed slug={slug} />
            </div>
          </div>

          {/* Docked composer + quick prompts */}
          <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-2 pb-4 space-y-2.5">
            {renderInput()}
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => handleSend(s.text, [])}
                  disabled={isStreaming || pendingApproval !== null}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background hover:bg-accent/40 hover:border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span aria-hidden>{s.emoji}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Active thread */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-14 pb-4">
                {/* Conversation title — quiet, only when we have one */}
                {activeConversationId && (
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60 mb-6 truncate">
                    {conversations.find((c) => c.id === activeConversationId)?.title ?? ''}
                  </p>
                )}

                <div className="space-y-7">
                  {messages.map((msg, i) => {
                    const isTail = i === messages.length - 1;
                    if (
                      isTail &&
                      msg.role === 'assistant' &&
                      msg.blocks.length === 0 &&
                      isStreaming
                    ) {
                      return null;
                    }
                    if (msg.role === 'assistant') {
                      return (
                        <div key={msg.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-border/60">
                            <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <Transcript
                              blocks={msg.blocks}
                              role={msg.role}
                              streaming={msg.streaming && isStreaming}
                              liveCallIds={liveCallIds}
                              pendingApproval={
                                isTail && pendingApproval && !isStreaming
                                  ? {
                                      prompt: pendingApproval,
                                      onApprove: approve,
                                      onDeny: deny,
                                      onAlwaysAllow: alwaysAllow,
                                      busy: isStreaming,
                                    }
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <Transcript
                        key={msg.id}
                        blocks={msg.blocks}
                        role={msg.role}
                        streaming={msg.streaming && isStreaming}
                        liveCallIds={liveCallIds}
                      />
                    );
                  })}

                  {showThinking && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-border/60">
                        <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1.5">
                        <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" />
                        <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:0.2s]" />
                        <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:0.4s]" />
                        <span className="ml-1 italic">Chippi is thinking…</span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-200">
                      <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">{error}</div>
                      <button
                        type="button"
                        onClick={clearError}
                        className="text-rose-600/70 dark:text-rose-300/70 hover:text-rose-800 dark:hover:text-rose-100"
                        aria-label="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Stop button — quiet, above the input while streaming */}
          {isStreaming && !atLimit && (
            <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 flex justify-center pb-1">
              <button
                type="button"
                onClick={abort}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Stop generating"
              >
                <Square size={10} className="fill-current" />
                Stop
              </button>
            </div>
          )}

          {/* Docked input */}
          <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-2 pb-4">
            {atLimit ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 text-center">
                <div className="flex justify-center mb-2">
                  <AlertCircle size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                  You&apos;ve reached the 50-message limit for this conversation.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                  Start a new conversation to continue chatting.
                </p>
                <Button
                  size="sm"
                  onClick={handleNewConversation}
                  variant="outline"
                  className="border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800"
                >
                  Start new conversation
                </Button>
              </div>
            ) : (
              renderInput()
            )}
          </div>
        </>
      )}

      <VoiceMode
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        slug={slug}
        onTranscript={(role, text) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              role,
              blocks: [{ type: 'text', content: text }],
            },
          ]);
        }}
      />
    </div>
  );
}
