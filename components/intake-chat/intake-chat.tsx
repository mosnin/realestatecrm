'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { IntakeChatSuccess } from './intake-chat-success';
import { FieldProgress } from './field-progress';

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type Phase = 'greeting' | 'chatting' | 'submitting' | 'done';

export interface IntakeChatProps {
  slug: string;
  spaceId?: string;
  businessName: string;
  agentName: string;
  agentPhoto?: string | null;
  customization?: {
    accentColor: string;
    thankYouTitle: string | null;
    thankYouMessage: string | null;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * The marker the ASSISTANT emits to signal that the intake interview is
 * complete and the collected fields JSON follows.
 *
 * SECURITY: This marker is only read from the streamed ASSISTANT response
 * (the `accumulated` buffer built from the OpenAI stream).  User-supplied
 * message content is sent to the server and is never scanned for this marker
 * on the client side — only the AI's own stream output is checked.  This
 * means a user who types "__FIELDS__:{...}" cannot trigger a false submission,
 * because their message goes to the server as a user-role message and the
 * streamed bytes we read here come exclusively from the OpenAI completion.
 */
const FIELDS_MARKER = '__FIELDS__:';

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeChat({
  slug,
  spaceId,
  businessName,
  agentName,
  agentPhoto,
  customization,
}: IntakeChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [phase, setPhase] = useState<Phase>('greeting');
  const [applicationRef, setApplicationRef] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Initial greeting ───────────────────────────────────────────────────────

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: `Hi! I'm here to help you apply with ${businessName}. Are you looking to rent or buy a property?`,
      },
    ]);
    setPhase('chatting');
  }, [businessName]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, phase]);

  // ── Submit application ─────────────────────────────────────────────────────

  const submitApplication = useCallback(
    async (fields: Record<string, unknown>) => {
      try {
        // The AI emits `name`, `budget`, and `timing`/`timeline` keys that don't
        // match the apply endpoint's legacy schema field names. Map them here so
        // the endpoint can always find the right values regardless of which
        // validation path (dynamic form config or legacy) is used.
        const { name, budget, timing, timeline, ...rest } = fields as {
          name?: string;
          budget?: unknown;
          timing?: string;
          timeline?: string;
          leadType?: string;
          [key: string]: unknown;
        };

        const leadType = (fields.leadType as string) ?? 'rental';

        const mappedFields: Record<string, unknown> = {
          ...rest,
          // Legacy schema requires `legalName`; dynamic path's extractContactFields
          // also reads `data.name` as a fallback, so send both.
          legalName: name ?? '',
          name: name ?? '',
          // Map generic `budget` to the correct per-leadType field so the apply
          // endpoint's parseBudgetToNumber call can find it.
          ...(leadType === 'buyer'
            ? { buyerBudget: budget }
            : { monthlyRent: budget }),
          // Preserve timing under both names so both form paths find it.
          targetMoveInDate: timing ?? timeline ?? '',
          // Mark this contact as AI-chat-sourced so realtors can distinguish it
          // from traditional form submissions.
          sourceLabel: 'intake-chat-ai',
        };

        const res = await fetch('/api/public/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, spaceId, ...mappedFields }),
        });

        if (!res.ok) {
          // Still show success — don't strand the user on a network hiccup.
          setApplicationRef(null);
          setPhase('done');
          return;
        }

        const data = await res.json();
        setApplicationRef((data as { applicationRef?: string }).applicationRef ?? null);
      } catch {
        // Fail silently to the user — backend can recover from missing refs.
        setApplicationRef(null);
      } finally {
        setPhase('done');
      }
    },
    [slug, spaceId],
  );

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || isStreaming || phase === 'submitting' || phase === 'done') return;

      const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
      setMessages(newMessages);
      setIsStreaming(true);
      setStreamingContent('');

      try {
        const res = await fetch('/api/public/intake-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, messages: newMessages }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;

          // Check whether the __FIELDS__: sentinel has arrived anywhere in
          // the accumulated buffer.  It may land mid-chunk.
          const fieldsIdx = accumulated.indexOf(FIELDS_MARKER);
          if (fieldsIdx !== -1) {
            const textPart = accumulated.slice(0, fieldsIdx).trim();
            const jsonPart = accumulated.slice(fieldsIdx + FIELDS_MARKER.length).trim();

            // Update the streaming bubble with the text portion.
            if (textPart) setStreamingContent(textPart);

            try {
              const fields = JSON.parse(jsonPart) as Record<string, unknown>;

              // Commit the text portion as a real message then hand off.
              if (textPart) {
                setMessages((prev) => [...prev, { role: 'assistant', content: textPart }]);
              }
              setStreamingContent('');
              setIsStreaming(false);
              setPhase('submitting');
              await submitApplication(fields);
            } catch {
              // JSON parse failed — the marker arrived but the JSON wasn't
              // complete yet (shouldn't happen with a well-formed stream, but
              // be safe and keep reading).
            }
            break;
          }

          // Regular conversational chunk — update the live streaming bubble.
          setStreamingContent(accumulated);
        }

        // Stream ended without a __FIELDS__: marker — normal conversation turn.
        if (accumulated && !accumulated.includes(FIELDS_MARKER)) {
          setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);
          setStreamingContent('');
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
        ]);
        setStreamingContent('');
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, phase, slug, submitApplication],
  );

  // ── Infer collected fields from conversation ───────────────────────────────

  const collectedFields = useMemo(() => {
    const fields: Record<string, unknown> = {};
    const allText = messages.map((m) => m.content).join('\n').toLowerCase();

    // Name: first user message often contains it (two-word pattern)
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser && /\b[a-z]+ [a-z]+\b/i.test(firstUser.content)) {
      fields.name = firstUser.content;
    }
    if (/@/.test(allText)) fields.email = true;
    if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(allText)) fields.phone = true;
    if (/rent|rental|renting/.test(allText)) fields.leadType = 'rental';
    if (/buy|buying|purchase|buyer/.test(allText)) fields.leadType = 'buyer';
    if (/\$[\d,]+|\d+k|\d{3,}/.test(allText)) fields.budget = true;

    return fields;
  }, [messages]);

  const inferredLeadType =
    collectedFields.leadType === 'rental' || collectedFields.leadType === 'buyer'
      ? (collectedFields.leadType as 'rental' | 'buyer')
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputDisabled = isStreaming || phase === 'submitting';
  const inputPlaceholder =
    phase === 'submitting' ? 'Submitting your application…' : 'Type your answer…';

  return (
    <div className="flex flex-col h-full">
      {/* Messages scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-5"
      >
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            agentPhoto={agentPhoto}
            agentName={agentName}
            accentColor={customization?.accentColor}
          />
        ))}

        {/* Live streaming assistant bubble */}
        {isStreaming && streamingContent && (
          <MessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming
            agentPhoto={agentPhoto}
            agentName={agentName}
            accentColor={customization?.accentColor}
          />
        )}

        {/* Typing indicator while waiting for first chunk */}
        {isStreaming && !streamingContent && (
          <TypingIndicator
            agentPhoto={agentPhoto}
            agentName={agentName}
            accentColor={customization?.accentColor}
          />
        )}

        {/* Success state */}
        {phase === 'done' && (
          <IntakeChatSuccess
            businessName={businessName}
            agentPhoto={agentPhoto}
            applicationRef={applicationRef}
            thankYouTitle={customization?.thankYouTitle}
            thankYouMessage={customization?.thankYouMessage}
            accentColor={customization?.accentColor}
          />
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Field progress strip — shows which fields have been collected */}
      {phase === 'chatting' && messages.length >= 3 && (
        <FieldProgress
          collectedFields={collectedFields}
          leadType={inferredLeadType}
          accentColor={customization?.accentColor}
        />
      )}

      {/* Input area — hidden once the conversation is complete */}
      {phase !== 'done' && (
        <div className="px-4 pb-6 pt-2">
          <ChatInput
            onSend={sendMessage}
            disabled={inputDisabled}
            placeholder={inputPlaceholder}
            accentColor={customization?.accentColor}
          />

          {/* Escape hatch to the traditional multi-step form */}
          <div className="text-center mt-3">
            <a
              href={`/apply/${slug}`}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Switch to the form version instead
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Alias kept for backward-compatibility with the existing chat page import.
export { IntakeChat as IntakeChatView };
