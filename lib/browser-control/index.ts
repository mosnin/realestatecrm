/**
 * Barrel for the browser-control feature. Consumers (the AI tool track, UI
 * settings pages, the app routes) should import from '@/lib/browser-control'
 * rather than reaching into individual files — this is the one place the
 * protocol contract, auth, and session/queue plumbing are re-exported
 * together.
 */

export * from './protocol';
export * from './auth';
export * from './session';
