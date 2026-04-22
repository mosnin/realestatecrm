'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ConversationSidebar } from './conversation-sidebar';
import { GradientAIChatInput, type MentionItem } from '@/components/ui/gradient-ai-chat-input';
import { Button } from '@/components/ui/button';
import { History, X, AlertCircle, Plus, Mic, Square } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { VoiceMode } from './voice-mode';
import { Transcript } from './blocks/transcript';
import { useAgentTask, type UiMessage } from './hooks/use-agent-task';
import { blocksFromLegacyContent, type MessageBlock } from '@/lib/ai-tools/blocks';
import type { Conversation } from '@/lib/types';
import { useUser } from '@clerk/nextjs';

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

interface ChatInterfaceProps {
  slug: string;
  initialMessages: LegacyMessage[];
  initialConversations: Conversation[];
  initialConversationId: string | null;
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

export function ChatInterface({
  slug,
  initialMessages,
  initialConversations,
  initialConversationId,
}: ChatInterfaceProps) {
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

  const atLimit = messages.length >= MESSAGE_LIMIT;
  const userAvatarUrl = user?.imageUrl ?? null;

  // The trailing assistant message — used to detect the "typing dots" state
  // (streaming but no blocks have landed yet) and to pin the permission
  // prompt at the end of the right transcript.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  const showTypingDots =
    isStreaming && tailMessage?.role === 'assistant' && tailMessage.blocks.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-2 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Conversation history"
          >
            <History size={16} />
          </button>
          {activeConversationId && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:inline">
              {conversations.find((c) => c.id === activeConversationId)?.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span
              className={cn(
                'text-xs tabular-nums',
                messages.length >= MESSAGE_LIMIT * 0.8
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              {messages.length}/{MESSAGE_LIMIT}
            </span>
          )}
          <button
            onClick={() => setVoiceOpen((v) => !v)}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
              voiceOpen
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            title="Voice mode"
          >
            <Mic size={16} />
          </button>
          <button
            type="button"
            onClick={handleNewConversation}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Conversation history drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-80 max-w-[85vw] bg-background border-r border-border flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">History</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
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
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-6 text-muted-foreground px-6">
            <div className="w-20 h-20 rounded-full overflow-hidden">
              <img src="/chip-avatar.png" alt="Chip" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-foreground text-xl">Chip</p>
              <p className="text-sm max-w-md">
                Your AI assistant for leads, deals, and pipeline insights. Use{' '}
                <span className="font-medium text-foreground">@</span> to pull in contacts or
                deals.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {[
                'Show me my highest value deals',
                'Which clients are in tour stage?',
                'What deals are in Negotiation?',
                'Summarize my pipeline',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion, [])}
                  className="text-xs text-left p-3 rounded-lg border border-border/60 hover:bg-accent/50 hover:border-border transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto space-y-4 px-4 sm:px-6 py-6">
              {messages.map((msg, i) => {
                const isTail = i === messages.length - 1;
                // Skip the assistant placeholder before any text — the
                // typing-dots renderer below handles that frame.
                if (
                  isTail &&
                  msg.role === 'assistant' &&
                  msg.blocks.length === 0 &&
                  isStreaming
                ) {
                  return null;
                }
                return (
                  <Transcript
                    key={msg.id}
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
                );
              })}

              {showTypingDots && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
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
          </ScrollArea>
        )}
      </div>

      {/* Stop button — docks above the input while a turn is streaming. */}
      {isStreaming && !atLimit && (
        <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 flex justify-center pb-1">
          <button
            type="button"
            onClick={abort}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground shadow-sm transition-colors"
            title="Stop generating"
          >
            <Square size={11} className="fill-current" />
            Stop
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-2 pb-4">
        {atLimit ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 text-center">
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
          <GradientAIChatInput
            placeholder="Ask Chip about your clients, deals, or pipeline..."
            onSend={handleSend}
            onMentionSearch={handleMentionSearch}
            disabled={isStreaming || pendingApproval !== null}
            enableShadows={true}
          />
        )}
      </div>
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
