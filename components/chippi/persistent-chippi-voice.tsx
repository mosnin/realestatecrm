'use client';

import { useEffect, useState } from 'react';
import {
  RealtimeVoiceDialog,
  type DelegatedWork,
} from '@/components/chippi/realtime-voice-dialog';

const VOICE_REQUEST_EVENT = 'chippi:voice-request';
const VOICE_WORKSPACE_EVENT = 'chippi:voice-workspace-event';
let workspaceListenerCount = 0;
let pendingWorkspaceEvents: ChippiVoiceWorkspaceEvent[] = [];

export interface VoiceWorkspaceContinuation {
  conversationId: string;
  callId: string;
  instruction: string;
  runId: string;
  taskId: string;
  status: string;
}

export type ChippiVoiceWorkspaceEvent =
  | { type: 'delegated'; work: DelegatedWork }
  | { type: 'workspace_continued'; work: VoiceWorkspaceContinuation }
  | { type: 'specialist_spawned'; work: { conversationId: string; runId: string; callId: string; goal: string; status: string } }
  | { type: 'specialist_controlled'; runId: string };

interface VoiceRequest {
  conversationId: string | null;
}

/**
 * Opens the single route-level voice session. If voice is already connected,
 * this only restores its expanded surface; it never starts a second peer.
 */
export function requestChippiVoice(request: VoiceRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VoiceRequest>(VOICE_REQUEST_EVENT, { detail: request }));
}

/**
 * Workspace callbacks are intentionally typed and one-way. The voice shell
 * owns transport lifetime while the mounted Chippi workspace owns local UI
 * hydration for server-persisted work and specialist results.
 */
export function subscribeToChippiVoiceWorkspaceEvents(
  listener: (event: ChippiVoiceWorkspaceEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => {
    listener((event as CustomEvent<ChippiVoiceWorkspaceEvent>).detail);
  };
  window.addEventListener(VOICE_WORKSPACE_EVENT, handle);
  workspaceListenerCount += 1;
  if (pendingWorkspaceEvents.length > 0) {
    const pending = pendingWorkspaceEvents;
    pendingWorkspaceEvents = [];
    for (const event of pending) listener(event);
  }
  return () => {
    window.removeEventListener(VOICE_WORKSPACE_EVENT, handle);
    workspaceListenerCount = Math.max(0, workspaceListenerCount - 1);
  };
}

function publishWorkspaceEvent(event: ChippiVoiceWorkspaceEvent): void {
  if (workspaceListenerCount > 0) {
    window.dispatchEvent(
      new CustomEvent<ChippiVoiceWorkspaceEvent>(VOICE_WORKSPACE_EVENT, { detail: event }),
    );
    return;
  }
  pendingWorkspaceEvents = [...pendingWorkspaceEvents.slice(-11), event];
}

/**
 * Lives in /s/[slug]/layout so WebRTC survives conversation switches and
 * navigation between pages in the same workspace. Browser close/reload still
 * ends the session, which is intentional and never represented as OS-level
 * background audio.
 */
export function PersistentChippiVoice({
  slug,
  enabled,
}: {
  slug: string;
  enabled: boolean;
}) {
  const [session, setSession] = useState<{ conversationId: string | null } | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      if (!enabled) return;
      const request = (event as CustomEvent<VoiceRequest>).detail;
      setSession((current) => current ?? { conversationId: request.conversationId ?? null });
      setMinimized(false);
    };
    window.addEventListener(VOICE_REQUEST_EVENT, handleRequest);
    return () => {
      window.removeEventListener(VOICE_REQUEST_EVENT, handleRequest);
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) return;
    setSession(null);
    setMinimized(false);
  }, [enabled]);

  if (!session) return null;

  return (
    <RealtimeVoiceDialog
      slug={slug}
      conversationId={session.conversationId}
      open
      minimized={minimized}
      onMinimize={() => setMinimized(true)}
      onExpand={() => setMinimized(false)}
      onOpenChange={(open) => {
        if (open) return;
        setSession(null);
        setMinimized(false);
      }}
      onDelegated={(work) => publishWorkspaceEvent({ type: 'delegated', work })}
      onWorkspaceContinued={(work) =>
        publishWorkspaceEvent({ type: 'workspace_continued', work })
      }
      onSpecialistSpawned={(work) =>
        publishWorkspaceEvent({ type: 'specialist_spawned', work })
      }
      onSpecialistControlled={(runId) =>
        publishWorkspaceEvent({ type: 'specialist_controlled', runId })
      }
    />
  );
}
