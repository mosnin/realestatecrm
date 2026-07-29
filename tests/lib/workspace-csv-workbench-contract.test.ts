import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('Workspace CSV Workbench product contract', () => {
  it('atomically and idempotently maps one completed tenant source to one workbook', () => {
    const sql = read('supabase/migrations/20260915000005_workspace_csv_workbench.sql');
    expect(sql).toContain('WorkspaceWorkbookSource');
    expect(sql).toContain('workspace_workbook_source_root_key');
    expect(sql).toContain('workspace_workbook_source_task_key');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("wrt.status = 'completed'");
    expect(sql).toContain("wr.status = 'completed'");
    expect(sql).toContain("wrtf.\"mimeType\" = 'text/csv'");
    expect(sql).toContain('RETURN QUERY SELECT v_artifact_id, v_version_id, v_version_number, false');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_workspace_workbook_artifact');
    expect(sql).toContain('TO service_role');
  });

  it('threads the existing Workbench opener into an explicitly gated CSV action', () => {
    const workspace = read('components/chippi/chippi-workspace.tsx');
    const rightPanel = read('components/chippi/right-panel.tsx');
    const runPanel = read('components/chippi/workspace-run-panel.tsx');
    expect(workspace).toContain('onOpenWorkbench={openWorkbenchArtifact}');
    expect(rightPanel).toContain('onOpenWorkbench={onOpenWorkbench}');
    expect(rightPanel).toContain('workbenchEnabled={workbenchEnabled}');
    expect(runPanel).toContain('followUpsEnabled && workbenchEnabled && Boolean(onOpenWorkbench)');
    expect(runPanel).toContain('Open in Workbench');
    expect(runPanel).toContain('disabled={Boolean(openingFileId)}');
    expect(runPanel).toContain('/workbench?slug=');
    expect(runPanel).toContain('&sourceKind=${sourceKind}');
    expect(runPanel).toContain('sourceKind="task"');
    expect(runPanel).toContain('sourceKind="root"');
  });

  it('uses truthful neutral source language for both attachment and workspace imports', () => {
    const workbench = read('components/chippi/live-workbench.tsx');
    expect(workbench).toContain('The imported source remains unchanged.');
    expect(workbench).not.toContain('The source attachment remains unchanged.');
  });
});
