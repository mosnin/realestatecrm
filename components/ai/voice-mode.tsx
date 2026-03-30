'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceModeProps {
  open: boolean;
  onClose: () => void;
  onTranscription: (text: string) => void;
  lastAssistantMessage: string | null;
}

export function VoiceMode({ open, onClose, onTranscription, lastAssistantMessage }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopRecording();
      stopSpeaking();
      setState('idle');
      setTranscript('');
      setError('');
    }
  }, [open]);

  // Auto-speak when new assistant message arrives
  useEffect(() => {
    if (open && lastAssistantMessage && state !== 'listening') {
      speak(lastAssistantMessage);
    }
  }, [lastAssistantMessage]);

  const startRecording = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) { setState('idle'); return; } // too short
        await transcribe(blob);
      };

      mediaRecorder.start();
      setState('listening');
    } catch (err) {
      setError('Microphone access denied');
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const transcribe = async (blob: Blob) => {
    setState('processing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const res = await fetch('/api/ai/transcribe', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Transcription failed');
      const data = await res.json();
      const text = data.text?.trim();
      if (text) {
        setTranscript(text);
        onTranscription(text);
      } else {
        setState('idle');
      }
    } catch (err) {
      setError('Could not transcribe audio');
      setState('idle');
    }
  };

  const speak = async (text: string) => {
    setState('speaking');
    try {
      // Strip markdown/code blocks for cleaner speech
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<<ACTION>>[\s\S]*?<<\/ACTION>>/g, '')
        .trim()
        .slice(0, 2000);

      if (!cleanText) { setState('idle'); return; }

      const res = await fetch('/api/ai/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      });
      if (!res.ok) throw new Error('TTS failed');

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setState('idle');
        URL.revokeObjectURL(audioUrl);
        // Auto-start listening again after speaking
        startRecording();
      };
      audio.onerror = () => {
        setState('idle');
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      console.error('[voice] TTS error:', err);
      setState('idle');
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const handleMicClick = () => {
    if (state === 'listening') {
      stopRecording();
    } else if (state === 'speaking') {
      stopSpeaking();
      setState('idle');
    } else if (state === 'idle') {
      startRecording();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-24 right-6 z-50 flex flex-col items-center gap-3"
        >
          {/* Status text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full bg-card border border-border shadow-lg px-4 py-2 text-center max-w-[240px]"
          >
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : state === 'listening' ? (
              <p className="text-xs text-foreground font-medium">Listening...</p>
            ) : state === 'processing' ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
                <Loader2 size={12} className="animate-spin" /> Transcribing...
              </p>
            ) : state === 'speaking' ? (
              <p className="text-xs text-primary font-medium flex items-center gap-1.5 justify-center">
                <Volume2 size={12} /> Chip is speaking...
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Tap to speak</p>
            )}
            {transcript && state !== 'idle' && (
              <p className="text-[11px] text-muted-foreground mt-1 truncate">{transcript}</p>
            )}
          </motion.div>

          {/* Mic button */}
          <div className="relative">
            {/* Pulse ring when listening */}
            {state === 'listening' && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-primary"
                />
                <motion.div
                  animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                  className="absolute inset-0 rounded-full bg-primary"
                />
              </>
            )}

            {/* Speaking animation */}
            {state === 'speaking' && (
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.15, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-primary"
              />
            )}

            <button
              onClick={handleMicClick}
              disabled={state === 'processing'}
              className={cn(
                'relative w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-colors',
                state === 'listening' ? 'bg-primary text-primary-foreground' :
                state === 'speaking' ? 'bg-primary/80 text-primary-foreground' :
                state === 'processing' ? 'bg-muted text-muted-foreground cursor-wait' :
                'bg-card border border-border text-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >
              {state === 'processing' ? (
                <Loader2 size={24} className="animate-spin" />
              ) : state === 'listening' ? (
                <MicOff size={24} />
              ) : state === 'speaking' ? (
                <Volume2 size={24} />
              ) : (
                <Mic size={24} />
              )}
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm transition-colors"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
