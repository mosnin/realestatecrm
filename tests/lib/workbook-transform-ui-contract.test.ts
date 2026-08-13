import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('workbook transformation result contract', () => {
  it('returns only a server-sanitized transform receipt and renders it in Workbench', () => {
    const route = source('app/api/agent/artifacts/[artifactId]/route.ts');
    expect(route).toContain('parseWorkbookTransformReceipt');
    expect(route).toContain('versionWithSafeReceipt');
    expect(route).toContain('const { metadata, ...rest } = version');
    expect(route).toContain('transformReceipt');
    expect(route).toContain("version.createdByAgent === 'chippi_transform'");
    expect(route).toContain(".select('id, versionNumber, createdAt, createdByAgent')");
    const workbench = source('components/chippi/live-workbench.tsx');
    expect(workbench).toContain('describeTransformationOperation');
    expect(workbench).toContain('sourceVersionNumber');
    expect(workbench).toContain('duplicate rows removed');
  });

  it('opens a completed agent transformation in the existing Workbench panel', () => {
    const workspace = source('components/chippi/chippi-workspace.tsx');
    expect(workspace).toContain("name !== 'apply_workbook_transformation'");
    expect(workspace).toContain('workbenchRefreshVersion');
    expect(workspace).toContain('openWorkbenchArtifact(artifactId,');
    expect(workspace).toContain('activeWorkbookArtifactId: workbenchArtifactId');
    const route = source('app/api/ai/task/route.ts');
    expect(route).toContain('resolveActiveWorkbookContext');
    expect(route).toContain('workbookTransformRequested');
    expect(route).toContain('requiresTsWorkbenchTool = workbenchRequested || workbookTransformRequested');
    const activeLookup = route.indexOf('resolveActiveWorkbookContext(body.activeWorkbookArtifactId');
    const billingGate = route.indexOf("await assertCanSpend(ctx.space.id, 'chat_turn')");
    expect(activeLookup).toBeGreaterThan(billingGate);
    expect(route).toContain('if (requestedWorkbookTransform)');
  });

  it('makes workbook approval exact rather than editable or reusable', () => {
    const prompt = source('components/ai/blocks/permission-prompt-view.tsx');
    expect(prompt).toContain("requiresExactApproval = prompt.name === 'apply_workbook_transformation'");
    expect(prompt).toContain('onAlwaysAllow && !requiresExactApproval');
    const resume = source('app/api/ai/task/resume/[pausedRunId]/route.ts');
    expect(resume).toContain('Exact workbook approvals cannot be edited.');
    expect(resume).toContain('activeWorkbookContext');
    expect(resume).toContain('restoreApprovedWorkbookContext');
    expect(resume).toContain('args.artifactId !== persisted.artifactId');
    expect(resume).toContain('ctx.activeWorkbook = activeWorkbook');
  });

  it('persists active workbook authority only for a Workbench pause and adds it additively', () => {
    const stream = source('lib/ai-tools/sdk-chat-stream.ts');
    expect(stream).toContain('pausedRunActiveWorkbookFields');
    expect(stream).toContain('Object.assign(pausedRun, pausedRunActiveWorkbookFields(input.ctx))');
    const migration = source('supabase/migrations/20260912000000_paused_workbook_context.sql');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "activeWorkbookContext" jsonb');
  });
});
