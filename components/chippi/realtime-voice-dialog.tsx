'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Mic, Minus, Square, X } from 'lucide-react';
import { Liquid } from 'liquid-gooey';
import { Orb, type OrbState } from 'orb-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  buildSpecialistControlVoiceOutput,
  buildSpecialistSpawnVoiceOutput,
  extractContinueWorkspaceRunCalls,
  extractSpawnSpecialistTeamCalls,
  extractSpecialistControlCalls,
  extractStartWorkSessionCalls,
  type SpecialistControlBrowserResult,
  type SpecialistSpawnBrowserResult,
} from '@/lib/realtime/client-events';

type VoiceState =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'delegating'
  | 'error';

function orbStateFor(state: VoiceState): OrbState {
  return state === 'delegating' ? 'thinking' : state;
}

function createAudioMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  if (typeof AudioContext === 'undefined') return () => {};
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  const source = context.createMediaStreamSource(stream);
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  const samples = new Uint8Array(analyser.fftSize);
  let frame = 0;
  let lastLevel = -1;
  source.connect(analyser);

  const sample = () => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const value of samples) {
      const normalized = (value - 128) / 128;
      energy += normalized * normalized;
    }
    const level = Math.min(1, Math.sqrt(energy / samples.length) * 4.5);
    if (Math.abs(level - lastLevel) >= 0.025) {
      lastLevel = level;
      onLevel(level);
    }
    frame = window.requestAnimationFrame(sample);
  };
  frame = window.requestAnimationFrame(sample);

  return () => {
    window.cancelAnimationFrame(frame);
    source.disconnect();
    analyser.disconnect();
    void context.close().catch(() => {});
    onLevel(0);
  };
}

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
  minimized = false,
  onMinimize,
  onExpand,
  onDelegated,
  onWorkspaceContinued,
  onSpecialistSpawned,
  onSpecialistControlled,
}: {
  slug: string;
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
  onDelegated: (work: DelegatedWork) => void;
  onWorkspaceContinued: (work: { conversationId: string; callId: string; instruction: string; runId: string; taskId: string; status: string }) => void;
  onSpecialistSpawned?: (work: { conversationId: string; runId: string; callId: string; goal: string; status: string }) => void;
  onSpecialistControlled?: (runId: string) => void;
}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('connecting');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const reduceMotion = useReducedMotion() ?? false;
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputMeterCleanupRef = useRef<(() => void) | null>(null);
  const outputMeterCleanupRef = useRef<(() => void) | null>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const handledCallsRef = useRef<Set<string>>(new Set());
  const sessionConversationIdRef = useRef<string | null>(conversationId);
  const delegatedRef = useRef(onDelegated);
  delegatedRef.current = onDelegated;
  const workspaceContinuedRef = useRef(onWorkspaceContinued);
  workspaceContinuedRef.current = onWorkspaceContinued;
  const specialistControlledRef = useRef(onSpecialistControlled);
  specialistControlledRef.current = onSpecialistControlled;
  const specialistSpawnedRef = useRef(onSpecialistSpawned);
  specialistSpawnedRef.current = onSpecialistSpawned;

  const stop = useCallback(() => {
    inputMeterCleanupRef.current?.();
    inputMeterCleanupRef.current = null;
    outputMeterCleanupRef.current?.();
    outputMeterCleanupRef.current = null;
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

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (minimized) expandButtonRef.current?.focus({ preventScroll: true });
      else minimizeButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [minimized, open]);

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
        // The server-authorized conversation returned by delegation becomes the
        // target for the rest of this same voice session. This keeps later
        // continuation/specialist controls grounded without restarting WebRTC.
        sessionConversationIdRef.current = data.conversationId;
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
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; conversationId?: string; workspaceRunId?: string; taskId?: string; status?: string; conversationRecorded?: boolean };
        if (!res.ok || !data.ok || !data.workspaceRunId || !data.taskId || !data.status) throw new Error(data.error || 'The Workspace continuation could not be started.');
        if (typeof data.conversationId === 'string' && data.conversationId.trim()) {
          sessionConversationIdRef.current = data.conversationId;
        }
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

  const runSpecialistSpawn = useCallback(
    async (event: RealtimeEvent) => {
      const callId = event.call_id?.trim();
      if (!callId || handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);
      let args: { goal?: unknown };
      try { args = JSON.parse(event.arguments ?? '{}') as typeof args; } catch { args = {}; }
      const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
      if (goal.length < 10) {
        sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: false, error: 'The specialist goal needs more detail.' }) } });
        sendEvent({ type: 'response.create' });
        return;
      }
      setVoiceState('delegating');
      setCaption(goal);
      try {
        const specialistRequest = {
          action: 'spawn_specialist_team' as const,
          slug,
          conversationId: sessionConversationIdRef.current,
          callId,
          goal,
        };
        const res = await fetch('/api/ai/realtime-delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(specialistRequest),
        });
        let data = (await res.json().catch(() => ({}))) as SpecialistSpawnBrowserResult & {
          ok?: boolean;
          error?: string;
          conversationId?: string;
        };
        // A saved request with an armed recovery receipt is a successful
        // durable handoff even when the first delivery acknowledgement was
        // lost. Do not lie that execution has started, but do keep the live
        // specialist card so the recovery rail can settle it in place.
        const durableHandoff = data.accepted === true || data.requestSaved === true;
        if (!res.ok || !data.ok || !durableHandoff || !data.conversationId || !data.runId) {
          throw new Error(data.error || 'The specialist team could not be queued.');
        }
        const durableConversationId = data.conversationId;
        const durableRunId = data.runId;

        // Launch identity is deterministic from this callId. If the durable
        // SwarmRun exists but its two transcript rows failed to record, retry
        // the same server command once. The server reuses the existing run and
        // idempotent message ids, so this repairs the conversation card without
        // creating another specialist team.
        if (data.conversationRecorded === false) {
          try {
            const repairResponse = await fetch('/api/ai/realtime-delegate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(specialistRequest),
            });
            const repaired = (await repairResponse.json().catch(() => ({}))) as typeof data;
            if (
              repairResponse.ok &&
              repaired.ok &&
              repaired.conversationRecorded !== false &&
              repaired.conversationId === durableConversationId &&
              repaired.runId === durableRunId
            ) {
              data = { ...data, ...repaired };
            }
          } catch {
            // The durable launch remains valid. Surface the unresolved card
            // state below instead of converting the real work into a failure.
          }
        }
        sessionConversationIdRef.current = durableConversationId;
        specialistSpawnedRef.current?.({
          conversationId: durableConversationId,
          runId: durableRunId,
          callId,
          goal,
          status: data.status ?? (data.accepted ? 'queued' : 'planning'),
        });
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(buildSpecialistSpawnVoiceOutput(data)),
          },
        });
        sendEvent({ type: 'response.create' });
        setVoiceState('thinking');
        if (data.conversationRecorded === false) {
          setError('The specialist request is saved, but its conversation card is still being repaired.');
        } else if (data.delivery === 'unconfirmed_recovery_armed') {
          setError('The specialist request is saved, but delivery is still being reconciled.');
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'The specialist team could not be queued.';
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
        inputMeterCleanupRef.current?.();
        inputMeterCleanupRef.current = createAudioMeter(media, setInputVolume);

        const peer = new RTCPeerConnection();
        peerRef.current = peer;
        for (const track of media.getTracks()) peer.addTrack(track, media);

        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audioRef.current = audio;
        peer.ontrack = (trackEvent) => {
          const remoteStream = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
          audio.srcObject = remoteStream;
          outputMeterCleanupRef.current?.();
          outputMeterCleanupRef.current = createAudioMeter(remoteStream, setOutputVolume);
          void audio.play().catch(() => {});
        };
        peer.onconnectionstatechange = () => {
          if (cancelled || peer.connectionState !== 'failed') return;
          stop();
          setError('The voice connection ended unexpectedly.');
          setVoiceState('error');
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
          for (const call of extractSpawnSpecialistTeamCalls(event)) {
            void runSpecialistSpawn({
              type: 'response.function_call_arguments.done',
              name: 'spawn_specialist_team',
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
            stop();
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
  }, [open, runDelegation, runSpecialistControl, runSpecialistSpawn, runWorkspaceContinuation, slug, stop]);

  const orbState = orbStateFor(voiceState);
  const orbVolume = voiceState === 'speaking' ? outputVolume : inputVolume;
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.72 };

  const orb = (size: number) => (
    reduceMotion ? (
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground',
          voiceState === 'error' && 'border-destructive/30 text-destructive',
        )}
        style={{ width: size * 0.56, height: size * 0.56 }}
      >
        <Mic size={Math.max(18, size * 0.15)} />
      </span>
    ) : (
      <Orb
        state={orbState}
        volume={orbVolume}
        theme="cloud"
        size={size}
        interactive={false}
        aria-hidden="true"
        className="chippi-voice-orb"
      />
    )
  );

  return (
    <AnimatePresence initial={false}>
      {open && minimized ? (
        <motion.div
          key="voice-minimized"
          className="pointer-events-auto fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-3 z-[80] md:bottom-5 md:right-5"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
          transition={transition}
        >
          <button
            ref={expandButtonRef}
            type="button"
            onClick={onExpand}
            aria-label={`Expand Chippi voice. ${stateLabel(voiceState)}.`}
            className="group flex min-h-16 items-center gap-2 rounded-full border border-border/80 bg-background/95 p-1.5 pr-4 text-left shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/30">
              {orb(76)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-xs font-medium text-foreground">Chippi voice</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {stateLabel(voiceState)} · tap to return
              </span>
            </span>
          </button>
        </motion.div>
      ) : null}

      {open && !minimized ? (
        <motion.section
          key="voice-expanded"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chippi-voice-title"
          aria-describedby="chippi-voice-description"
          className="pointer-events-auto fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[80] mx-auto w-auto max-w-[460px] overflow-hidden rounded-[30px] border border-border/80 bg-background/95 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl md:inset-x-auto md:bottom-5 md:right-5 md:w-[440px]"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          transition={transition}
        >
          <p id="chippi-voice-description" className="sr-only">
            Speak naturally to Chippi. You can start work, continue a task, or ask for specialist
            progress. Minimizing keeps this browser voice session connected.
          </p>

          <div className="flex items-center justify-between px-4 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Chippi voice
              </p>
              <h2
                id="chippi-voice-title"
                className="mt-0.5 truncate text-lg tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                What should we work on?
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {onMinimize ? (
                <Button
                  ref={minimizeButtonRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onMinimize}
                  aria-label="Minimize voice mode"
                  className="h-9 w-9 rounded-full"
                >
                  <Minus size={17} />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="End voice mode"
                className="h-9 w-9 rounded-full"
              >
                {voiceState === 'error' ? (
                  <X size={16} />
                ) : (
                  <Square size={12} className="fill-current" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex min-h-[390px] flex-col items-center justify-between px-6 pb-6 pt-2 text-center">
            <div className="flex flex-1 flex-col items-center justify-center">
              <div
                className={cn(
                  'flex h-52 w-52 items-center justify-center overflow-hidden rounded-full bg-muted/20',
                  voiceState === 'error' && 'ring-1 ring-destructive/25',
                )}
              >
                {orb(224)}
              </div>
              <Liquid
                aria-live="polite"
                aria-atomic="true"
                blur={4}
                contrast={20}
                fill="var(--chippi-liquid-paper)"
                shadow="0 1px 2px rgba(0, 0, 0, 0.05), inset 0 0 0 1px var(--chippi-liquid-border)"
                className="chippi-voice-state-liquid mt-4 inline-flex"
              >
                <Liquid.Item
                  effect="morph"
                  morph={{ shape: true, speed: 1.8, bounce: 0.08, contentBlur: 1.25 }}
                >
                  <Badge
                    variant="ghost"
                    className="min-h-8 overflow-visible rounded-full border-0 bg-transparent px-3.5 text-sm text-foreground transition-none"
                  >
                    {stateLabel(voiceState)}
                  </Badge>
                </Liquid.Item>
              </Liquid>
              <p
                aria-live="polite"
                aria-atomic="true"
                className="mt-2 min-h-11 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground"
              >
                {error || caption || 'Ask a question, start work, or hand a task to a specialist.'}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-left">
              <p className="text-xs font-medium text-foreground">Keep talking while Chippi works</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Minimize this panel or move around the workspace. Use End voice when you want to
                disconnect the microphone.
              </p>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
