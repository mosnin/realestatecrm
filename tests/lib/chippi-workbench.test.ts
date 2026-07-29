import { describe, expect, it } from 'vitest';
import {
  DEMO_PIPELINE_ARTIFACT,
  nextWorkbookVersionNumber,
  reconcileWorkbookVersions,
  saveWorkbookVersion,
  snapshotRows,
  updateWorkbookCell,
} from '@/lib/chippi/workbench';

describe('Chippi Workbench versioning', () => {
  it('creates a new version without mutating the immutable source snapshot', () => {
    const artifact = DEMO_PIPELINE_ARTIFACT;
    const edits = updateWorkbookCell(artifact.sourceVersion.rows, 'morgan-price', 'target', '$895K');
    const version = saveWorkbookVersion({
      artifactId: artifact.id,
      sourceVersion: artifact.sourceVersion,
      rows: edits,
      columns: artifact.columns,
      now: new Date('2026-07-29T14:00:00.000Z'),
    });

    expect(version?.label).toBe('Version 2');
    expect(version?.receipt?.changedCells).toEqual([
      { rowId: 'morgan-price', column: 'target', before: '$860K', after: '$895K' },
    ]);
    expect(version?.rows.find((row) => row.id === 'morgan-price')?.target).toBe('$895K');
    expect(artifact.sourceVersion.rows.find((row) => row.id === 'morgan-price')?.target).toBe('$860K');
  });

  it('does not manufacture a version when the workbook is unchanged', () => {
    const artifact = DEMO_PIPELINE_ARTIFACT;
    expect(
      saveWorkbookVersion({
        artifactId: artifact.id,
        sourceVersion: artifact.sourceVersion,
        rows: snapshotRows(artifact.sourceVersion.rows),
        columns: artifact.columns,
        now: new Date('2026-07-29T14:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('keeps labels monotonic when a user saves from an older selected version', () => {
    const artifact = DEMO_PIPELINE_ARTIFACT;
    const existingVersions = [
      artifact.sourceVersion,
      { ...artifact.sourceVersion, id: 'northstar-pipeline-plan:v:1', label: 'Version 2', author: 'You' as const },
    ];
    const edits = updateWorkbookCell(artifact.sourceVersion.rows, 'avery-nguyen', 'stage', 'Qualified');
    const saved = saveWorkbookVersion({
      artifactId: artifact.id,
      sourceVersion: artifact.sourceVersion,
      rows: edits,
      columns: artifact.columns,
      now: new Date('2026-07-29T14:10:00.000Z'),
      versionNumber: nextWorkbookVersionNumber(existingVersions),
    });

    expect(saved?.label).toBe('Version 3');
  });

  it('keeps the canonical source authoritative over browser-stored versions', () => {
    const artifact = DEMO_PIPELINE_ARTIFACT;
    const forgedSource = {
      ...artifact.sourceVersion,
      rows: updateWorkbookCell(artifact.sourceVersion.rows, 'morgan-price', 'target', '$0'),
    };
    const versionTwo = {
      ...artifact.sourceVersion,
      id: 'northstar-pipeline-plan:v:2:1',
      label: 'Version 2',
      author: 'You' as const,
    };

    const restored = reconcileWorkbookVersions(artifact.sourceVersion, [
      forgedSource,
      versionTwo,
      versionTwo,
      { id: 'invalid' },
    ]);

    expect(restored).toHaveLength(2);
    expect(restored[0]).toBe(artifact.sourceVersion);
    expect(restored[0].rows.find((row) => row.id === 'morgan-price')?.target).toBe('$860K');
    expect(restored[1].id).toBe(versionTwo.id);
  });
});
