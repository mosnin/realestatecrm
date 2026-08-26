import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { GeneralSettingsForm, DangerZone } from './general-settings-form';
import { WorkspacePeopleSection } from './workspace-people-section';
import { ownerHasPaidWorkspace, userCanManageSpace } from '@/lib/workspaces';
import { ProfileSection } from './profile-section';
import { LanguageSection } from './language-section';
import { NotificationsSection } from './notifications-section';
import { BriefSection } from './brief-section';
import { LegalSettingsForm } from './legal/legal-settings-form';
import { IntakeTrustSignalsForm } from './intake-trust-signals-form';
import { TrackingPixelsForm } from './tracking-pixels-form';
import { YourDataSection } from './your-data-section';
import { McpSection, TemplatesSection } from './integrations-section';
import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import { MemoryList } from '@/components/chippi/memory-list';
import { AIProfileForm } from '@/components/profile/ai-profile-form';
import { UsageSection } from '@/components/settings/usage-section';
import { cn } from '@/lib/utils';
import type { SpaceSetting } from '@/lib/types';
import { StaggerReveal, SplitReveal } from '@/components/motion';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  PRIMARY_PILL,
  SECTION_LABEL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

/**
 * Settings — task-grouped tabs the realtor can hold in their head:
 *
 *   Workspace    space name + slug + danger zone
 *   You          profile + bio + AI personalization + chat model
 *   Connections  OAuth apps + message templates (everywhere Chippi acts through)
 *   Memory       what Chippi has learned about this workspace
 *   Routines     the realtor's standing instructions for Chippi
 *   Privacy      notifications + legal + compliance + fair-housing notice
 *   Developer    MCP + API keys + usage (per-tool cost breakdown)
 *
 * Memory lives here because it describes how Chippi WORKS, not what Chippi did
 * today. (Routines used to live here too; they unified into the /automations
 * hub alongside Workflows — one home for everything Chippi runs on its own.)
 *
 * Tab state lives in `?tab=...` so the URL stays shareable, sub-route
 * redirects resolve cleanly, and back-button history works. Each render
 * hydrates only the active tab's sections — the old single-scroll page
 * hydrated nine sections per load and most of them were never read.
 */

const TABS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'you', label: 'You' },
  { id: 'connections', label: 'Connections' },
  { id: 'memory', label: 'Memory' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'developer', label: 'Developer' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isValidTab(v: string | undefined | null): v is TabId {
  return typeof v === 'string' && TABS.some((t) => t.id === v);
}

/**
 * Map legacy tab IDs onto the new structure. The Chippi dropdown reorg
 * folded Integrations into Connections, so `?tab=integrations` now lands
 * on the Connections tab. Older aliases fold onto the closest equivalent.
 * Anything unrecognized falls through to the default tab.
 */
function resolveLegacyTab(
  raw: string | undefined,
  slug: string,
): { kind: 'redirect'; to: string } | { kind: 'tab'; id: TabId } | null {
  if (!raw) return null;
  if (isValidTab(raw)) return { kind: 'tab', id: raw };
  switch (raw) {
    case 'profile':
      return { kind: 'redirect', to: `/s/${slug}/settings?tab=you` };
    case 'apps':
    case 'integrations':
      return { kind: 'redirect', to: `/s/${slug}/settings?tab=connections` };
    case 'notifications':
      return { kind: 'redirect', to: `/s/${slug}/settings?tab=privacy` };
    case 'usage':
      return { kind: 'redirect', to: `/s/${slug}/settings?tab=developer` };
    case 'routines':
      // Routines unified into the /automations hub — an old ?tab=routines
      // bookmark lands there instead of a now-removed settings tab.
      return { kind: 'redirect', to: `/s/${slug}/automations` };
    default:
      return null;
  }
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    tab?: string;
    integration?: string;
    reason?: string;
    toolkit?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Resolve legacy tab IDs first — anyone hitting an old bookmark gets routed
  // to the new home before any DB work runs.
  const legacy = resolveLegacyTab(sp.tab, slug);
  if (legacy?.kind === 'redirect') redirect(legacy.to);
  const activeTab: TabId = legacy?.kind === 'tab' ? legacy.id : 'workspace';

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: settingsUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();
  const isAccountOwner = settingsUser?.id === space.ownerId;
  const canManagePeople = settingsUser
    ? await userCanManageSpace(settingsUser.id, space.id)
    : false;
  const ownerIsPaid = settingsUser
    ? await ownerHasPaidWorkspace(space.ownerId, userId)
    : false;
  const canInvitePeople = canManagePeople && ownerIsPaid;

  let settings: SpaceSetting | null = null;
  try {
    const { data, error } = await supabase
      .from('SpaceSetting')
      .select('*')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (error) throw error;
    settings = (data as SpaceSetting) ?? null;
  } catch (err) {
    console.error('[settings] DB query failed', err);
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <h2 className="text-xl tracking-tight font-semibold text-foreground" style={TITLE_FONT}>
            I couldn&apos;t reach your settings.
          </h2>
          <p className={BODY_MUTED}>
            Usually temporary.
          </p>
          <a href={`/s/${slug}/settings`} className={PRIMARY_PILL}>
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Subscription status drives the narration line under the H1.
  const subStatus =
    (space as { stripeSubscriptionStatus?: string }).stripeSubscriptionStatus ?? 'inactive';
  const periodEnd = (space as { stripePeriodEnd?: string }).stripePeriodEnd;
  const isTrialing = subStatus === 'trialing';
  const isActive = subStatus === 'active';

  let narration: string;
  if (isTrialing && periodEnd) {
    const days = Math.max(
      0,
      Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    narration = `Trial ends in ${days} ${days === 1 ? 'day' : 'days'}.`;
  } else if (isActive && periodEnd) {
    const days = Math.max(
      0,
      Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    narration = `Subscription active. Next charge in ${days} ${days === 1 ? 'day' : 'days'}.`;
  } else if (subStatus === 'inactive') {
    narration = 'No active subscription yet.';
  } else {
    narration = 'Workspace settings.';
  }
  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? 'Workspace';
  const nextActionByTab: Record<TabId, string> = {
    workspace: 'Confirm the workspace identity, then invite people if this business is on a paid plan.',
    you: 'Make sure your public profile and AI personalization describe the same professional voice.',
    connections: 'Connect the account Chippi needs for the next real action you want it to complete.',
    memory: 'Remove anything stale so future work starts from current facts.',
    privacy: 'Review notification and legal settings before expanding automation.',
    developer: 'Check usage and revoke any key that no longer has a clear owner.',
  };

  return (
    <SupportingPage family="control" width="wide">
      <SupportingOrientation
        family="control"
        eyebrow={`Settings / ${activeTabLabel}`}
        title={<SplitReveal as="span" text="Your workspace control desk" />}
        summary={narration}
        nextAction={nextActionByTab[activeTab]}
        action={<SupportingActionLink href={`/s/${slug}/billing`}>{subStatus === 'inactive' ? 'Choose a plan' : 'Manage billing'}</SupportingActionLink>}
        layout="rail"
      />
      <SupportingMetricBand>
        <SupportingMetric label="Workspace" value={space.name} detail={`/${space.slug}`} />
        <SupportingMetric label="Current area" value={activeTabLabel} detail="open controls" accent />
        <SupportingMetric label="Billing" value={subStatus.replace('_', ' ')} detail={periodEnd ? `period ends ${new Date(periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'no billing date'} />
        <SupportingMetric label="Control groups" value={TABS.length} detail="organized by outcome" />
      </SupportingMetricBand>

      <SupportingWorkArea className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">

      {/* Tab nav — horizontal scroll on mobile, fits comfortably on desktop.
          Active tab uses the foreground underline rule from STYLESHEET;
          the rest stay muted. Paper-flat, no pill chrome. */}
      <nav
        className="relative border-b border-border/60 lg:sticky lg:top-8 lg:border-b-0"
        aria-label="Settings sections"
      >
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex items-center gap-1 overflow-x-auto -mb-px scrollbar-hide snap-x snap-proximity lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-visible"
        >
          {TABS.map((t) => {
            const isActiveTab = t.id === activeTab;
            return (
              <Link
                key={t.id}
                href={`/s/${slug}/settings?tab=${t.id}`}
                role="tab"
                aria-current={isActiveTab ? 'page' : undefined}
                aria-selected={isActiveTab}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-2.5 text-sm whitespace-nowrap snap-start',
                  'transition-colors duration-150 lg:rounded-xl',
                  isActiveTab
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0">

      {/* Workspace — space name, slug, and danger zone. Nothing else; this
          tab is identity, not configuration. */}
      {activeTab === 'workspace' && (
        <StaggerReveal className="space-y-12">
          {isAccountOwner && (
          <section className="space-y-5">
            <p className={SECTION_LABEL}>Workspace</p>
            <GeneralSettingsForm space={space} />
          </section>
          )}
          <section className="space-y-5 pt-10 border-t border-border/60">
            <p className={SECTION_LABEL}>People</p>
            <WorkspacePeopleSection slug={space.slug} canInvite={canInvitePeople} />
          </section>
          {isAccountOwner && (
          <section className="space-y-5 pt-10 border-t border-border/60">
            <p className={cn(SECTION_LABEL, 'text-destructive/80')}>Danger zone</p>
            <DangerZone space={space} />
          </section>
          )}
        </StaggerReveal>
      )}

      {/* You — profile photo, bio, AI personalization, chat model. Everything
          that shapes how Chippi sees the realtor and how the realtor shows
          up to leads. Memory has its own tab now. */}
      {activeTab === 'you' && (
        <StaggerReveal className="space-y-12">
          <section className="space-y-5">
            <p className={SECTION_LABEL}>Your profile</p>
            <p className={BODY_MUTED}>
              The face and voice your leads see on intake forms, tour pages,
              and packets.
            </p>
            <ProfileSection slug={space.slug} />
          </section>
          <section
            id="language"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Language</p>
            <p className={BODY_MUTED}>
              The language Chippi&apos;s public pages use for you.
            </p>
            <LanguageSection />
          </section>
          <section
            id="ai-profile"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>AI personalization</p>
            <p className={BODY_MUTED}>
              Tell Chippi about you so responses feel tailored, not generic.
            </p>
            <AIProfileForm slug={slug} spaceId={space.id} />
          </section>
        </StaggerReveal>
      )}

      {/* Connections — every place Chippi acts on the realtor's behalf.
          OAuth integrations and reusable templates live together because
          the realtor thinks of them as the same thing: "what Chippi sends
          through." MCP and API keys are developer-flavored and live in
          Developer instead. */}
      {activeTab === 'connections' && (
        <StaggerReveal className="space-y-12">
          <section id="integrations" className="space-y-5">
            <p className={SECTION_LABEL}>Connected apps</p>
            <p className={BODY_MUTED}>
              Gmail, Outlook, Slack, HubSpot, and the rest. Connect them so
              Chippi can act on your behalf through your own accounts.
            </p>
            <p className={BODY_MUTED}>
              Chippi uses your connected accounts to complete the actions you request and records each result.
            </p>
            <ConnectedAppsSection
              slug={slug}
              callbackResult={
                sp.integration === 'connected' || sp.integration === 'failed'
                  ? {
                      ok: sp.integration === 'connected',
                      reason: sp.reason ?? null,
                      toolkit: sp.toolkit ?? null,
                    }
                  : null
              }
            />
          </section>
          <section
            id="templates"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Message templates</p>
            <TemplatesSection />
          </section>
        </StaggerReveal>
      )}

      {/* Memory — what Chippi has learned about this workspace. Read-only
          here; the correction pattern is "delete the wrong fact and let
          Chippi re-learn it" — same logic as on the old /chippi/memory
          surface. The tab is a mount point; the list component owns the
          empty/loading/error states. */}
      {activeTab === 'memory' && (
        <StaggerReveal className="space-y-12">
          <section className="space-y-5">
            <p className={SECTION_LABEL}>Memory</p>
            <p className={BODY_MUTED}>
              What I&apos;m holding onto about you, your people, and your
              deals.
            </p>
            <MemoryList />
          </section>
        </StaggerReveal>
      )}

      {/* Privacy — notifications, legal URL, license, fair-housing notice.
          Everything compliance-flavored and everything that determines what
          reaches the realtor. */}
      {activeTab === 'privacy' && (
        <StaggerReveal className="space-y-12">
          <section id="brief" className="space-y-5">
            <p className={SECTION_LABEL}>Daily brief</p>
            <BriefSection slug={space.slug} />
          </section>
          <section
            id="notifications"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Notifications</p>
            <NotificationsSection slug={space.slug} />
          </section>
          <section
            id="legal"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Legal</p>
            <LegalSettingsForm
              slug={space.slug}
              privacyPolicyUrl={settings?.privacyPolicyUrl ?? ''}
            />
          </section>
          <section
            id="trust-signals"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Compliance &amp; trust signals</p>
            <p className={BODY_MUTED}>
              Optional. License number, Fair Housing notice, and Equal Housing
              mark — shown in your intake-form footer.
            </p>
            <IntakeTrustSignalsForm
              slug={space.slug}
              licenseNumber={settings?.intakeLicenseNumber ?? ''}
              fairHousingNotice={settings?.intakeFairHousingNotice ?? ''}
              showEqualHousingMark={settings?.intakeShowEqualHousingMark ?? false}
            />
          </section>
          <section
            id="tracking-pixels"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Tracking &amp; analytics</p>
            <p className={BODY_MUTED}>
              Optional. Add your own ad-platform pixels to the public intake form
              so you can measure and retarget the leads you send there.
            </p>
            <TrackingPixelsForm
              slug={space.slug}
              initialPixels={settings?.trackingPixels ?? null}
            />
          </section>
          <section
            id="your-data"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Your data</p>
            <p className={BODY_MUTED}>
              Take a copy of everything, or delete your account. Your data is
              yours.
            </p>
            <YourDataSection spaceName={space.name} />
          </section>
        </StaggerReveal>
      )}

      {/* Developer — MCP, API keys, and usage. Anything programmatic or
          cost-attribution flavored lives here so the realtor side stays
          calm. */}
      {activeTab === 'developer' && (
        <StaggerReveal className="space-y-12">
          <section id="mcp" className="space-y-5">
            <p className={SECTION_LABEL}>MCP &amp; API keys</p>
            <McpSection slug={space.slug} />
          </section>
          <section
            id="usage"
            className="space-y-5 pt-10 border-t border-border/60 scroll-mt-24"
          >
            <p className={SECTION_LABEL}>Usage</p>
            <UsageSection />
          </section>
        </StaggerReveal>
      )}
      </div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
