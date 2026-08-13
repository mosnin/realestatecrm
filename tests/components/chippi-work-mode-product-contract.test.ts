import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Chippi Chat/Work product contract', () => {
  const workspace = read('components/chippi/chippi-workspace.tsx');
  const prompt = read('components/ui/chippi-prompt-box.tsx');
  const taskRoute = read('app/api/ai/task/route.ts');
  const workTool = read('lib/ai-tools/tools/start-work-session.ts');

  it('renders one top-of-page Chat/Work selector in the existing workspace', () => {
    expect(workspace).toContain('<ChatWorkModeSwitch');
    expect(workspace).toContain('absolute left-1/2 top-1.5');
    expect(prompt).toContain("{item === 'chat' ? 'Chat' : 'Work'}");
    expect(prompt).not.toContain("{m === 'chat' ? 'Chat' : 'Agent'}");
    expect(prompt).not.toContain("const Icon = item === 'chat'");
    expect(prompt).not.toContain("active && item === 'work' && 'text-[#ff8a0a]'");
  });

  it('removes and locks the selector after the first user message', () => {
    expect(workspace).toContain('!conversationModeLocked');
    expect(workspace).toContain('modeLocked={conversationModeLocked}');
    expect(workspace).toContain(
      'onModeChange={conversationModeLocked ? undefined : selectChatMode}',
    );
    expect(prompt).toContain('!modeLocked || !skill.mode || skill.mode === chatMode');
  });

  it('has no work-session modal or modal slash-command path', () => {
    expect(workspace).not.toContain('WorkSessionDialog');
    expect(workspace).not.toContain('workDialogOpen');
    expect(prompt).not.toContain("action: 'work-session'");
    expect(prompt).not.toContain("slug: 'work'");
  });

  it('lets /goal seed the same conversation and switches it into Work', () => {
    expect(prompt).toContain("slug: 'goal'");
    expect(prompt).toContain("mode: 'work'");
    expect(prompt).toContain('skill.mode === chatMode');
  });

  it('keeps Work on the unified TS runtime and exposes durable work only there', () => {
    expect(taskRoute).toContain("body.mode === 'work' || body.mode === 'agent'");
    expect(taskRoute).toContain('workModeSelected ||');
    expect(workTool).toContain("name: 'start_work_session'");
    expect(workTool).toContain("autonomy: 'just_go'");
    expect(workTool).toContain('allowQuestions: true');
  });
});
