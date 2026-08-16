import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('Realtime voice product wiring', () => {
  it('exposes voice only from server-computed readiness and keeps broker chat unchanged', () => {
    const page = read('app/s/[slug]/chippi/page.tsx');
    const workspace = read('components/chippi/chippi-workspace.tsx');
    expect(page).toContain('realtimeVoiceEnabled={realtimeVoiceGatewayReady()}');
    expect(workspace).toContain('realtimeVoiceEnabled && !isBroker');
    expect(workspace).toContain('onVoiceStart=');
  });

  it('renders durable Work Sessions inline and suppresses duplicate strip cards', () => {
    const transcript = read('components/ai/blocks/transcript.tsx');
    const workspace = read('components/chippi/chippi-workspace.tsx');
    expect(transcript).toContain('<WorkSessionBlockView');
    expect(workspace).toContain('hiddenSessionIds={inlineWorkSessionIds}');
  });

  it('bridges the Realtime function result back into the same voice response', () => {
    const dialog = read('components/chippi/realtime-voice-dialog.tsx');
    expect(dialog).toContain('extractStartWorkSessionCalls(event)');
    expect(dialog).toContain("type: 'function_call_output'");
    expect(dialog).toContain("sendEvent({ type: 'response.create' })");
    expect(dialog).toContain("fetch('/api/ai/realtime-delegate'");
  });

  it('dedupes floor-manager calls, keeps run selection server-side, and refreshes the existing specialist card', () => {
    const dialog = read('components/chippi/realtime-voice-dialog.tsx');
    const controlStart = dialog.indexOf('const runSpecialistControl');
    const controlEnd = dialog.indexOf('const runSpecialistSpawn');
    expect(controlStart).toBeGreaterThan(-1);
    expect(controlEnd).toBeGreaterThan(controlStart);
    const controlBranch = dialog.slice(controlStart, controlEnd);
    const workspace = read('components/chippi/chippi-workspace.tsx');
    const card = read('components/ai/blocks/subagent-task-block-view.tsx');
    expect(dialog).toContain('extractSpecialistControlCalls(event)');
    expect(controlBranch).toContain('handledCallsRef.current.has(callId)');
    expect(controlBranch).toContain("action: event.name, slug, conversationId: activeConversationId, callId");
    expect(controlBranch).not.toContain("action: event.name, slug, conversationId: activeConversationId, callId, runId");
    expect(controlBranch).toContain('buildSpecialistControlVoiceOutput(event.name, data)');
    expect(controlBranch).not.toContain('runId: data.runId');
    expect(workspace).toContain("new CustomEvent('chippi:swarm-refresh'");
    expect(card).toContain("window.addEventListener('chippi:swarm-refresh'");
  });
});
