'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ConversationSidebar } from '@/components/ai/conversation-sidebar';
import { ChippiPromptBox, type MentionItem } from '@/components/ui/chippi-prompt-box';
import { Button } from '@/components/ui/button';
import { History, X, AlertCircle, Mic, Settings, ArrowLeft, Play, Loader2, NotebookText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { VoiceMode } from '@/components/ai/voice-mode';
import { Transcript } from '@/components/ai/blocks/transcript';
import { ThinkingIndicator } from '@/components/ai/blocks/thinking-indicator';
import { useAgentTask, type UiMessage } from '@/components/ai/hooks/use-agent-task';
import { blocksFromLegacyContent, type MessageBlock } from '@/lib/ai-tools/blocks';
import type { Conversation } from '@/lib/types';
import { useUser } from '@clerk/nextjs';
import { TodayFeed } from './today-feed';
import { MorningStory } from './morning-story';
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
  /** Pre-populate the composer on mount but do NOT auto-send — the realtor
   *  finishes the sentence themselves. Used by "or just tell Chippi →"
   *  shortcuts on /contacts and /deals, and by morning-actions. Distinct
   *  from `initialInput` which auto-sends. */
  initialPrefill?: string;
}

const MESSAGE_LIMIT = 50;

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
}: ChippiWorkspaceProps) {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get('conversationId');
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    urlConversationId ?? initialConversationId,
  );
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
    send,
    approve,
    deny,
    alwaysAllow,
    abort,
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

  // React to URL-driven conversation switches (sidebar list links with
  // `?conversationId=…`). When the URL diverges from local state, sync local
  // state and load the matching transcript. Skipped on the initial mount —
  // the server already pre-hydrated us with the right conversation.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (urlConversationId === activeConversationId) return;
    if (!urlConversationId) {
      setActiveConversationId(null);
      setMessages([]);
      return;
    }
    setActiveConversationId(urlConversationId);
    void (async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/ai/messages?conversationId=${urlConversationId}`);
        if (res.ok) {
          const data = (await res.json()) as LegacyMessage[];
          setMessages(legacyToUi(data));
        }
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [urlConversationId, activeConversationId, setMessages]);

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
    async (text: string, mentions: MentionItem[], attachmentIds?: string[]) => {
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      if (!text && !hasAttachments) return;
      let contextPrefix = '';
      if (mentions.length > 0) {
        const labels = mentions.map(
          (m) => `[${m.type === 'contact' ? 'Contact' : 'Deal'}: ${m.label}]`,
        );
        contextPrefix = `(Referencing: ${labels.join(', ')})\n\n`;
      }
      await send(contextPrefix + text, attachmentIds);

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

  // Composer prefill — bumped by the day-one welcome's "Tell me about a lead"
  // action, and seeded on mount when arriving from `?prefill=` (the
  // "or just tell Chippi →" shortcuts on /contacts and /deals, and
  // morning-actions). Nonce so identical text twice in a row still re-applies.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(
    initialPrefill ? { text: initialPrefill, nonce: Date.now() } : null,
  );
  const handleTellMeAboutLead = useCallback((text: string) => {
    setPrefill({ text, nonce: Date.now() });
  }, []);

  // Counts for the header status sentence. Fetch only when we're rendering
  // the today view — no point pinging while in an active conversation. The
  // child sections still self-fetch their own data; this is a lightweight
  // duplicate read for a one-line summary.
  const [counts, setCounts] = useState<{ drafts: number; questions: number }>({
    drafts: 0,
    questions: 0,
  });
  const [countsLoaded, setCountsLoaded] = useState(false);
  useEffect(() => {
    if (!isEmpty) return;
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
  }, [isEmpty]);

  // Day-one signal: zero of everything. The realtor has truly never engaged.
  // We wait for `countsLoaded` so we don't flash the welcome before we know
  // whether there's pending work. `messages.length === 0` is implied by
  // `isEmpty`; checking it twice is cheap and explicit.
  const isFresh =
    isEmpty &&
    countsLoaded &&
    messages.length === 0 &&
    counts.drafts === 0 &&
    counts.questions === 0 &&
    conversations.length === 0;

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
  // (streaming but no blocks have landed yet) and to pin the permission
  // prompt at the end of the transcript.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  const showThinking =
    isStreaming && tailMessage?.role === 'assistant' && tailMessage.blocks.length === 0;

  // Reusable input — shared between the empty hero and the docked footer
  // so the focal point lives wherever it should.
  const renderInput = () => (
    <ChippiPromptBox
      placeholder="Message Chippi — draft a follow-up, prep a tour, summarize your day…"
      onSend={handleSend}
      onMentionSearch={handleMentionSearch}
      onVoiceStart={() => setVoiceOpen(true)}
      onAbort={abort}
      disabled={isStreaming || pendingApproval !== null}
      isLoading={isStreaming}
      prefill={prefill ?? undefined}
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
            className="inline-flex items-center gap-1.5 mr-1 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            title="Run Chippi now"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            <span className="hidden sm:inline">Run now</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
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
        <Link
          href={`/s/${slug}/chippi/memory`}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="What I remember"
          aria-label="What Chippi remembers"
        >
          <NotebookText size={15} />
        </Link>
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
          One moment.
        </div>
      ) : isEmpty ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-40 sm:pb-32 space-y-10 sm:space-y-12">
              {/* The home is one sentence — Chippi's composed morning story
                  promoted to h1. Pulls stuck deals, overdue follow-ups, new
                  arrivals, hot people, drafts, questions in one shot; names
                  the loudest single fact and (when there's a top subject)
                  becomes a doorway to that deal or person.

                  The audit cut the "Good morning, Sarah" greeting (wallpaper —
                  every productivity app ships it; nobody notices) and the
                  MorningReplay recap card (the agent talking about itself
                  instead of about the deals). The home now answers one
                  question: what should I do next? */}
              <MorningStory slug={slug} />

              {/* Today's work — one focal item with Send / Edit / Hold. */}
              <TodayFeed
                slug={slug}
                isFresh={isFresh}
                firstName={firstName}
                onTellMeAboutLead={handleTellMeAboutLead}
              />
            </div>
          </div>

          {/* Docked composer — sticky to viewport bottom so the input stays
              reachable as the realtor scrolls. The four suggestion chips
              that used to sit above were a crutch (and ChatGPT removed
              theirs for a reason). The composer's placeholder already
              cues the verbs: "draft a follow-up, prep a tour, summarize
              your day…" — trust the user to type. */}
          <div className="sticky bottom-0 z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-background/0">
            {renderInput()}
          </div>
        </>
      ) : (
        <>
          {/* Active thread */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-14 pb-4">
                {/* Conversation title — quiet, only when we have one */}
                {activeConversationId && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-6 truncate">
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
                      <div className="flex-1 min-w-0 pt-0.5">
                        <ThinkingIndicator />
                      </div>
                    </div>
                  )}

                  {/* Errors land inline as Chippi assistant messages
                      (see useAgentTask.landChippiError) so the failure mode
                      reads like Chippi talking, not a red system banner. The
                      `error` state is still tracked for telemetry / a11y but
                      not rendered here. */}

                  <div ref={bottomRef} />
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* The standalone Stop button used to live here — moved into the
              composer's right-slot (Send → Stop swap) so the abort affordance
              sits exactly where the user's eye is. ChatGPT / Claude pattern. */}

          {/* Docked input — sticky to viewport bottom (matches the empty
              state's composer dock so the input never rides up with messages). */}
          <div className="sticky bottom-0 z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-background/0">
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
