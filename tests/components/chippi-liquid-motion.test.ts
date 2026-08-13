import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const prompt = read('components/ui/chippi-prompt-box.tsx');
const voice = read('components/chippi/realtime-voice-dialog.tsx');
const globals = read('app/globals.css');

describe('restrained Chippi liquid state motion', () => {
  it('keeps the Chat/Work selector semantic, icon-free, and backed by one calm move item', () => {
    expect(prompt).toContain('aria-label="Conversation mode"');
    expect(prompt).toContain('<ToggleGroup');
    expect(prompt).toContain('type="single"');
    expect(prompt).toContain('<ToggleGroupItem');
    expect(prompt).toContain('value={item}');
    expect(prompt).toContain('onValueChange={(nextMode) =>');
    expect(prompt).toContain("nextMode === 'chat' || nextMode === 'work'");
    expect(prompt).toContain("{item === 'chat' ? 'Chat' : 'Work'}");
    expect(prompt).toContain('effect="move"');
    expect(prompt).toContain('springiness: 0.82, wobble: 0.12, stretch: 0.18, trail: 0.16');
    expect(prompt).toContain('data-mode={mode}');
    expect(prompt).toContain('chippi-mode-liquid-surface');
    expect(prompt.match(/effect="move"/g)).toHaveLength(1);
    expect(prompt).toContain('aria-hidden="true"');
    expect(prompt).toContain('pointer-events-none');
    const switchSource = prompt.slice(
      prompt.indexOf('export function ChatWorkModeSwitch'),
      prompt.indexOf('/**\n * Chat vs Work'),
    );
    expect(switchSource).not.toContain('transition-all');
  });

  it('uses one stable paper-flat morph item for the accessible voice state label', () => {
    expect(voice).toContain('aria-live="polite"');
    expect(voice).toContain('aria-atomic="true"');
    expect(voice).toContain("import { Badge } from '@/components/ui/badge'");
    expect(voice).toContain('variant="ghost"');
    expect(voice).toContain('transition-none');
    expect(voice).toContain('effect="morph"');
    expect(voice).toContain('shape: true, speed: 1.8, bounce: 0.08, contentBlur: 1.25');
    expect(voice).not.toContain('transition="smooth"');
    expect(voice.match(/effect="morph"/g)).toHaveLength(1);
    expect(voice).not.toContain('key={voiceState}');
    expect(voice).not.toMatch(/shadow=.*(?:neon|glow)/i);
  });

  it('snaps liquid travel and preserves color-only feedback under reduced motion', () => {
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globals).toContain('.chippi-mode-liquid > svg');
    expect(globals).toContain(".chippi-mode-liquid[data-mode='work'] .chippi-mode-liquid-surface");
    expect(globals).toContain('transform: translateX(4rem)');
    expect(globals).toContain('transition: none !important');
    expect(globals).toContain('transition: color 200ms ease !important');
  });

  it('does not spread liquid-gooey into dashboards, transcript rows, or ordinary cards', () => {
    for (const file of [
      'components/chippi/brief-dashboard.tsx',
      'components/chippi/chippi-workspace.tsx',
      'components/ai/blocks/transcript.tsx',
      'components/ui/surface-card.tsx',
    ]) {
      expect(read(file), file).not.toContain('liquid-gooey');
    }
  });
});
