/**
 * Type declaration for the vanilla-JS executor.js, so TS consumers (the
 * Vitest test file) get the real BrowserActionResult/BrowserActionInput
 * shapes from the shared protocol instead of tsc's own narrow inference
 * over the plain-JS implementation. executor.js itself stays dependency-free
 * (no build step, no repo-relative type-only imports needed at runtime).
 */
import type {
  BrowserActionInput,
  BrowserActionResult,
} from '../../lib/browser-control/protocol';

export interface CdpTransport {
  send(method: string, params?: unknown): Promise<any>;
}

export interface ExecuteActionOptions {
  sleep?: (ms: number) => Promise<void>;
}

export function executeAction(
  action: BrowserActionInput,
  cdp: CdpTransport,
  opts?: ExecuteActionOptions,
): Promise<BrowserActionResult>;

export const __internal: {
  KEY_MAP: Record<string, { key: string; code: string; windowsVirtualKeyCode: number; text?: string }>;
  resolveCenter: (cdp: CdpTransport, selector: string) => Promise<{ x: number; y: number } | null>;
  evaluateValue: (cdp: CdpTransport, expression: string) => Promise<unknown>;
};
