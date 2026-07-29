'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildSpecialistControlVoiceOutput,
  extractContinueWorkspaceRunCalls,
  extractSpecialistControlCalls,
  extractStartWorkSessionCalls,
  type SpecialistControlBrowserResult,
} from '@/lib/realtime/client-events';

type VoiceState =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'delegating'
  | 'error';

export interface DelegatedWork {
  conversationId: string;
  sessionId: string;
  goal: string;
}

interface RealtimeEvent {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
  response?: {
    output?: Array<{
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };
}

function stateLabel(state: VoiceState): string {
  switch (state) {
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking';
    case 'delegating':
      return 'Starting the work…';
    case 'error':
      return 'Voice mode stopped';
  }
}

export function RealtimeVoiceDialog({
  slug,
  conversationId,
  open,
  onOpenChange,
  onDelegated,
  onWorkspaceContinued,
  onSpecialistControlled,
}: {
  slug: string;
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelegated: (work: DelegatedWork) => void;
  onWorkspaceContinued: (work: { conversationId: string; callId: string; instruction: string; runId: string; taskId: string; status: string }) => void;
  onSpecialistControlled?: (runId: string) => void;
}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('connecting');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handledCallsRef = useRef<Set<string>>(new Set());
  const sessionConversationIdRef = useRef<string | null>(conversationId);
  const delegatedRef = useRef(onDelegated);
  delegatedRef.current = onDelegated;
  const workspaceContinuedRef = useRef(onWorkspaceContinued);
  workspaceContinuedRef.current = onWorkspaceContinued;
  const specialistControlledRef = useRef(onSpecialistControlled);
  specialistControlledRef.current = onSpecialistControlled;

  const stop = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    for (const track of mediaRef.current?.getTracks() ?? []) track.stop();
    mediaRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
  }, []);

  const runDelegation = useCallback(
    async (event: RealtimeEvent) => {
      const callId = event.call_id?.trim();
      if (!callId || handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);

      let args: {
        goal?: unknown;
        autonomy?: unknown;
        allow_questions?: unknown;
      };
      try {
        args = JSON.parse(event.arguments ?? '{}') as typeof args;
      } catch {
        args = {};
      }
      const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
      if (goal.length < 10) {
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ ok: false, error: 'The goal needs more detail.' }),
          },
        });
        sendEvent({ type: 'response.create' });
        return;
      }

      setVoiceState('delegating');
      setCaption(goal);
      try {
        const res = await fetch('/api/ai/realtime-delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            conversationId: sessionConversationIdRef.current,
            callId,
            goal,
            autonomy: args.autonomy === 'just_go' ? 'just_go' : 'plan_first',
            allowQuestions: args.allow_questions !== false,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          conversationId?: string;
          session?: { id?: string };
        };
        if (!res.ok || !data.ok || !data.conversationId || !data.session?.id) {
          throw new Error(data.error || 'The work session could not be started.');
        }
        delegatedRef.current({
          conversationId: data.conversationId,
          sessionId: data.session.id,
          goal,
        });
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({
              ok: true,
              conversationId: data.conversationId,
              sessionId: data.session.id,
              status: 'planning',
            }),
          },
        });
        sendEvent({ type: 'response.create' });
        setVoiceState('thinking');
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The work session could not be started.';
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ ok: false, error: message }),
          },
        });
        sendEvent({ type: 'response.create' });
        setVoiceState('listening');
        setError(message);
      }
    },
    [sendEvent, slug],
  );

  const runWorkspaceContinuation = useCallback(
    async (event: RealtimeEvent) => {
      const callId = event.call_id?.trim();
      const activeConversationId = sessionConversationIdRef.current;
      if (!callId || !activeConversationId || handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);
      let args: { instruction?: unknown };
      try { args = JSON.parse(event.arguments ?? '{}') as typeof args; } catch { args = {}; }
      const instruction = typeof args.instruction === 'string' ? args.instruction.trim() : '';
      if (instruction.length < 3) {
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: 'Describe what to continue in a few words.' }) } });
        sendEvent({ type: 'response.create' });
        return;
      }
      setVoiceState('delegating');
      setCaption(instruction);
      try {
        const res = await fetch('/api/ai/realtime-delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'continue_workspace_run', slug, conversationId: activeConversationId, callId, instruction }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; workspaceRunId?: string; taskId?: string; status?: string; conversationRecorded?: boolean };
        if (!res.ok || !data.ok || !data.workspaceRunId || !data.taskId || !data.status) throw new Error(data.error || 'The Workspace continuation could not be started.');
        workspaceContinuedRef.current({ conversationId: activeConversationId, callId, instruction, runId: data.workspaceRunId, taskId: data.taskId, status: data.status });
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: true, workspaceRunId: data.workspaceRunId, taskId: data.taskId, status: data.status, openWorkspacePanel: true, conversationRecorded: data.conversationRecorded !== false }) } });
        sendEvent({ type: 'response.create' });
        setVoiceState('thinking');
        if (data.conversationRecorded === false) {
          setError('Workspace started, but this voice confirmation may not appear after a reload. Please retry the request to repair it.');
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The Workspace continuation could not be started.';
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: message }) } });
        sendEvent({ type: 'response.create' });
        setVoiceState('listening');
        setError(message);
      }
    },
    [sendEvent, slug],
  );

  const runSpecialistControl = useCallback(
    async (event: RealtimeEvent & { name: 'get_specialist_status' | 'cancel_specialist_task' }) => {
      const callId = event.call_id?.trim();
      const activeConversationId = sessionConversationIdRef.current;
      if (!callId || !activeConversationId || handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);
      let args: unknown;
      try { args = JSON.parse(event.arguments ?? '{}'); } catch { args = null; }
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0) {
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: 'This voice control does not accept task identifiers.' }) } });
        sendEvent({ type: 'response.create' });
        return;
      }
      setVoiceState('thinking');
      setCaption(event.name === 'get_specialist_status' ? 'Checking specialist progress…' : 'Stopping the current specialist task…');
      try {
        const res = await fetch('/api/ai/realtime-delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: event.name, slug, conversationId: activeConversationId, callId }),
        });
        const data = (await res.json().catch(() => ({}))) as SpecialistControlBrowserResult & {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || 'The specialist control could not be completed.');
        if (event.name === 'cancel_specialist_task' && typeof data.runId === 'string') {
          specialistControlledRef.current?.(data.runId);
        }
        const voiceOutput = buildSpecialistControlVoiceOutput(event.name, data);
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(voiceOutput) } });
        sendEvent({ type: 'response.create' });
        setVoiceState('thinking');
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The specialist control could not be completed.';
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: message }) } });
        sendEvent({ type: 'response.create' });
        setVoiceState('listening');
        setError(message);
      }
    },
    [sendEvent, slug],
  );

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    let cancelled = false;
    setVoiceState('connecting');
    setCaption('');
    setError('');
    handledCallsRef.current.clear();
    sessionConversationIdRef.current = conversationId;

    void (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        mediaRef.current = media;

        const peer = new RTCPeerConnection();
        peerRef.current = peer;
        for (const track of media.getTracks()) peer.addTrack(track, media);

        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audioRef.current = audio;
        peer.ontrack = (trackEvent) => {
          audio.srcObject = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
          void audio.play().catch(() => {});
        };

        const channel = peer.createDataChannel('oai-events');
        channelRef.current = channel;
        channel.onopen = () => !cancelled && setVoiceState('listening');
        channel.onmessage = (message) => {
          let event: RealtimeEvent;
          try {
            event = JSON.parse(String(message.data)) as RealtimeEvent;
          } catch {
            return;
          }
          if (event.type === 'input_audio_buffer.speech_started') setVoiceState('listening');
          if (event.type === 'input_audio_buffer.speech_stopped') setVoiceState('thinking');
          if (event.type === 'response.created') setVoiceState('thinking');
          if (event.type === 'response.output_audio.delta') setVoiceState('speaking');
          if (event.type === 'response.done') {
            setVoiceState('listening');
          }
          if (
            event.type === 'response.output_audio_transcript.delta' ||
            event.type === 'response.audio_transcript.delta'
          ) {
            if (typeof event.delta === 'string') {
              setCaption((current) => `${current}${event.delta}`.slice(-360));
            }
          }
          for (const call of extractStartWorkSessionCalls(event)) {
            void runDelegation({
              type: 'response.function_call_arguments.done',
              name: 'start_work_session',
              call_id: call.callId,
              arguments: call.arguments,
            });
          }
          for (const call of extractContinueWorkspaceRunCalls(event)) {
            void runWorkspaceContinuation({
              type: 'response.function_call_arguments.done',
              name: 'continue_workspace_run',
              call_id: call.callId,
              arguments: call.arguments,
            });
          }
          for (const call of extractSpecialistControlCalls(event)) {
            void runSpecialistControl({
              type: 'response.function_call_arguments.done',
              name: call.name,
              call_id: call.callId,
              arguments: call.arguments,
            });
          }
          if (event.type === 'error') {
            setError(event.error?.message || 'Voice mode ran into a problem.');
            setVoiceState('error');
          }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const endpoint = new URL('/api/ai/realtime-session', window.location.origin);
        endpoint.searchParams.set('slug', slug);
        if (sessionConversationIdRef.current) {
          endpoint.searchParams.set('conversationId', sessionConversationIdRef.current);
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp ?? '',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || 'Could not start voice mode.');
        }
        const answer = await res.text();
        await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      } catch (cause) {
        if (cancelled) return;
        stop();
        setError(
          cause instanceof Error
            ? cause.message
            : 'Microphone access or the voice connection failed.',
        );
        setVoiceState('error');
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // `conversationId` is captured once when the dialog opens. A successful
    // delegation can create/select a conversation in the parent while this
    // voice session is still speaking; restarting WebRTC at that moment would
    // cut off the confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runDelegation, runSpecialistControl, runWorkspaceContinuation, slug, stop]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Talk to Chippi</DialogTitle>
          <DialogDescription>
            Speak naturally and ask Chippi to delegate durable background work.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[360px] flex-col items-center justify-between py-6 text-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Chippi voice
            </p>
            <h2
              className="mt-2 text-2xl tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              What should we work on?
            </h2>
          </div>

          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex h-28 w-28 items-center justify-center rounded-full border border-border bg-muted/20',
                voiceState === 'error' && 'border-destructive/30',
              )}
              aria-label={stateLabel(voiceState)}
            >
              {voiceState === 'error' ? (
                <Mic size={28} className="text-muted-foreground" />
              ) : (
                <ThinkingOrb
                  size={64}
                  state={
                    voiceState === 'listening'
                      ? 'listening'
                      : voiceState === 'thinking' || voiceState === 'delegating'
                        ? 'working'
                        : 'solving'
                  }
                  paused={voiceState === 'connecting'}
                />
              )}
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">{stateLabel(voiceState)}</p>
            <p className="mt-2 min-h-10 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {error || caption || 'Ask a question, or say “delegate this” to start background work.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="End voice mode"
              className="rounded-full"
            >
              {voiceState === 'error' ? <X size={16} /> : <Square size={13} className="fill-current" />}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {voiceState === 'error' ? 'Close' : 'End voice'}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
