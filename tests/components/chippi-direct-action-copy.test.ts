import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Chippi direct-action product copy', () => {
  const workspace = read('components/chippi/chippi-workspace.tsx');
  const toolCallBlock = read('components/ai/blocks/tool-call-block-view.tsx');
  const permissionPrompt = read('components/ai/blocks/permission-prompt-view.tsx');
  const marketing = read('components/marketing/giga/agent-canvas.tsx');
  const integrations = read('app/s/[slug]/chippi/integrations/page.tsx');
  const automationIntro = read('components/workflows/automations-intro.tsx');
  const workSessions = read('components/chippi/work-sessions-strip.tsx');
  const taskDetail = read('app/s/[slug]/chippi/tasks/[taskId]/page.tsx');
  const taskList = read('app/s/[slug]/chippi/tasks/page.tsx');
  const inbox = read('app/s/[slug]/chippi/inbox/page.tsx');
  const brief = read('components/chippi/brief-dashboard.tsx');
  const agentSettings = read('components/agent/agent-settings-panel.tsx');
  const realtorMarketing = read('app/(marketing)/realtors/page.tsx');
  const dealsMarketing = read('app/(marketing)/deals/page.tsx');
  const subscribe = read('app/subscribe/page.tsx');
  const onboarding = read('components/onboarding/onboarding-realtor-v2.tsx');
  const marketingNav = read('components/ui/3d-interactive-navbar.tsx');

  it('describes real sends and CRM execution instead of a draft-only agent', () => {
    expect(marketing).toContain("title: 'Acts when you ask'");
    expect(marketing).toContain('Sends messages and completes CRM work');
    expect(integrations).toContain('I use them to complete the actions you request.');

    for (const source of [marketing, integrations]) {
      expect(source).not.toMatch(/never sends|never send without/i);
    }
  });

  it('names in-flight send tools as sends while preserving explicit draft tools', () => {
    expect(toolCallBlock).toContain("send_email: 'Sending email…'");
    expect(toolCallBlock).toContain("send_sms: 'Sending text…'");
    expect(toolCallBlock).toContain("draft_email: 'Drafting…'");
    expect(toolCallBlock).toContain("draft_sms: 'Writing…'");
  });

  it('keeps Review checkpoints visible while autonomous Work stays direct', () => {
    expect(workspace).toContain('const pendingConfirmation = pendingApproval;');
    expect(workspace).toContain("(chatMode === 'work' && workExecutionMode === 'review')) && (");
    expect(workspace).toContain('isTail && pendingConfirmation');
    expect(workspace).toContain('busy: approvalBusy');
    expect(workspace).toContain('disabled={rateLimitSeconds > 0}');
  });

  it('uses confirmation language in Chat without claiming sends are only drafts', () => {
    expect(permissionPrompt).toContain('permissionPromptTitle(prompt.name, prompt.summary)');
    expect(permissionPrompt).toContain("isSendTool ? 'Allow and send'");
    expect(permissionPrompt).not.toMatch(/draft: review and send|approve before running/i);
  });

  it('presents explicit Draft mode as a choice, not the agent-wide fallback', () => {
    expect(automationIntro).toContain("short_description: 'Choose draft or automatic'");
    expect(automationIntro).toContain('Choose Draft mode only when you want a compose-and-review step.');
    expect(automationIntro).not.toContain("short_description: 'Draft-first by default'");
  });

  it('quarantines legacy Work approval waits instead of offering human review', () => {
    expect(workSessions).toContain("const ACTIVE = new Set(['planning', 'awaiting_input', 'running'])");
    expect(workSessions).toContain("awaiting_approval: 'Stopped — not executed'");
    expect(workSessions).toContain('This legacy run stopped before executing.');
    expect(workSessions).not.toContain("act('approve')");
    expect(workSessions).not.toContain('Approve plan');
    expect(taskDetail).toContain(
      'Paused — required information or access is missing. No action was executed.',
    );
    expect(taskDetail).not.toContain('waiting on your approval');
    expect(taskList).not.toContain('Pending approvals');
    expect(inbox).not.toContain(".from('AgentTask')");
    expect(inbox).not.toContain('ApprovalActions');
  });

  it('removes draft review as a default dashboard obligation', () => {
    expect(brief).not.toContain("'Draft ready', 'Drafts ready'");
    expect(brief).not.toContain("sub: 'approve or edit'");
    expect(brief).not.toContain('n: needsYou.pendingDrafts');
    expect(agentSettings).not.toContain('drafts awaiting review');
    expect(agentSettings).not.toContain('/api/agent/drafts?status=pending');
  });

  it('makes public product promises match direct execution', () => {
    expect(realtorMarketing).toContain('Chippi executes what you ask. Every result lands in the log.');
    expect(realtorMarketing).not.toContain('Chippi drafts and proposes. You approve.');
    expect(dealsMarketing).toContain('Chippi sent the reply you requested.');
    expect(dealsMarketing).not.toContain('You approved the draft and it sent.');
    expect(subscribe).toContain('I send the follow-ups you ask for and log every result.');
    expect(subscribe).not.toContain('I draft every follow-up. You approve.');
    expect(onboarding).toContain(
      'when you ask me to act, I use your connected tools and show you exactly what happened.',
    );
    expect(onboarding).not.toContain('I draft, you approve. Nothing leaves');
    expect(marketingNav).toContain('every action carries your identity and a result receipt.');
  });
});
