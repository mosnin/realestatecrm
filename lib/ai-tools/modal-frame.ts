/**
 * Pure mapper: a Modal `tool_call_result` SSE event → the browser-facing
 * `tool_call_result` frame.
 *
 * Lives in its own framework-free module (no server-only imports) so the Modal
 * forwarding is unit-testable in isolation and reusable by the SSE proxy in
 * `app/api/ai/task/route.ts`.
 *
 * Why this exists — the live-path fix:
 *   The live realtor chat runs through Modal (Python). For a tool result to
 *   render as a rich card, the Python tool returns a dict carrying a string
 *   `display` hint plus the structured rows; modal_app.translate lifts that onto
 *   the Modal SSE frame (via extract_display_payload). This mapper is the next
 *   hop: it carries `display` + `data` from the Modal event ONTO the browser
 *   frame, so the client renderer (which dispatches on `block.display` and reads
 *   `block.result.data`) actually receives a hint on the Modal path instead of
 *   falling back to a prose dump. The previous tool-ui attempt wired the
 *   renderer + the TS path but left this Modal hop dropping display/data.
 */

import type { ToolCallBlock } from './blocks';

/** Browser-facing `tool_call_result` frame derived from a Modal SSE event. */
export interface ModalToolResultFrame {
  type: 'tool_call_result';
  name: string;
  ok: boolean;
  summary: string;
  callId: string;
  /** Rich-card render hint forwarded from the Modal event. Omitted when absent. */
  display?: ToolCallBlock['display'];
  /** Structured payload for rich rendering, forwarded as-is. Omitted when absent. */
  data?: unknown;
}

/**
 * Map a Modal `tool_call_result` event onto the browser frame, FORWARDING the
 * rich-card `display` hint + structured `data` payload.
 *
 * `display`/`data` are omitted when absent (the common case — most tools render
 * as plain text). Pure (no I/O).
 */
export function mapModalToolResultFrame(
  evt: Record<string, unknown>,
): ModalToolResultFrame {
  const name = String(evt.tool ?? 'tool');
  const callId = typeof evt.call_id === 'string' ? evt.call_id : '';
  const ok = evt.ok !== false;
  const summary = String(evt.summary ?? '');
  const display =
    typeof evt.display === 'string' ? (evt.display as ToolCallBlock['display']) : undefined;
  const data = 'data' in evt ? evt.data : undefined;
  return {
    type: 'tool_call_result',
    name,
    ok,
    summary,
    callId,
    ...(display ? { display } : {}),
    ...(data !== undefined ? { data } : {}),
  };
}
