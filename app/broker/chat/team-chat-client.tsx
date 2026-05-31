'use client';

/**
 * Broker team chat — Chippi vocabulary.
 *
 * Same visual treatment as the realtor's WhatsApp thread view: paper-flat
 * bubbles (rounded-lg, hairline border, no shadow), day-grouped
 * SECTION_LABEL headers, sticky send footer with PRIMARY_PILL.
 *
 * Outgoing (current user) lands right-aligned with a subtle foreground
 * tint. Incoming lands left-aligned on background. Chippi Bot replies
 * carry a small "Chippi" name above the bubble (one of the sanctioned
 * brand-orange contexts via the AGENT_BADGE / CHIPPI_AVATAR vocabulary).
 *
 * Realtime wiring (Supabase channel, INSERT events on Message) is kept
 * identical. Template variable rendering does not apply here — this
 * surface only handles team chat content, not templated messages.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Send,
  Users,
  PhoneIncoming,
  BarChart3,
  ArrowRight,
  CalendarDays,
  Clock,
  HelpCircle,
  Loader2,
  Slash,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
  BODY,
  BODY_MUTED,
  META,
  SECTION_LABEL,
  PRIMARY_PILL,
  CAPTION,
} from '@/lib/typography';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  content: string;
  senderName: string;
  senderId: string;
  createdAt: string;
  type?: 'user' | 'bot' | 'system';
};

export type ChatContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  scoreLabel: string | null;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

type MentionItem = {
  id: string;
  name: string;
  type: 'lead' | 'member';
  detail: string | null;
  scoreLabel?: string | null;
};

interface TeamChatClientProps {
  contacts: ChatContact[];
  teamMembers: TeamMember[];
  brokerageId: string;
  currentUserId: string;
}

// ── Slash commands ───────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { command: '/status', description: 'Show team member status', icon: Users },
  { command: '/leads', description: 'Count of unassigned brokerage leads', icon: PhoneIncoming },
  { command: '/pipeline', description: 'Pipeline summary across all agents', icon: BarChart3 },
  { command: '/assign', description: 'Assign a lead: /assign @lead @realtor', icon: ArrowRight },
  { command: '/tours-today', description: "Today's tours across the team", icon: CalendarDays },
  { command: '/followups', description: 'Overdue follow-ups across team', icon: Clock },
  { command: '/help', description: 'List all commands', icon: HelpCircle },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'TODAY';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'YESTERDAY';
  return d
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase();
}

/** Render message content with @mentions highlighted in foreground bold. */
function renderContent(content: string) {
  const mentionRegex = /@([\w][\w\s]*\w)/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push(content.slice(lastIndex, match.index));
    }
    elements.push(
      <span key={match.index} className="font-semibold text-foreground">
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return elements.length > 0 ? elements : content;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TeamChatClient({
  contacts,
  teamMembers,
  brokerageId,
  currentUserId,
}: TeamChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  // Slash command state
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandExecuting, setCommandExecuting] = useState(false);

  // Build unified mention list: team members + leads
  const mentionItems: MentionItem[] = useMemo(() => {
    const members: MentionItem[] = teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      type: 'member' as const,
      detail:
        m.role === 'broker_owner'
          ? 'Owner'
          : m.role === 'broker_admin'
            ? 'Admin'
            : 'Realtor',
    }));
    const leads: MentionItem[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'lead' as const,
      detail: c.phone,
      scoreLabel: c.scoreLabel,
    }));
    return [...members, ...leads];
  }, [teamMembers, contacts]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return mentionItems.slice(0, 10);
    const q = mentionQuery.toLowerCase();
    return mentionItems
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [mentionItems, mentionQuery]);

  const filteredCommands = useMemo(() => {
    if (!commandQuery) return SLASH_COMMANDS;
    const q = commandQuery.toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [commandQuery]);

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
    setMentionStart(null);
  }, []);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandIndex(0);
  }, []);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (mentionStart === null) return;
      const textarea = inputRef.current;
      if (!textarea) return;

      const before = input.slice(0, mentionStart);
      const after = input.slice(textarea.selectionStart);
      const mentionText = `@${item.name}`;
      const newInput = before + mentionText + ' ' + after;

      setInput(newInput);
      closeMention();

      // If tagging a team member, fire off a notification (non-blocking).
      if (item.type === 'member' && item.id !== currentUserId) {
        const currentMember = teamMembers.find((m) => m.id === currentUserId);
        const senderName = currentMember?.name ?? 'Someone';
        fetch('/api/broker/chat-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brokerageId,
            taggedUserId: item.id,
            message: newInput.trim(),
            senderName,
          }),
        }).catch(() => {
          // Notification is best-effort.
        });
      }

      requestAnimationFrame(() => {
        if (inputRef.current) {
          const pos = before.length + mentionText.length + 1;
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
          inputRef.current.focus();
        }
      });
    },
    [input, mentionStart, closeMention, currentUserId, teamMembers, brokerageId],
  );

  const insertCommand = useCallback(
    (cmd: (typeof SLASH_COMMANDS)[number]) => {
      setInput(cmd.command + ' ');
      closeCommand();
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const pos = cmd.command.length + 1;
          inputRef.current.selectionStart = pos;
          inputRef.current.selectionEnd = pos;
        }
      });
    },
    [closeCommand],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const msg = payload.new as {
            id: string;
            role: string;
            content: string;
            createdAt: string;
          };

          let senderName = 'Unknown';
          let senderId = '';
          if (msg.role.startsWith('user:')) {
            const parts = msg.role.split(':');
            senderId = parts[1] ?? '';
            senderName = parts.slice(2).join(':') || 'Unknown';
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                content: msg.content,
                senderName,
                senderId,
                createdAt: msg.createdAt,
                type: 'user',
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
        setMessages(
          (data.messages ?? []).map((m: ChatMessage) => ({
            ...m,
            type: m.type ?? 'user',
          })),
        );
        setConversationId(data.conversationId ?? null);
      }
    } catch {
      toast.error('Couldn’t load chat.');
    } finally {
      setLoading(false);
    }
  }

  async function executeSlashCommand(text: string) {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const cmdMsg: ChatMessage = {
      id: `cmd-${Date.now()}`,
      content: text.trim(),
      senderName: 'You',
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      type: 'system',
    };
    setMessages((prev) => [...prev, cmdMsg]);

    setCommandExecuting(true);

    try {
      const res = await fetch('/api/broker/chat-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args, brokerageId }),
      });

      if (!res.ok) throw new Error('Command failed');

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        content: data.result,
        senderName: 'Chippi',
        senderId: 'bot',
        createdAt: new Date().toISOString(),
        type: 'bot',
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        content: 'That command didn’t run — usually temporary.',
        senderName: 'Chippi',
        senderId: 'bot',
        createdAt: new Date().toISOString(),
        type: 'bot',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setCommandExecuting(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      setInput('');
      await executeSlashCommand(text);
      return;
    }

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
        throw new Error(data.error || 'Couldn’t send.');
      }

      const newMsg = await res.json();

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, { ...newMsg, type: 'user' }];
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t send.');
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    const textarea = inputRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.slice(0, cursorPos);

    if (textBefore.startsWith('/')) {
      const query = textBefore.slice(1);
      if (!/\s/.test(query) || query === '') {
        setCommandOpen(true);
        setCommandQuery('/' + query);
        setCommandIndex(0);
        closeMention();
        return;
      }
    }
    closeCommand();

    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx >= 0) {
      const charBeforeAt = atIdx > 0 ? textBefore[atIdx - 1] : ' ';
      const query = textBefore.slice(atIdx + 1);
      if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIdx === 0) && !/\s/.test(query)) {
        setMentionOpen(true);
        setMentionQuery(query);
        setMentionIndex(0);
        setMentionStart(atIdx);
        return;
      }
    }

    closeMention();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (commandOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCommands[commandIndex]) insertCommand(filteredCommands[commandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommand();
        return;
      }
    }

    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions[mentionIndex]) insertMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen && !commandOpen) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Grouping ─────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ChatMessage[] }[] = [];
    let lastKey = '';
    for (const m of messages) {
      const key = localDateKey(m.createdAt);
      if (key !== lastKey) {
        out.push({ key, label: dayLabel(m.createdAt), items: [m] });
        lastKey = key;
      } else {
        out[out.length - 1].items.push(m);
      }
    }
    return out;
  }, [messages]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {loading ? (
        <p className={cn(BODY_MUTED)}>Pulling the room.</p>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className={cn(BODY)}>Quiet — nothing in the room yet.</p>
          <p className={cn(BODY_MUTED, 'mt-1')}>
            Type{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
              /help
            </kbd>{' '}
            to see what Chippi can answer.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="space-y-3">
              <p className={cn(SECTION_LABEL, 'text-center')}>{g.label}</p>
              <div className="space-y-2">
                {g.items.map((m) => (
                  <Bubble key={m.id} message={m} currentUserId={currentUserId} />
                ))}
              </div>
            </section>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Sticky send footer */}
      <div className="sticky bottom-0 bg-background pt-4 pb-4 border-t border-border/60">
        <div className="relative flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={() =>
                setTimeout(() => {
                  closeMention();
                  closeCommand();
                }, 200)
              }
              placeholder="Write a message…  Try / for commands or @ to tag someone."
              rows={2}
              disabled={sending || commandExecuting}
              className={cn(
                'w-full resize-none rounded-md border border-input bg-transparent px-3 py-2',
                'text-base md:text-sm placeholder:text-muted-foreground/70',
                'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                'transition-colors duration-150 disabled:opacity-50',
              )}
              style={{ minHeight: '60px', maxHeight: '160px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 160) + 'px';
              }}
            />

            {/* Slash command palette */}
            {commandOpen && filteredCommands.length > 0 && (
              <div
                className={cn(
                  'absolute bottom-full mb-1 left-0 z-50 w-80 max-h-72 overflow-auto',
                  'rounded-md border border-border/70 bg-popover',
                )}
              >
                <div className="px-3 py-2 border-b border-border/60">
                  <p className={cn(SECTION_LABEL)}>Commands</p>
                </div>
                {filteredCommands.map((cmd, i) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.command}
                      className={cn(
                        'w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 transition-colors',
                        i === commandIndex
                          ? 'bg-foreground/[0.06]'
                          : 'hover:bg-foreground/[0.04]',
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertCommand(cmd);
                      }}
                      onMouseEnter={() => setCommandIndex(i)}
                    >
                      <Icon size={14} className="text-muted-foreground shrink-0" />
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="font-mono text-xs">{cmd.command}</span>
                        <span className={cn(CAPTION, 'truncate')}>
                          {cmd.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* @ mention dropdown */}
            {mentionOpen && filteredMentions.length > 0 && (
              <div
                className={cn(
                  'absolute bottom-full mb-1 left-0 z-50 w-80 max-h-64 overflow-auto',
                  'rounded-md border border-border/70 bg-popover',
                )}
              >
                {filteredMentions.some((m) => m.type === 'member') && (
                  <>
                    <div className="px-3 py-1.5 border-b border-border/60">
                      <p className={cn(SECTION_LABEL)}>Team</p>
                    </div>
                    {filteredMentions
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) => item.type === 'member')
                      .map(({ item, idx }) => (
                        <button
                          key={item.id}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                            idx === mentionIndex
                              ? 'bg-foreground/[0.06]'
                              : 'hover:bg-foreground/[0.04]',
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(item);
                          }}
                          onMouseEnter={() => setMentionIndex(idx)}
                        >
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{item.name}</span>
                              <span className={cn(META)}>{item.detail}</span>
                            </span>
                          </span>
                        </button>
                      ))}
                  </>
                )}
                {filteredMentions.some((m) => m.type === 'lead') && (
                  <>
                    <div className="px-3 py-1.5 border-b border-border/60">
                      <p className={cn(SECTION_LABEL)}>Leads</p>
                    </div>
                    {filteredMentions
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) => item.type === 'lead')
                      .map(({ item, idx }) => (
                        <button
                          key={item.id}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                            idx === mentionIndex
                              ? 'bg-foreground/[0.06]'
                              : 'hover:bg-foreground/[0.04]',
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(item);
                          }}
                          onMouseEnter={() => setMentionIndex(idx)}
                        >
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="truncate font-medium">{item.name}</span>
                            {item.detail && (
                              <span className={cn(META, 'truncate')}>
                                {item.detail}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || commandExecuting || !input.trim()}
            className={cn(PRIMARY_PILL, 'disabled:opacity-50 shrink-0')}
            aria-label="Send"
          >
            {sending || commandExecuting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            <span className="hidden sm:inline">
              {sending || commandExecuting ? 'Sending…' : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bubble ──────────────────────────────────────────────────────────────────

function Bubble({
  message,
  currentUserId,
}: {
  message: ChatMessage;
  currentUserId: string;
}) {
  // System message — slash command echo, center-aligned chip.
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 text-xs text-muted-foreground">
          <Slash size={10} />
          <span className="font-mono">{message.content}</span>
        </div>
      </div>
    );
  }

  // Bot message — left-aligned, "Chippi" label in serif orange (a sanctioned
  // brand-orange context — agent authorship).
  if (message.type === 'bot') {
    return (
      <div className="flex flex-col items-start">
        <p className="text-[11px] mb-0.5 ml-1 tabular-nums">
          <span className="text-orange-600 dark:text-orange-400 font-medium">
            Chippi
          </span>{' '}
          <span className="text-muted-foreground">{formatTime(message.createdAt)}</span>
        </p>
        <div className="max-w-[80%] rounded-lg border border-border/60 bg-background px-3.5 py-2">
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
            {message.content}
          </pre>
        </div>
      </div>
    );
  }

  // Regular user message — right-aligned if outgoing, left if incoming.
  const fromMe = message.senderId === currentUserId;

  return (
    <div className={cn('flex flex-col', fromMe ? 'items-end' : 'items-start')}>
      {!fromMe && (
        <p className={cn(META, 'mb-0.5 ml-1')}>
          <span className="font-medium text-foreground">{message.senderName}</span>{' '}
          <span>{formatTime(message.createdAt)}</span>
        </p>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-lg border border-border/60 px-3.5 py-2 space-y-1',
          fromMe ? 'bg-foreground/[0.04]' : 'bg-background',
        )}
      >
        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {renderContent(message.content)}
        </p>
        {fromMe && (
          <p className={cn(META, 'text-right')}>{formatTime(message.createdAt)}</p>
        )}
      </div>
    </div>
  );
}
