import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Bot, Inbox, Activity, Settings, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentDraftInbox } from '@/components/agent/agent-draft-inbox';
import { AgentActivityPage } from '@/components/agent/agent-activity-page';
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

type TabKey = (typeof TABS)[number]['key'];

export default async function AgentPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = (TABS.find((t) => t.key === tab)?.key ?? 'inbox') as TabKey;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceForUser(userId);
  if (!space) notFound();

  // Fetch pending draft count and agent status in parallel (server-side, fast)
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

      {/* Onboarding banner — shown when agent has never been enabled */}
      {!agentEnabled && activeTab !== 'settings' && (
        <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
          <Bot size={18} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Agent is not enabled</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn it on in Settings to start monitoring your leads and deals automatically.
            </p>
          </div>
          <Link
            href={`/s/${slug}/agent?tab=settings`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline flex-shrink-0 mt-0.5"
          >
            Set up <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const href = `/s/${slug}/agent${key !== 'inbox' ? `?tab=${key}` : ''}`;
          const isActive = activeTab === key;
          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {label}
              {key === 'inbox' && pendingCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      <Suspense>
        {activeTab === 'inbox' && <AgentDraftInbox slug={slug} />}
        {activeTab === 'activity' && <AgentActivityPage slug={slug} />}
        {activeTab === 'settings' && <AgentSettingsPanel slug={slug} />}
      </Suspense>
    </div>
  );
}
