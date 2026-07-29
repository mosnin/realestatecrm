/**
 * Barrel for the browser-control feature. Consumers (the AI tool track, UI
 * settings pages, the app routes) should import from '@/lib/browser-control'
 * rather than reaching into individual files — this is the one place the
 * protocol contract, auth, and session/queue plumbing are re-exported
 * together.
 *
 * This file also owns the one piece of behavior that spans BOTH runtimes —
 * resolveBrowserRuntime, below — deciding whether a browser action/task
 * should be driven by the realtor's paired EXTENSION or a cloud HEADLESS
 * browser, composed from the session.ts primitives it re-exports.
 */

export * from './protocol';
export * from './auth';
export * from './session';

import { getActiveExtensionSession, getActiveHeadlessSession, getActiveSession, startHeadlessSession, type BrowserSessionRow, type BrowserSessionSource } from './session';
import type { BrowserActionInput } from './protocol';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';

/**
 * Loose "this needs the realtor's OWN login" signal, checked against free
 * text (a browser_task goal, or a single control_browser action's URL/
 * selector/typed text). Deliberately broad — false positives just mean an
 * honest "connect your extension" ask; a false negative would mean trying a
 * login-only task in an anonymous cloud browser, which is the failure mode
 * this exists to prevent (it would simply fail to be logged in, but better
 * to ask upfront than burn a headless run on something that can't work).
 *
 * Matches on possessive/session language ("my", "logged in", "sign in"),
 * common auth-walled surfaces (gmail, inbox, mls, portal, dashboard,
 * account) — the last four also catch the common case where the SITE itself
 * (e.g. a URL containing "gmail.com" or "clientportal.example.com") signals
 * a login-only destination, since callers pass the raw URL/selector text
 * through this same check.
 */
const LOGIN_REQUIRED_RE =
  /\b(my|logged[\s-]?in|log[\s-]?in|sign[\s-]?in|gmail|inbox|mls|portal|dashboard|account)\b/i;

export function needsLoggedInBrowser(intentText: string): boolean {
  return LOGIN_REQUIRED_RE.test(intentText);
}

/**
 * Headless sessions are an anonymous public-web research surface, never a
 * general remote-control channel. The Modal worker repeats this policy and
 * inspects selector targets at execution time; this server check stops known
 * unsafe requests before they can enter the durable queue.
 */
export function isHeadlessResearchActionAllowed(action: BrowserActionInput): boolean {
  if (action.type === 'press' || action.type === 'type') return false;
  if (action.type === 'click') return action.selector != null;
  return true;
}

export type BrowserRuntimeResolution =
  | { source: BrowserSessionSource; session: BrowserSessionRow }
  | { needsExtension: true; reason: string }
  | { researchWorkspaceDisabled: true; reason: string };

const NEEDS_EXTENSION_REASON =
  "This looks like it needs your OWN logged-in browser (it mentions \"my\"/being logged in, or a site like Gmail, an MLS, or a portal) — connect the Chippi extension in Settings → Browser control, then try again. I won't run this in an anonymous cloud browser that isn't logged in as you.";

const RESEARCH_WORKSPACE_DISABLED_REASON =
  'Cloud research workspace is not enabled for this account yet. Connect your Chippi browser extension for work that needs your own logged-in browser.';

/**
 * Decide which runtime should execute a browser action/task, ensuring a
 * usable session exists:
 *  - a CONNECTED extension session (source: 'extension') is always
 *    preferred — it's the realtor's own logged-in browser;
 *  - an already-active headless session is reused as-is;
 *  - otherwise, if `intentText` reads as needing the realtor's own login and
 *    no extension is connected, returns `{ needsExtension: true }` so the
 *    caller can ask honestly instead of silently running headless against
 *    something it can't be logged into;
 *  - otherwise, starts (or reuses) a headless session for public-web work.
 *
 * Callers enqueue against the exact returned session id. The queue rechecks
 * that immutable source under the same tenant/user scope before it writes,
 * so a reconnect cannot reroute a public-research action to a paired browser
 * (or the reverse).
 */
export async function resolveBrowserRuntime(opts: {
  spaceId: string;
  userId: string;
  intentText: string;
  /** Research Workspace uses its own observable public-web surface even when
   * a personal extension is connected. Login-required work still uses that extension. */
  preferHeadlessForPublic?: boolean;
}): Promise<BrowserRuntimeResolution> {
  const extension = await getActiveExtensionSession(opts.spaceId, opts.userId);
  const active = await getActiveSession(opts.spaceId, opts.userId);

  if (opts.preferHeadlessForPublic && !needsLoggedInBrowser(opts.intentText) && isResearchWorkspaceEnabledForSpace(opts.spaceId)) {
    const headless = await getActiveHeadlessSession(opts.spaceId, opts.userId);
    return {
      source: 'headless',
      session: headless ?? await startHeadlessSession({ spaceId: opts.spaceId, userId: opts.userId }),
    };
  }

  // An active EXTENSION session is the realtor's own logged-in browser — reuse
  // it for anything. But an active HEADLESS session is an anonymous cloud
  // browser: reusing it for a login-required goal would run that goal
  // un-logged-in, which is exactly the dishonest behavior the needsExtension
  // ask exists to prevent. So the login-intent check runs BEFORE we accept a
  // headless session — a login-required goal with only a headless session (and
  // no extension) still gets the honest "connect the extension" ask.
  if (extension) {
    return { source: 'extension', session: extension };
  }

  if (needsLoggedInBrowser(opts.intentText)) {
    return { needsExtension: true, reason: NEEDS_EXTENSION_REASON };
  }

  if (active) {
    // Active headless session + a public-web (non-login) goal → reuse it.
    if (!isResearchWorkspaceEnabledForSpace(opts.spaceId)) {
      return { researchWorkspaceDisabled: true, reason: RESEARCH_WORKSPACE_DISABLED_REASON };
    }
    return { source: active.source, session: active };
  }

  if (!isResearchWorkspaceEnabledForSpace(opts.spaceId)) {
    return { researchWorkspaceDisabled: true, reason: RESEARCH_WORKSPACE_DISABLED_REASON };
  }

  const session = await startHeadlessSession({ spaceId: opts.spaceId, userId: opts.userId });
  return { source: 'headless', session };
}
