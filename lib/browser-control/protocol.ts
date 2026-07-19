/**
 * Browser-control protocol — the ONE shared contract between the Chippi web
 * app, the agent tool, and the Chrome extension (extension/). Everything else
 * imports these types + schemas; nothing redefines them.
 *
 * Model: a realtor installs the Chippi extension and PAIRS it to their account
 * (a short-lived pairing code → a long-lived per-user bearer token). Once
 * paired, the chat agent can drive the realtor's OWN logged-in browser: the
 * agent enqueues ACTIONS, the extension polls, executes each via the Chrome
 * debugger (CDP) — moving a visible cursor, clicking, typing — and posts the
 * RESULT (plus a screenshot) back. The user watches, with a kill switch.
 *
 * Security posture baked into the contract:
 *  - Actions are a CLOSED allow-list (this union) — the extension executes
 *    nothing outside it; there is no "run arbitrary JS" action.
 *  - Every action carries a `sessionId`; a session belongs to exactly one
 *    paired link, which belongs to exactly one (userId, spaceId). Scope is
 *    enforced server-side on every read/write (the .eq IS the boundary).
 *  - `navigate` targets are re-validated against the same SSRF/public-URL
 *    guard the read-only proxy uses (assertPublicHttpUrl) before enqueue.
 */

import { z } from 'zod';

/** Token the extension sends as `Authorization: Bearer <token>`. */
export const EXT_TOKEN_PREFIX = 'chippi_ext_';
/** Pairing codes are short + human-typeable; case-normalized to uppercase. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_SECONDS = 300;
/** A queued action the extension hasn't picked up in this long is abandoned. */
export const ACTION_TTL_SECONDS = 120;

// ── Actions (the closed allow-list) ─────────────────────────────────────────

export const NavigateAction = z.object({
  type: z.literal('navigate'),
  url: z.string().url(),
});
export const ClickAction = z.object({
  type: z.literal('click'),
  // Either explicit viewport coordinates OR a CSS selector the extension
  // resolves to an element's center. Coordinates win when both are present.
  x: z.number().optional(),
  y: z.number().optional(),
  selector: z.string().max(500).optional(),
});
export const TypeAction = z.object({
  type: z.literal('type'),
  text: z.string().max(10_000),
  // Optional selector to focus/click first; otherwise types into the
  // currently-focused element.
  selector: z.string().max(500).optional(),
});
export const PressAction = z.object({
  type: z.literal('press'),
  key: z.enum(['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown', 'ArrowUp']),
});
export const ScrollAction = z.object({
  type: z.literal('scroll'),
  dy: z.number().optional(),
  toSelector: z.string().max(500).optional(),
});
export const ReadDomAction = z.object({
  type: z.literal('read_dom'),
  // Bounds the returned snapshot so a huge page can't blow the context.
  maxChars: z.number().int().min(500).max(40_000).default(12_000),
});
export const ScreenshotAction = z.object({ type: z.literal('screenshot') });
export const WaitAction = z.object({
  type: z.literal('wait'),
  ms: z.number().int().min(0).max(10_000),
});

export const BrowserActionInput = z.discriminatedUnion('type', [
  NavigateAction,
  ClickAction,
  TypeAction,
  PressAction,
  ScrollAction,
  ReadDomAction,
  ScreenshotAction,
  WaitAction,
]);
export type BrowserActionInput = z.infer<typeof BrowserActionInput>;
export type BrowserActionType = BrowserActionInput['type'];

/** Every action type the closed allow-list permits — single source of truth. */
export const BROWSER_ACTION_TYPES = [
  'navigate',
  'click',
  'type',
  'press',
  'scroll',
  'read_dom',
  'screenshot',
  'wait',
] as const;

export function isBrowserActionType(v: string): v is BrowserActionType {
  return (BROWSER_ACTION_TYPES as readonly string[]).includes(v);
}

// ── Result the extension posts back ─────────────────────────────────────────

export const ActionStatus = z.enum(['queued', 'running', 'done', 'error', 'expired']);
export type ActionStatus = z.infer<typeof ActionStatus>;

export const BrowserActionResult = z.object({
  ok: z.boolean(),
  /** Human/agent-facing summary of what happened ("Clicked 'Search'"). */
  summary: z.string().max(2_000).optional(),
  /** Present for read_dom: a bounded text/aria snapshot of the page. */
  dom: z.string().optional(),
  /** Present for screenshot (and optionally other actions): storage key or
   *  data URL of the captured frame. */
  screenshot: z.string().optional(),
  /** Current page after the action, so the agent keeps its bearings. */
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
  error: z.string().max(2_000).optional(),
});
export type BrowserActionResult = z.infer<typeof BrowserActionResult>;

// ── Wire envelopes (extension ↔ app) ────────────────────────────────────────

/** POST /pair/redeem body — extension trades a pairing code for a token. */
export const RedeemPairingBody = z.object({
  code: z.string().length(PAIRING_CODE_LENGTH),
  /** Free-form label so the user can tell devices apart in settings. */
  deviceLabel: z.string().max(120).optional(),
});

/** A live viewport frame the extension pushes on its poll heartbeat so the
 *  Chippi side panel can show the user what the agent sees. `image` is a
 *  data: URL (jpeg, low quality — a monitoring feed, not an asset). */
export const LiveFrame = z.object({
  image: z.string(),
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
});
export type LiveFrame = z.infer<typeof LiveFrame>;

/** POST /poll body — extension long-polls for the next action AND (optionally)
 *  reports the result of the one it just finished, in a single round-trip.
 *  It may also pigg-back a live viewport frame and a user-kill signal. */
export const PollBody = z.object({
  sessionId: z.string().optional(),
  /** Result of the previously-dispatched action, if any. */
  completed: z
    .object({ actionId: z.string(), result: BrowserActionResult })
    .optional(),
  /** Latest viewport frame for the oversight panel (throttled by the client). */
  frame: LiveFrame.optional(),
  /** The user hit the in-page kill switch — server ends the session. */
  killed: z.boolean().optional(),
});

/** What /poll returns: the next action to run, or null when the queue is dry. */
export const PollResponse = z.object({
  action: z
    .object({ id: z.string(), sessionId: z.string(), input: BrowserActionInput })
    .nullable(),
  /** Server tells the extension to tear down (user revoked / killed). */
  stop: z.boolean().default(false),
});
export type PollResponse = z.infer<typeof PollResponse>;
