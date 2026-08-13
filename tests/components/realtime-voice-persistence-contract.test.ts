import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('persistent Chippi voice surface', () => {
  it('owns the one live session above conversation navigation', () => {
    const layout = read('app/s/[slug]/layout.tsx');
    const provider = read('components/chippi/persistent-chippi-voice.tsx');
    const workspace = read('components/chippi/chippi-workspace.tsx');

    expect(layout).toContain('<PersistentChippiVoice');
    expect(layout).toContain('enabled={!isBroker && realtimeVoiceGatewayReady()}');
    expect(provider).toContain('setSession((current) => current ??');
    expect(workspace).toContain('requestChippiVoice({ conversationId: activeConversationId })');
    expect(workspace).not.toContain('<RealtimeVoiceDialog');
  });

  it('minimizes without closing WebRTC and only End clears the session owner', () => {
    const provider = read('components/chippi/persistent-chippi-voice.tsx');
    const surface = read('components/chippi/realtime-voice-dialog.tsx');

    expect(provider).toContain('open\n      minimized={minimized}');
    expect(provider).toContain('onMinimize={() => setMinimized(true)}');
    expect(provider).toContain('if (open) return;');
    expect(provider).toContain('setSession(null)');
    expect(surface).toContain('aria-label="Minimize voice mode"');
    expect(surface).toContain('aria-label="End voice mode"');
    expect(surface).toContain('onClick={() => onOpenChange(false)}');
    expect(surface).toContain('open && minimized');
    expect(surface).toContain('open && !minimized');
  });

  it('uses orb-ui as a controlled, audio-reactive visual with reduced-motion fallback', () => {
    const surface = read('components/chippi/realtime-voice-dialog.tsx');

    expect(surface).toContain("import { Orb, type OrbState } from 'orb-ui'");
    expect(surface).toContain('state={orbState}');
    expect(surface).toContain('volume={orbVolume}');
    expect(surface).toContain('theme="cloud"');
    expect(surface).toContain('const reduceMotion = useReducedMotion() ?? false');
    expect(surface).toContain('reduceMotion ? (');
  });

  it('delivers grounded work and specialist results to the workspace when mounted', () => {
    const provider = read('components/chippi/persistent-chippi-voice.tsx');
    const workspace = read('components/chippi/chippi-workspace.tsx');

    expect(provider).toContain("type: 'delegated'");
    expect(provider).toContain("type: 'workspace_continued'");
    expect(provider).toContain("type: 'specialist_controlled'");
    expect(provider).toContain('pendingWorkspaceEvents');
    expect(workspace).toContain('subscribeToChippiVoiceWorkspaceEvents');
    expect(workspace).toContain('handleVoiceWorkspaceContinuation(event.work)');
    expect(workspace).toContain('handleVoiceSpecialistControlled(event.runId)');
  });

  it('repairs a launched specialist conversation card with the same durable call identity', () => {
    const surface = read('components/chippi/realtime-voice-dialog.tsx');

    expect(surface).toContain('if (data.conversationRecorded === false)');
    expect(surface).toContain('body: JSON.stringify(specialistRequest)');
    expect(surface).toContain('repaired.conversationId === durableConversationId');
    expect(surface).toContain('repaired.runId === durableRunId');
    expect(surface).toContain('conversation card is still being repaired');
  });
});
