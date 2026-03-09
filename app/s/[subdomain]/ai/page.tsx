import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';
import { ChatInterface } from '@/components/ai/chat-interface';

export default async function AIPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  const recentMessages = await db.message.findMany({
    where: { spaceId: space.id },
    orderBy: { createdAt: 'asc' },
    take: 50
  });

  const messages = recentMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  return (
    <div className="space-y-4 h-full">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Assistant</h2>
        <p className="text-muted-foreground text-sm">
          Ask about your leads, clients, or pipeline — get instant answers from your leasing data
        </p>
      </div>
      <ChatInterface subdomain={subdomain} initialMessages={messages} />
    </div>
  );
}
