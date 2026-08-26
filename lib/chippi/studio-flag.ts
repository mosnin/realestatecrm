/** Studio is paused unless a deployment explicitly opts back in. */
export function isStudioEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED === 'true';
}
