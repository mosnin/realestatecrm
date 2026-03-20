'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ConversationSidebar } from './conversation-sidebar';
import { GradientAIChatInput, type MentionItem } from '@/components/ui/gradient-ai-chat-input';
import { Button } from '@/components/ui/button';
import { History, X, AlertCircle, Sparkles, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/types';
import type { CRMAction } from './action-card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  slug: string;
  initialMessages: Message[];
  initialConversations: Conversation[];
  initialConversationId: string | null;
}

const MESSAGE_LIMIT = 50;

export function ChatInterface({
  slug,
  initialMessages,
  initialConversations,
  initialConversationId,
}: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const inFlightRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/ai/messages?conversationId=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      }
    } finally {
      setLoadingMessages(false);
    }
  }, []);

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
      const conv = await res.json();
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
      const updated = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  function updateConversationTitle(id: string, firstUserMessage: string) {
    const autoTitle = firstUserMessage.trim().slice(0, 60);
    setConversations((prev) =>
      prev.map((c) => (c.id === id && c.title === 'New conversation' ? { ...c, title: autoTitle } : c))
    );
  }

  const handleMentionSearch = useCallback(async (query: string): Promise<MentionItem[]> => {
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
          ? deals.filter((d: any) => d.title.toLowerCase().includes(lowerQuery))
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
  }, [slug]);

  async function handleSend(text: string, mentions: MentionItem[]) {
    if (!text || inFlightRef.current) return;

    let contextPrefix = '';
    if (mentions.length > 0) {
      const mentionLabels = mentions.map(
        (m) => `[${m.type === 'contact' ? 'Contact' : 'Deal'}: ${m.label}]`
      );
      contextPrefix = `(Referencing: ${mentionLabels.join(', ')})\n\n`;
    }
    const fullMessage = contextPrefix + text;

    let conversationId = activeConversationId;
    if (!conversationId) {
      const res = await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) return;
      const conv = await res.json();
      conversationId = conv.id;
      setActiveConversationId(conv.id);
      setConversations((prev) => [conv, ...prev]);
    }

    inFlightRef.current = true;

    const isFirstMessage = messages.length === 0;
    // Display the raw text in the UI — the context prefix is only for the API
    const displayMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(displayMessages);
    setIsStreaming(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages([...displayMessages, assistantMessage]);

    if (isFirstMessage && conversationId) {
      updateConversationTitle(conversationId, text);
    }

    // Send fullMessage (with referencing prefix) to the API for context
    const apiMessages: Message[] = [...messages, { role: 'user', content: fullMessage }];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, slug, conversationId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to connect');
      }

      if (!res.body) {
        throw new Error('No response body from AI API');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...newMessages, { role: 'assistant', content: accumulated }]);
      }

      if (conversationId) {
        setConversations((prev) => {
          const conv = prev.find((c) => c.id === conversationId);
          if (!conv) return prev;
          return [{ ...conv, updatedAt: new Date() }, ...prev.filter((c) => c.id !== conversationId)];
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sorry, I encountered an error. Please try again.';
      setMessages([...newMessages, { role: 'assistant', content: message }]);
    } finally {
      inFlightRef.current = false;
      setIsStreaming(false);
    }
  }

  const handleAction = useCallback(async (action: CRMAction): Promise<boolean> => {
    const endpoint = action.type === 'update_contact'
      ? `/api/contacts/${action.id}`
      : `/api/deals/${action.id}`;
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.changes),
      });
      if (!res.ok) {
        console.error('[Chat] Action failed:', res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Chat] Action error:', err);
      return false;
    }
  }, [slug]);

  const atLimit = messages.length >= MESSAGE_LIMIT;

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
            <span className={cn(
              'text-xs tabular-nums',
              messages.length >= MESSAGE_LIMIT * 0.8
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-muted-foreground'
            )}>
              {messages.length}/{MESSAGE_LIMIT}
            </span>
          )}
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

      {/* Messages area — centered, breathable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-6 text-muted-foreground px-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles size={36} className="text-primary" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-foreground text-xl">Chip</p>
              <p className="text-sm max-w-md">
                Your AI assistant for leads, deals, and pipeline insights. Use <span className="font-medium text-foreground">@</span> to pull in contacts or deals.
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
                  className="text-xs text-left p-3 rounded-xl border border-border/60 hover:bg-accent/50 hover:border-border transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto space-y-4 px-4 sm:px-6 py-6">
              {messages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} content={msg.content} onAction={handleAction} />
              ))}
              {isStreaming && messages[messages.length - 1]?.content === '' && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input — pinned bottom, centered */}
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
            <Button size="sm" onClick={handleNewConversation} variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800">
              Start new conversation
            </Button>
          </div>
        ) : (
          <GradientAIChatInput
            placeholder="Ask Chip about your clients, deals, or pipeline..."
            onSend={handleSend}
            onMentionSearch={handleMentionSearch}
            disabled={isStreaming}
            enableShadows={true}
          />
        )}
      </div>
    </div>
  );
}
