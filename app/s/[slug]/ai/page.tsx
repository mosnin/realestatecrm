import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { sql } from '@/lib/db';
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
    const rows = await sql`
      SELECT * FROM "Message" WHERE "spaceId" = ${space.id} ORDER BY "createdAt" ASC LIMIT 50
    `;
    messages = (rows as { role: string; content: string }[]).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
  } catch {
    // fall back to empty history
  }

  return (
    <div className="space-y-4 h-full">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Assistant</h2>
        <p className="text-muted-foreground text-sm">
          Ask about your leads, clients, or pipeline — get instant answers from your leasing data
        </p>
      </div>
      <ChatInterface slug={slug} initialMessages={messages} />
    </div>
  );
}
