import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ConversationHistory } from './conversation-history';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  const conversations = await db.conversation.findMany({
    where: { spaceId: space.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Conversation History
        </h1>
        <p className="text-muted-foreground mt-1">
          Voice call transcripts and SMS conversations from your AI agent.
        </p>
      </div>

      <ConversationHistory
        spaceId={space.id}
        initialConversations={JSON.parse(JSON.stringify(conversations))}
      />
    </div>
  );
}
