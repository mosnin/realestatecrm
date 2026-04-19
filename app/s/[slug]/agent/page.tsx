import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Bot, Inbox, Activity, Settings } from 'lucide-react';
import { getSpaceForUser } from '@/lib/space';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentActivityFeed } from '@/components/agent/agent-activity-feed';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TABS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

export default async function AgentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab = TABS.find((t) => t.key === tab)?.key ?? 'inbox';

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceForUser(userId);
  if (!space) notFound();

  return (
    <div className="space-y-5 max-w-[900px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Bot size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your background AI — monitors leads and deals so nothing slips through the cracks
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <a
            key={key}
            href={`/s/${slug}/agent${key !== 'inbox' ? `?tab=${key}` : ''}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {label}
          </a>
        ))}
      </div>

      {/* Tab content */}
      <Suspense>
        {activeTab === 'inbox' && <AgentDraftInbox slug={slug} />}
        {activeTab === 'activity' && <AgentActivityFeed slug={slug} />}
        {activeTab === 'settings' && <AgentSettingsPanel slug={slug} />}
      </Suspense>
    </div>
  );
}
