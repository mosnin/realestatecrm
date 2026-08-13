/**
 * `control_browser` — drive the realtor's OWN paired browser (visible
 * cursor, kill switch) through the closed browser-control action allow-list
 * defined in `lib/browser-control/protocol.ts`: navigate, click, type,
 * press, scroll, read_dom, screenshot, wait. There is no "run arbitrary JS"
 * action and this tool never adds one.
 *
 * Flow: resolve the caller's internal User.id from ctx.userId (Clerk id —
 * the same `.eq('clerkId', ...)` pattern as summarize_realtor /
 * analyze_realtor), enqueue the action against the realtor's ACTIVE
 * browser-control session (`enqueueAction`, scoped by spaceId+userId — the
 * .eq() IS the boundary), then await the extension's result
 * (`awaitActionResult`). navigate URLs are re-validated by
 * `enqueueAction` itself against the SSRF/public-URL guard before the
 * action is queued.
 *
 * Runtime routing (resolveBrowserRuntime, lib/browser-control/index.ts): a
 * CONNECTED extension session is always preferred (it's the realtor's own
 * logged-in browser). With none connected, a public-web action auto-starts
 * a cloud HEADLESS session instead of failing outright; an action that
 * reads as needing the realtor's own login (mentions "my"/being logged in,
 * or targets a site like Gmail/an MLS/a portal) with no extension connected
 * gets an honest ask to connect one — headless never silently substitutes
 * for a login it doesn't have. Which runtime ran is stated in the result
 * summary.
 *
 * Honest UI (CLAUDE.md non-negotiable #5): failure modes get honest
 * messages — never a fabricated success.
 *   - `needs_extension` → the action needs the realtor's own login and no
 *     extension is connected. Says so; does NOT fall back to headless.
 *   - `no_session`   → no paired extension is currently connected AND
 *     headless couldn't be started either (defensive fallback — routing
 *     normally prevents this). Tell the realtor to connect one in
 *     Settings → Browser control. Do NOT imply the action ran.
 *   - `blocked_url`  → the navigate target failed the public-URL guard.
 *   - timeout (null) → the browser didn't respond in time. Say so plainly
 *     rather than going silent or guessing at what happened.
 *
 * Chat retains the legacy approval prompt. Work mode treats the selected goal
 * as authorization and the SDK bridge runs this closed action directly. In
 * both modes tenant scope, URL validation, rate limits, and honest receipts
 * remain enforced.
 *
 * Toolset registration: deliberately left as a registry ORPHAN in
 * `toolsets.ts` (not added to any keyword-gated TOOLSETS entry) — the
 * existing reachability test in `tests/lib/ai-tools-toolsets.test.ts`
 * (owned by another track) exercises a fixed keyword string that does not
 * include browser-ish terms, so gating this tool behind a new pattern would
 * make it silently unreachable under that test. Being an orphan means it's
 * always loaded, which trivially satisfies "available for browser-ish
 * asks" — see the comment left in toolsets.ts.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { BrowserActionInput } from '@/lib/browser-control/protocol';
import { enqueueActionForSession, awaitActionResult, endHeadlessSession } from '@/lib/browser-control/session';
import { isHeadlessResearchActionAllowed, resolveBrowserRuntime } from '@/lib/browser-control';
import { ensureHeadlessResearchWorker } from '@/lib/browser-control/headless-worker';
import { classifyActionSafety } from './browser-task';
import { defineTool } from '../types';

const parameters = z
  .object({
    action: BrowserActionInput,
  })
  .describe(
    "Drive the realtor's OWN logged-in browser via a closed action set: navigate, click, type, press (Enter/Tab/Escape/Backspace/ArrowDown/ArrowUp), scroll, read_dom, screenshot, or wait. Requires the realtor to have paired the Chippi browser extension (Settings → Browser control) — if none is connected, this tool reports that honestly instead of pretending the action ran.",
  );

type ControlBrowserArgs = z.infer<typeof parameters>;

interface ControlBrowserResult {
  ok: boolean;
  actionType: BrowserActionInput['type'];
  /** Which runtime executed the action — absent when nothing ran at all
   *  (needs_extension / no_session). */
  source?: 'extension' | 'headless';
  /** Bounded page text/aria snapshot — only present for read_dom. */
  dom?: string;
  /** Whether the extension captured a screenshot — the raw bytes are never
   *  put back into the model's context; the oversight panel renders it. */
  screenshotCaptured?: boolean;
  pageUrl?: string;
  pageTitle?: string;
}

const NOT_CONNECTED_SUMMARY =
  "Browser control isn't connected — this realtor hasn't paired the Chippi browser extension (or it's currently offline). Tell them to open Settings → Browser control, connect a browser, and try again. Do not say the action ran.";

/** Free text fed to resolveBrowserRuntime's needsLoggedInBrowser heuristic —
 *  the URL for navigate, or the selector/typed text for click/type, since
 *  that's where "gmail.com" / "my account" / "portal" language shows up on
 *  a SINGLE action (browser_task uses the whole English goal instead). */
function actionIntentText(action: BrowserActionInput): string {
  switch (action.type) {
    case 'navigate':
      return action.url;
    case 'click':
      return action.selector ?? '';
    case 'type':
      return `${action.text} ${action.selector ?? ''}`;
    default:
      return '';
  }
}

function runtimeNote(source: 'extension' | 'headless'): string {
  return source === 'headless' ? ' Ran in a cloud research browser — not your logged-in session.' : '';
}

const BLOCKED_URL_SUMMARY =
  "That URL can't be opened — it points at a private, internal, or otherwise disallowed address, so it was blocked before being sent to the browser.";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** "What will happen if you approve?" — one line per action type. */
function describeAction(action: BrowserActionInput): string {
  switch (action.type) {
    case 'navigate':
      return `Open ${action.url} in your browser`;
    case 'click':
      return action.selector
        ? `Click "${truncate(action.selector, 60)}" on the page`
        : `Click at (${action.x ?? '?'}, ${action.y ?? '?'}) on the page`;
    case 'type':
      return `Type "${truncate(action.text, 50)}"${action.selector ? ` into "${truncate(action.selector, 40)}"` : ''}`;
    case 'press':
      return `Press ${action.key}`;
    case 'scroll':
      return action.toSelector
        ? `Scroll to "${truncate(action.toSelector, 60)}"`
        : `Scroll the page${action.dy != null ? ` by ${action.dy}px` : ''}`;
    case 'read_dom':
      return 'Read the current page contents';
    case 'screenshot':
      return 'Take a screenshot of the current page';
    case 'wait':
      return `Wait ${action.ms}ms`;
  }
}

export const controlBrowserTool = defineTool<typeof parameters, ControlBrowserResult>({
  name: 'control_browser',
  riskLevel: 'high',
  description:
    "Drive the realtor's own paired browser (visible cursor, kill switch): navigate/click/type/press/scroll/read_dom/screenshot/wait. For MLS lookups or filling forms on external sites. Needs a connected Chippi extension — says so honestly if none is connected.",
  parameters,
  requiresApproval: true,
  // A realistic multi-step browser task (navigate → type → click → read_dom
  // a few times) can easily be a dozen+ calls in one turn; cap generously
  // enough for that but well short of "drive the browser forever."
  rateLimit: { max: 40, windowSeconds: 120 },
  summariseCall(args: ControlBrowserArgs) {
    try {
      const base = describeAction(args.action);
      // Same classifier browser_task's loop gates on — surface the same
      // warning here so a realtor approving a single sensitive action sees
      // it called out, not just a neutral one-liner.
      return classifyActionSafety(args.action) === 'needs_confirm'
        ? `${base} — this may submit something, spend money, or send/publish something`
        : base;
    } catch {
      return 'Run a browser action';
    }
  },

  async handler(args, ctx) {
    const { data: dbUser, error: userErr } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', ctx.userId)
      .maybeSingle();
    if (userErr || !dbUser) {
      return { summary: "Couldn't resolve your account — try again.", display: 'error' };
    }
    const userId = (dbUser as { id: string }).id;

    const runtime = await resolveBrowserRuntime({
      spaceId: ctx.space.id,
      userId,
      intentText: actionIntentText(args.action),
    });
    if ('needsExtension' in runtime) {
      return {
        summary: runtime.reason,
        data: { ok: false, actionType: args.action.type },
        display: 'warning',
      };
    }
    if ('researchWorkspaceDisabled' in runtime) {
      return { summary: runtime.reason, data: { ok: false, actionType: args.action.type }, display: 'warning' };
    }
    if (runtime.source === 'headless') {
      if (!isHeadlessResearchActionAllowed(args.action)) {
        return {
          summary: 'The cloud research browser only supports public-web research actions. That action was not queued.',
          data: { ok: false, actionType: args.action.type, source: 'headless' },
          display: 'warning',
        };
      }
      const launch = await ensureHeadlessResearchWorker(runtime.session.id);
      if (!launch.ok) {
        await endHeadlessSession(runtime.session.id, { spaceId: ctx.space.id }).catch(() => {});
        return {
          summary: 'Cloud research browser is unavailable right now, so this action was not queued.',
          data: { ok: false, actionType: args.action.type, source: 'headless' },
          display: 'warning',
        };
      }
    }

    const enqueued = await enqueueActionForSession({
      spaceId: ctx.space.id,
      userId,
      sessionId: runtime.session.id,
      input: args.action,
    });

    if ('error' in enqueued) {
      if (enqueued.error === 'no_session') {
        return {
          summary: NOT_CONNECTED_SUMMARY,
          data: { ok: false, actionType: args.action.type },
          display: 'warning',
        };
      }
      if (enqueued.error === 'blocked_url') {
        return {
          summary: BLOCKED_URL_SUMMARY,
          data: { ok: false, actionType: args.action.type },
          display: 'error',
        };
      }
      return {
        summary: `Couldn't queue that browser action (${enqueued.error}).`,
        data: { ok: false, actionType: args.action.type },
        display: 'error',
      };
    }

    const result = await awaitActionResult(enqueued.actionId, { spaceId: ctx.space.id });

    if (!result) {
      return {
        summary:
          "The browser didn't respond in time. It may be busy, minimized, or the extension may have disconnected — check Settings → Browser control.",
        data: { ok: false, actionType: args.action.type, source: runtime.source },
        display: 'warning',
      };
    }

    if (!result.ok) {
      return {
        summary: result.error
          ? `That browser action failed: ${result.error}`
          : 'That browser action failed.',
        data: {
          ok: false,
          actionType: args.action.type,
          source: runtime.source,
          pageUrl: result.pageUrl,
          pageTitle: result.pageTitle,
        },
        display: 'error',
      };
    }

    const parts: string[] = [(result.summary ?? `${args.action.type} completed.`) + runtimeNote(runtime.source)];
    if (args.action.type === 'read_dom' && result.dom) {
      parts.push(`(${result.dom.length.toLocaleString()} chars of page content captured.)`);
    }
    if (result.screenshot) {
      parts.push('A screenshot was captured — visible in the browser-control panel, not inlined here.');
    }

    return {
      summary: parts.join(' '),
      data: {
        ok: true,
        actionType: args.action.type,
        source: runtime.source,
        dom: args.action.type === 'read_dom' ? result.dom : undefined,
        screenshotCaptured: Boolean(result.screenshot),
        pageUrl: result.pageUrl,
        pageTitle: result.pageTitle,
      },
      display: 'plain',
    };
  },
});
