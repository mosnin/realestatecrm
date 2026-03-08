import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { FlowEditor } from './flow-editor';

export default async function AgentBuilderPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Agent Flow Builder
        </h1>
        <p className="text-muted-foreground mt-1">
          Design your AI agent&apos;s conversation flow visually. Drag nodes from the palette, connect them, then deploy.
        </p>
      </div>

      <FlowEditor spaceId={space.id} />
    </div>
  );
}
