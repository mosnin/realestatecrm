import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Chippi BEUI and OpenUI integration', () => {
  it('keeps one stable assistant row for loading, activity, plans, and streaming text', () => {
    const workspace = read('components/chippi/chippi-workspace.tsx');

    expect(workspace).not.toContain('key="thinking-indicator"');
    expect(workspace).toContain('shouldShowInlineWorkActivity');
    expect(workspace).toContain('<ThinkingIndicator');
    expect(workspace).toContain('<Transcript');
    expect(workspace).not.toMatch(
      /msg\.role === 'assistant'[\s\S]{0,180}msg\.blocks\.length === 0[\s\S]{0,100}return null/,
    );
  });

  it('uses the adapted approval, tool-result, todo, and decision surfaces', () => {
    const permission = read('components/ai/blocks/permission-prompt-view.tsx');
    const toolCall = read('components/ai/blocks/tool-call-block-view.tsx');
    const sessions = read('components/chippi/work-sessions-strip.tsx');
    const question = read('components/ai/blocks/tool-results/question-flow-result.tsx');
    const options = read('components/ai/blocks/tool-results/option-list-result.tsx');

    expect(permission).toContain('<ToolApproval');
    expect(toolCall).toContain('<AgentToolResult');
    expect(toolCall).not.toContain('an-tool-call-row-shimmer');
    expect(sessions).toContain('<AgentTodoList');
    expect(sessions).toContain("step.status === 'running'");
    expect(question).toContain('<AgentApprovalCard');
    expect(options).toContain('<AgentApprovalCard');
  });

  it('keeps agent execution disclosures transparent and inline', () => {
    const activity = read('components/ai/agent-status/activity-disclosure.tsx');
    const approval = read('components/ai/agent-status/tool-approval.tsx');
    const result = read('components/ai/agent-status/tool-result.tsx');
    const plan = read('components/chippi/plan-card.tsx');
    const specialists = read('components/ai/blocks/subagent-task-block-view.tsx');

    for (const surface of [activity, approval, result, plan, specialists]) {
      expect(surface).toContain('data-agent-surface-style="inline"');
      expect(surface).toContain('bg-transparent');
    }
    expect(activity).not.toContain('bg-card');
    expect(approval).not.toContain('bg-card');
    expect(result).not.toContain('bg-muted/35');
    expect(plan).not.toContain('rounded-xl border border-border/70 bg-background');
    expect(specialists).not.toContain('rounded-xl border bg-muted/20');
  });

  it('renders generated media only from a persisted file identity', () => {
    const media = read('components/ai/blocks/tool-results/generated-image-result.tsx');
    const toolCall = read('components/ai/blocks/tool-call-block-view.tsx');
    const studio = read('agent/tools/studio.py');

    expect(media).toContain('/api/files/${encodeURIComponent(fileId)}');
    expect(media).toContain("status !== 'complete' || !fileId");
    expect(toolCall).toContain("block.display === 'generated-image'");
    expect(toolCall).toContain('<GeneratedImageResult');
    expect(studio).not.toContain('"url": data.get("url")');
  });

  it('keeps OpenUI read-only, explicit, and bounded instead of replacing the app shell', () => {
    const renderer = read('components/ai/openui/chippi-openui-renderer.tsx');
    const toolCall = read('components/ai/blocks/tool-call-block-view.tsx');
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['@openuidev/react-lang']).toBe('0.2.11');
    expect(packageJson.dependencies?.['@openuidev/react-ui']).toBeUndefined();
    expect(renderer).toContain('toolProvider={null}');
    expect(renderer).not.toContain('onAction=');
    expect(renderer).toContain('program.length > 12_000');
    expect(toolCall).toContain("block.display === 'openui'");
  });
});
