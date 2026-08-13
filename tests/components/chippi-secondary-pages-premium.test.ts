import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const inboxPage = read('app/s/[slug]/chippi/inbox/page.tsx');
const activityPage = read('app/s/[slug]/chippi/activity/page.tsx');
const integrationsPage = read('app/s/[slug]/chippi/integrations/page.tsx');
const triggersPage = read('app/s/[slug]/chippi/triggers/page.tsx');
const tasksPage = read('app/s/[slug]/chippi/tasks/page.tsx');
const taskDetailPage = read('app/s/[slug]/chippi/tasks/[taskId]/page.tsx');
const logPage = read('app/s/[slug]/chippi/log/page.tsx');
const unifiedActivity = read('components/chippi/unified-activity-feed.tsx');
const triggerActivity = read('components/triggers/activity-feed.tsx');
const pluginsSkills = read('components/chippi/plugins-skills-manager.tsx');
const postTour = read('components/chippi/post-tour-recorder.tsx');

describe('premium Chippi secondary pages', () => {
  it('uses the warm dashboard canvas only for configuration and the focused recorder', () => {
    expect(integrationsPage).toContain('layout="dashboard"');
    expect(integrationsPage).toContain('DASHBOARD_SURFACE');
    expect(integrationsPage).toContain('data-chippi-secondary-page="integrations"');

    expect(logPage).toContain('layout="dashboard"');
    expect(logPage).toContain('data-chippi-secondary-page="tour-log"');
    expect(postTour).toContain('DASHBOARD_SURFACE');
    expect(postTour).toContain('data-chippi-recorder="post-tour"');

    for (const source of [inboxPage, activityPage, triggersPage, tasksPage, taskDetailPage]) {
      expect(source).not.toContain('layout="dashboard"');
    }
  });

  it('keeps activity and task history as flat, hairline-divided row lists', () => {
    expect(unifiedActivity).toContain('data-secondary-list="unified-activity"');
    expect(unifiedActivity).toContain('divide-y divide-border/60');
    expect(triggerActivity).toContain('data-secondary-list="connected-app-activity"');
    expect(triggerActivity).toContain('divide-y divide-border/60');
    expect(tasksPage).toContain('<ul className="divide-y divide-border/60">');
    expect(taskDetailPage).toContain('<ul className="divide-y divide-border/60">');

    for (const source of [tasksPage, taskDetailPage, unifiedActivity, triggerActivity]) {
      expect(source).not.toContain('grid-cols');
    }
  });

  it('removes decorative category icons and non-semantic status colors', () => {
    expect(unifiedActivity).not.toContain('STATUS_ICON');
    expect(unifiedActivity).not.toContain('TONE_PILL');
    expect(triggerActivity).not.toContain('EventIcon');
    expect(taskDetailPage).not.toContain("from 'lucide-react'");
    expect(pluginsSkills).not.toMatch(/\b(?:Puzzle|SlashSquare|Plus)\b/);

    for (const source of [tasksPage, taskDetailPage, unifiedActivity, triggerActivity]) {
      expect(source).not.toMatch(/(?:bg|text)-(?:blue|green|emerald|amber|orange|violet)-/);
    }
  });

  it('preserves the existing data, navigation, and execution contracts', () => {
    expect(inboxPage).toContain('<AgentDraftInbox slug={slug} />');
    expect(inboxPage).not.toContain(".from('AgentTask')");

    expect(integrationsPage).toContain('<ConnectedAppsSection slug={slug} callbackResult={callbackResult} />');
    expect(integrationsPage).toContain('<PluginsSkillsManager slug={slug} />');
    expect(unifiedActivity).toContain('fetch(`/api/chippi/activity?${buildParams()}`)');
    expect(triggerActivity).toContain('<ActivityLive spaceId={spaceId} onEvent={handleLiveEvent} />');
    expect(triggerActivity).toContain("fetch(`/api/integrations/${connectionId}`");

    expect(postTour).toContain("fetch('/api/chippi/post-tour/execute'");
    expect(postTour).toContain('proposals: checked.map((p) => ({ tool: p.tool, args: p.args }))');
    expect(postTour).toContain('Approve selected');
    expect(postTour).toContain('type="checkbox"');
    expect(taskDetailPage).toContain(
      'Paused — required information or access is missing. No action was executed.',
    );
    expect(taskDetailPage).not.toContain('waiting on your approval');
  });
});
