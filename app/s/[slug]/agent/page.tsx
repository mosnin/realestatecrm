import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Bot, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentActivityPage } from '@/components/agent/agent-activity-page';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';
import { AssistantTabs } from '@/components/assistant/assistant-tabs';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type TabKey = 'inbox' | 'activity' | 'settings';

export default async function AgentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = tab === 'activity' || tab === 'settings' ? tab : 'inbox';

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceForUser(userId);
  if (!space) notFound();

  const [draftsResult, settingsResult] = await Promise.all([
    supabase
      .from('AgentDraft')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'pending'),
    supabase
      .from('AgentSettings')
      .select('enabled')
      .eq('spaceId', space.id)
      .maybeSingle(),
  ]);

  const pendingCount = draftsResult.count ?? 0;
  const agentEnabled = settingsResult.data?.enabled ?? false;

  return (
    <div className="space-y-5 max-w-[900px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your AI that watches your leads, drafts replies, and flags what needs your attention.
        </p>
      </div>

      <AssistantTabs slug={slug} pendingDrafts={pendingCount} />

      {!agentEnabled && activeTab !== 'settings' && (
        <div className="flex items-start gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
          <Bot size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Automated assistant is off</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn it on in Settings to have it watch leads and draft replies for you.
            </p>
          </div>
          <Link
            href={`/s/${slug}/agent?tab=settings`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline flex-shrink-0 mt-0.5"
          >
            Turn on <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <Suspense>
        {activeTab === 'inbox' && <AgentDraftInbox slug={slug} />}
        {activeTab === 'activity' && <AgentActivityPage slug={slug} />}
        {activeTab === 'settings' && <AgentSettingsPanel slug={slug} />}
      </Suspense>
    </div>
  );
}
