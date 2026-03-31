'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

type ChatMessage = {
  id: string;
  content: string;
  senderName: string;
  senderId: string;
  createdAt: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// A hash-based color generator for avatars
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    'bg-green-500/15 text-green-700 dark:text-green-400',
    'bg-purple-500/15 text-purple-700 dark:text-purple-400',
    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
    'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export default function TeamChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadMessages();
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Subscribe to realtime messages once we have conversationId
  useEffect(() => {
    if (!conversationId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) return;

    const client = createClient(supabaseUrl, supabaseAnonKey);

    const channel = client
      .channel(`broker-chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Message',
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as { id: string; role: string; content: string; createdAt: string };

          // Parse sender info from role field
          let senderName = 'Unknown';
          let senderId = '';
          if (msg.role.startsWith('user:')) {
            const parts = msg.role.split(':');
            senderId = parts[1] ?? '';
            senderName = parts.slice(2).join(':') || 'Unknown';
          }

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                content: msg.content,
                senderName,
                senderId,
                createdAt: msg.createdAt,
              },
            ];
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId]);

  async function loadMessages() {
    try {
      const res = await fetch('/api/broker/chat');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        setConversationId(data.conversationId ?? null);
      }
    } catch {
      toast.error('Failed to load chat');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/broker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }

      const newMsg = await res.json();

      // Add optimistically (realtime will also deliver, but we dedupe)
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
      setInput(text); // Restore the input on failure
    } finally {
      setSending(false);
    }
  }

  // Group consecutive messages from the same sender
  function shouldShowAvatar(msg: ChatMessage, idx: number) {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    return prev.senderId !== msg.senderId ||
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Team Chat</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time team communication
        </p>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <MessageCircle size={32} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No messages yet.</p>
              <p className="text-xs text-muted-foreground/60">
                Start a conversation with your team!
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const showAvatar = shouldShowAvatar(msg, idx);

                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
                    {/* Avatar or spacer */}
                    <div className="w-8 flex-shrink-0">
                      {showAvatar && (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarColor(
                            msg.senderName,
                          )}`}
                        >
                          {initials(msg.senderName)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-semibold">{msg.senderName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary max-h-32"
              style={{ minHeight: '38px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
            >
              {sending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
