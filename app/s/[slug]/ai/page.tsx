import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChatInterface } from '@/components/ai/chat-interface';

export default async function AIPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let messages: { role: 'user' | 'assistant'; content: string }[] = [];
  try {
    const { data, error } = await supabase.from('Message').select('*').eq('spaceId', space.id).order('createdAt', { ascending: true }).limit(50);
    if (error) throw error;
    messages = ((data ?? []) as { role: string; content: string }[]).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
  } catch {
    // fall back to empty history
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">AI Assistant</h2>
        <p className="text-muted-foreground text-sm">
          Ask about your leads, clients, or pipeline — get instant answers from your leasing data
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface slug={slug} initialMessages={messages} />
      </div>
    </div>
  );
}
