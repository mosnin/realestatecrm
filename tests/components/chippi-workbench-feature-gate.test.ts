import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Transcript } from '@/components/ai/blocks/transcript';
import { visibleRightPanelTabs } from '@/components/chippi/right-panel-tabs';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

describe('Chippi Workbench feature gate', () => {
  it('keeps Workbench out of the customer tab bar while the flag is off', () => {
    expect(visibleRightPanelTabs('realtor', false).map((tab) => tab.id)).not.toContain('workbench');
    expect(visibleRightPanelTabs('broker', false).map((tab) => tab.id)).not.toContain('workbench');
  });

  it('adds Workbench for enabled variants without changing existing tabs', () => {
    expect(visibleRightPanelTabs('realtor', true).map((tab) => tab.id)).toContain('workbench');
    expect(visibleRightPanelTabs('broker', true).map((tab) => tab.id)).toContain('workbench');
    expect(visibleRightPanelTabs('broker', true).map((tab) => tab.id)).not.toContain('documents');
  });

  it('keeps disabled deep links and stale tool results from opening the split panel', () => {
    const workspace = fs.readFileSync(
      path.join(process.cwd(), 'components/chippi/chippi-workspace.tsx'),
      'utf8',
    );
    expect(workspace).toContain(
      "const workbenchEnabled = process.env.NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED === 'true'",
    );
    expect(workspace).toMatch(
      /const openWorkbenchArtifact = useCallback[\s\S]*?if \(!workbenchEnabled\) return;[\s\S]*?toggleSplit\(\)/,
    );
    expect(workspace).toMatch(
      /if \(!workbenchEnabled \|\| !workbenchUrlArtifactId\)[\s\S]*?setRightTab\('workbench'\)/,
    );
    expect(workspace.match(
      /onOpenWorkbench=\{workbenchEnabled \? openWorkbenchArtifact : undefined\}/g,
    )).toHaveLength(2);
  });

  it('does not render a historical Workbench card or inert open control without an enabled opener', () => {
    const blocks: MessageBlock[] = [{
      type: 'tool_call',
      callId: 'call-workbench-history',
      name: 'open_spreadsheet_in_workbench',
      args: { attachmentId: 'attachment-1' },
      status: 'complete',
      display: 'workbench',
      result: {
        ok: true,
        summary: 'Workbook ready.',
        data: { artifactId: 'artifact-1' },
      },
    }];

    // This repository preserves JSX for Next's compiler; the Node-only Vitest
    // renderer therefore needs the classic runtime available while it invokes
    // these client components.
    vi.stubGlobal('React', React);
    try {
      const disabledHtml = renderToStaticMarkup(createElement(Transcript, {
        blocks,
        role: 'assistant',
      }));
      expect(disabledHtml).not.toContain('Workbook ready');
      expect(disabledHtml).not.toContain('Open in Workbench');
      expect(disabledHtml).not.toMatch(/workbench/i);

      const enabledHtml = renderToStaticMarkup(createElement(Transcript, {
        blocks,
        role: 'assistant',
        onOpenWorkbench: () => {},
      }));
      expect(enabledHtml).toContain('Workbook ready');
      expect(enabledHtml).toContain('Open in Workbench');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Research Workspace feature gate', () => {
  it('keeps Research out until the explicit server entitlement is present', () => {
    expect(visibleRightPanelTabs('realtor', true, false).map((tab) => tab.id)).not.toContain('research');
    expect(visibleRightPanelTabs('broker', true, false).map((tab) => tab.id)).not.toContain('research');
  });

  it('adds Research only for an entitled workspace', () => {
    expect(visibleRightPanelTabs('realtor', true, true).map((tab) => tab.id)).toContain('research');
  });
});
