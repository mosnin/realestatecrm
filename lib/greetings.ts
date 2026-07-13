/**
 * Splash greeting. The same server component can be evaluated separately for
 * streamed HTML and the RSC payload, so Math.random() here can still produce
 * different text and trigger React hydration error #418. Use a stable hash of
 * the normalized name instead: the greeting varies across people but is
 * identical across every render and hydration pass for the same person.
 *
 * Time-neutral on purpose: the server clock is UTC, so "good morning" would be
 * wrong for most realtors. These read warm at any hour.
 */
export function pickGreeting(firstName: string): string {
  const n = (firstName ?? '').trim();
  const pool = n
    ? [
        `Welcome back, ${n}.`,
        `Good to see you, ${n}.`,
        `Hey, ${n}.`,
        `${n}, let's get into it.`,
        `Back at it, ${n}.`,
        `Ready when you are, ${n}.`,
        `Let's make it count, ${n}.`,
      ]
    : [
        'Welcome back.',
        'Good to see you.',
        "Let's get into it.",
        'Back at it.',
        'Ready when you are.',
      ];
  let hash = 2166136261;
  const seed = n || 'anonymous';
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return pool[(hash >>> 0) % pool.length];
}
