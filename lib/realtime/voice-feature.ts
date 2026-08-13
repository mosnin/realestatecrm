/**
 * Realtime voice is deliberately a server-controlled beta. The UI receives
 * only the boolean result; callers never infer availability from a browser
 * credential or from a route merely existing.
 */
export function realtimeVoiceGatewayEnabled(): boolean {
  return process.env.REALTIME_VOICE_GATEWAY_ENABLED === '1';
}

/**
 * Voice delegation promises background continuation. We only advertise it
 * when the durable Work Session dispatcher is configured; the request-bound
 * `after()` fallback is useful in previews but cannot support that promise.
 */
export function realtimeVoiceGatewayReady(): boolean {
  const cloudflareReady = Boolean(
    process.env.WORKER_URL?.trim() && process.env.WORKER_SECRET?.trim(),
  );
  const legacyInngestReady = Boolean(
    process.env.INNGEST_EVENT_KEY?.trim() &&
      process.env.INNGEST_SIGNING_KEY?.trim(),
  );
  return (
    realtimeVoiceGatewayEnabled() &&
    Boolean(process.env.OPENAI_API_KEY) &&
    (cloudflareReady || legacyInngestReady)
  );
}
