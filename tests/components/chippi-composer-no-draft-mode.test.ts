import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composerSource = readFileSync(
  resolve(process.cwd(), 'components/ui/chippi-prompt-box.tsx'),
  'utf8',
);

const automationsIntroSource = readFileSync(
  resolve(process.cwd(), 'components/workflows/automations-intro.tsx'),
  'utf8',
);

const draftToolsSource = readFileSync(
  resolve(process.cwd(), 'agent/tools/drafts.py'),
  'utf8',
);

describe('Chippi composer modes', () => {
  it('does not expose or encode the removed Draft mode', () => {
    expect(composerSource).not.toContain("type Mode = 'draft'");
    expect(composerSource).not.toContain('MODE_META');
    expect(composerSource).not.toContain('Draft mode');
    expect(composerSource).not.toContain('[Draft:');
  });

  it('keeps Realtime Voice Delegation wired into the composer', () => {
    expect(composerSource).toContain('onVoiceStart');
    expect(composerSource).toContain('aria-label="Start voice mode"');
    expect(composerSource).toContain('Voice mode');
  });

  it('describes workflow approvals without a Draft mode label', () => {
    expect(automationsIntroSource).not.toContain('Draft mode');
    expect(automationsIntroSource).toContain('Approval-first by default');
    expect(automationsIntroSource).toContain('wait for your approval');
    expect(draftToolsSource.toLowerCase()).not.toContain('draft mode');
    expect(draftToolsSource).toContain('save the message for approval instead');
  });
});
