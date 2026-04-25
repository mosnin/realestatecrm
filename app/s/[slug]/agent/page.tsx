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
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { AgentPortfolioInsights } from '@/components/agent/agent-portfolio-insights';

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

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'inbox', label: 'Inbox', badge: pendingCount > 0 ? pendingCount : undefined },
    { key: 'activity', label: 'Activity' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-5 max-w-[900px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agent Inbox</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Actions your agent staged for your review. Approve to send, edit before approving, or dismiss.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map(({ key, label, badge }) => (
          <Link
            key={key}
            href={`/s/${slug}/agent${key !== 'inbox' ? `?tab=${key}` : ''}`}
            className={
              activeTab === key
                ? 'inline-flex items-center gap-1.5 bg-background shadow-sm rounded-md px-3 py-1.5 text-sm font-medium text-foreground'
                : 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors'
            }
          >
            {label}
            {badge !== undefined && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none">
                {badge}
              </span>
            )}
          </Link>
        ))}
      </div>

      {!agentEnabled && activeTab !== 'settings' && (
        <div className="flex items-start gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
          <Bot size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Agent automation is off</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable it in Settings to have your agent watch leads and draft outreach on your behalf.
            </p>
          </div>
          <Link
            href={`/s/${slug}/agent?tab=settings`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline flex-shrink-0 mt-0.5"
          >
            Enable <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <Suspense>
        {activeTab === 'inbox' && (
          <div className="space-y-5">
            <AgentQuestionsPanel />
            <AgentGoalsPanel />
            <AgentDraftInbox slug={slug} />
            <AgentPortfolioInsights />
          </div>
        )}
        {activeTab === 'activity' && <AgentActivityPage slug={slug} />}
        {activeTab === 'settings' && <AgentSettingsPanel slug={slug} />}
      </Suspense>
    </div>
  );
}
