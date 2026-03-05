'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './message-bubble';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  subdomain: string;
  initialMessages: Message[];
}

export function ChatInterface({ subdomain, initialMessages }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMessage]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, subdomain })
      });

      if (!res.ok || !res.body) {
        throw new Error('Failed to connect');
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
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot size={32} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">AI Assistant</p>
            <p className="text-sm mt-1">
              Ask me about your contacts, deals, or anything about your pipeline.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
            {[
              'Show me my highest value deals',
              'Which contacts are buyers?',
              'What deals are in Negotiation?',
              'Summarize my pipeline'
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="text-xs text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 p-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} role={msg.role} content={msg.content} />
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

      <div className="border-t pt-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your contacts or deals... (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="resize-none"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="h-auto"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
