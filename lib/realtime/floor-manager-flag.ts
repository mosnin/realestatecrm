/** Server-only, independently default-off rollout for voice specialist controls. */
export function isRealtimeVoiceFloorManagerEnabled(): boolean {
  return process.env.CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED === 'true';
}
