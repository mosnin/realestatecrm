import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('open spreadsheet in workbench contract', () => {
  it('uses Attachment id + tenant scope and persists a hash-scoped workbook version', () => {
    const tool = source('lib/ai-tools/tools/open-spreadsheet-in-workbench.ts');
    expect(tool).toContain("name: 'open_spreadsheet_in_workbench'");
    expect(tool).toContain(".from('Attachment')");
    expect(tool).toContain(".eq('spaceId', ctx.space.id)");
    expect(tool).toContain("rpc('create_workbook_artifact'");
    expect(tool).toContain('p_content_hash: workbookContentHash(content)');
    expect(tool).toContain("display: 'workbench'");
  });

  it('passes the real attachment manifest to the TypeScript agent and opens the actual panel result', () => {
    expect(source('app/api/ai/task/route.ts')).toContain('attachmentManifest: hydratedAttachments.map');
    expect(source('app/api/ai/task/route.ts')).toContain('const workbenchRequested =');
    expect(source('components/chippi/chippi-workspace.tsx')).toContain("name !== 'open_spreadsheet_in_workbench'");
    expect(source('components/chippi/chippi-workspace.tsx')).toContain("setRightTab('workbench')");
  });

  it('keeps saves/reopen and narrow-screen behavior honest', () => {
    const workbench = source('components/chippi/live-workbench.tsx');
    expect(workbench).toContain("saveState === 'saving'");
    expect(workbench).toContain('Couldn’t save this version');
    expect(workbench).toContain('Swipe the table horizontally');
    expect(source('components/chippi/chippi-workspace.tsx')).toContain("searchParams.get('workbenchArtifact')");
    expect(source('components/ai/blocks/tool-call-block-view.tsx')).toContain('Open in Workbench');
    expect(source('app/api/agent/artifacts/[artifactId]/route.ts')).toContain("createdByAgent: artifact.artifactType === 'workbook' ? 'user' : 'chippi'");
  });
});
