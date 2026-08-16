/**
 * TOKEN-FOOTPRINT SIMULATION (not a unit test — a measurement).
 *
 * Answers one question with real code, no live LLM, no API keys: did the
 * redesign actually shrink what we ship to the model every turn?
 *
 * The furnace was never the reply. It was the REQUEST: the SDK re-ships the
 * full system prompt + every tool's JSON schema on EVERY inner step, and the
 * old agent carried the entire native catalog (56 tools) AND one tool per
 * connected Composio action (dozens per toolkit). Multiply by the inner-step
 * loop (and the old sub-agents, each with their own catalog) and a one-lookup
 * question cost hundreds of thousands of tokens.
 *
 * This serialises the per-turn tool payload EXACTLY as the provider sees it
 * (`{type, name, description, parameters}` with the Zod params lowered to JSON
 * Schema via zod 4's z.toJSONSchema) and compares OLD vs NEW. Native numbers
 * are 100% real. The Composio per-action figure is a single representative
 * schema (real Composio schemas run larger), shown parametrically so the
 * O(connected actions) → O(1) win is visible regardless of the constant.
 *
 * Run:  pnpm test tests/lib/token-footprint-simulation.test.ts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { getChatTools, CORE_TOOL_NAMES } from '@/lib/ai-tools/toolsets';
import { buildIntegrationSearchTools } from '@/lib/integrations/agent-search-tools';
import { buildSystemPrompt } from '@/lib/ai-tools/system-prompt';
import type { ToolContext } from '@/lib/ai-tools/types';
import type { ToolDefinition } from '@/lib/ai-tools/types';

// Rough token estimate: ~4 chars/token is the standard BPE average for mixed
// English + JSON. Good enough for an order-of-magnitude before/after; the
// RATIO is what matters and is estimator-independent.
const tok = (s: string) => Math.round(s.length / 4);
const fmt = (n: number) => n.toLocaleString('en-US');

function ctx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

/** Wire form of one native tool, as the provider receives it. */
function nativeWire(t: ToolDefinition): string {
  let params: unknown = {};
  try {
    params = z.toJSONSchema(t.parameters as z.ZodType, { target: 'draft-7' });
  } catch {
    params = { type: 'object' }; // a handful of schemas can't lower; rare, undercounts OLD
  }
  return JSON.stringify({ type: 'function', name: t.name, description: t.description, parameters: params });
}

/** Wire form of an SDK tool whose params are already a JSON-Schema object
 *  (our two integration meta-tools). */
function sdkWire(t: { name: string; description?: string; parameters?: unknown }): string {
  return JSON.stringify({
    type: 'function',
    name: t.name,
    description: t.description ?? '',
    parameters: t.parameters ?? {},
  });
}

/** One representative connected-app action, in the exact shape the OLD path
 *  shipped (name + 1-line description + Composio inputParameters JSON Schema).
 *  Modelled on GMAIL_SEND_EMAIL — a mid-size action. Real catalogs include
 *  far heavier ones (calendar events, HubSpot objects), so this UNDER-states
 *  the old cost. */
const REP_ACTION_WIRE = JSON.stringify({
  type: 'function',
  name: 'gmail_send_email',
  description: 'Send an email from the connected Gmail account on the user behalf.',
  parameters: {
    type: 'object',
    properties: {
      recipient_email: { type: 'string', description: "Primary recipient's email address." },
      subject: { type: 'string', description: 'The subject line of the email.' },
      body: { type: 'string', description: 'The body content of the email; plain text or HTML.' },
      cc: { type: 'array', items: { type: 'string' }, description: 'List of CC recipient email addresses.' },
      bcc: { type: 'array', items: { type: 'string' }, description: 'List of BCC recipient email addresses.' },
      is_html: { type: 'boolean', description: 'Set true if the body is HTML, false for plain text.' },
      extra_recipients: { type: 'array', items: { type: 'string' }, description: 'Additional recipients to add to the To field.' },
      attachment: { type: 'object', description: 'Optional file attachment object to include with the message.' },
      thread_id: { type: 'string', description: 'Gmail thread id to reply within an existing conversation.' },
      user_id: { type: 'string', description: "The user's email address or 'me' for the authenticated user.", default: 'me' },
    },
    required: ['recipient_email', 'subject', 'body'],
  },
});
const REP_ACTION_TOKENS = tok(REP_ACTION_WIRE);

describe('per-turn token footprint — OLD agent vs NEW agent', () => {
  it('reports the native + integration payload, old vs new', () => {
    // ── Native catalog (100% real code) ───────────────────────────────────
    const oldNativeTokens = ALL_TOOLS.reduce((s, t) => s + tok(nativeWire(t)), 0);

    const probes = [
      'who are my leads', // the exact failing case the user cited
      'email all my hot buyers',
      'audit my whole pipeline and tell me where I am leaking deals',
      'schedule a tour with Sam at the Oak St listing tomorrow',
    ];
    const newNativeByProbe = probes.map((m) => {
      const tools = getChatTools(m);
      return { m, count: tools.length, tokens: tools.reduce((s, t) => s + tok(nativeWire(t)), 0) };
    });
    const avgNewNative = Math.round(
      newNativeByProbe.reduce((s, p) => s + p.tokens, 0) / newNativeByProbe.length,
    );

    // ── Integration tools ─────────────────────────────────────────────────
    const meta = buildIntegrationSearchTools(ctx()) as Array<{
      name: string; description?: string; parameters?: unknown;
    }>;
    const newIntegrationTokens = meta.reduce((s, t) => s + tok(sdkWire(t)), 0);

    // OLD integration cost = (connected actions) × per-action schema. The old
    // loader pulled up to ~1000 actions PER connected toolkit; in practice a
    // connected toolkit exposes a few dozen. Model a realistic spread.
    const ACTIONS_PER_TOOLKIT = 30; // conservative mid-estimate
    const scenarios = [1, 3, 5, 10].map((toolkits) => {
      const actions = toolkits * ACTIONS_PER_TOOLKIT;
      return { toolkits, actions, oldTokens: actions * REP_ACTION_TOKENS };
    });

    // ── System prompt (real, current/new) ─────────────────────────────────
    const promptTokens = tok(buildSystemPrompt(ctx()));

    // ── Per-turn totals (single inner step), realtor with 5 toolkits ───────
    const s5 = scenarios.find((s) => s.toolkits === 5)!;
    const oldPerStep = oldNativeTokens + s5.oldTokens + promptTokens;
    const newPerStep = avgNewNative + newIntegrationTokens + promptTokens;

    // The SDK re-ships ALL of the above on every inner step. The OLD agent
    // also ran sub-agents, each its OWN loop with its OWN catalog. Compare
    // like-for-like at the step level, then show the loop multiplier.
    const OLD_STEPS = 15; // old maxTurns before the trims
    const NEW_STEPS = 10; // current CHAT_MAX_TURNS
    const oldPerResponse = oldPerStep * OLD_STEPS;
    const newPerResponse = newPerStep * NEW_STEPS;

    /* eslint-disable no-console */
    const L: string[] = [];
    L.push('');
    L.push('══════════════════════════════════════════════════════════════════════');
    L.push('  PER-TURN TOKEN FOOTPRINT — what the model receives each inner step');
    L.push('══════════════════════════════════════════════════════════════════════');
    L.push('');
    L.push('  NATIVE TOOL CATALOG (real schemas, zod → JSON Schema)');
    L.push(`    OLD  ALL_TOOLS ............. ${fmt(ALL_TOOLS.length)} tools   ${fmt(oldNativeTokens)} tok`);
    L.push(`    NEW  core set ............. ${fmt(CORE_TOOL_NAMES.length)} tools  (always on)`);
    for (const p of newNativeByProbe) {
      L.push(`         "${p.m}"`);
      L.push(`             → ${String(p.count).padStart(2)} tools   ${fmt(p.tokens)} tok`);
    }
    L.push(`    NEW  average ............... ${fmt(avgNewNative)} tok`);
    L.push(`    ── native reduction: ${(100 - (avgNewNative / oldNativeTokens) * 100).toFixed(0)}% fewer tokens per step`);
    L.push('');
    L.push('  CONNECTED-APP (COMPOSIO) TOOLS');
    L.push(`    NEW  find_integration_tool + call_integration_tool`);
    L.push(`             → 2 tools   ${fmt(newIntegrationTokens)} tok   (FLAT — any # of apps)`);
    L.push(`    OLD  one tool per connected action  (~${REP_ACTION_TOKENS} tok/action, representative):`);
    for (const s of scenarios) {
      const cut = (100 - (newIntegrationTokens / s.oldTokens) * 100).toFixed(1);
      L.push(`         ${String(s.toolkits).padStart(2)} toolkits ≈ ${String(s.actions).padStart(3)} actions   ${fmt(s.oldTokens).padStart(7)} tok   → new is ${cut}% smaller`);
    }
    L.push('');
    L.push('  SYSTEM PROMPT (current): ' + fmt(promptTokens) + ' tok');
    L.push('');
    L.push('  ──────────────────────────────────────────────────────────────────');
    L.push('  PER INNER STEP (native + integration + prompt), realtor w/ 5 apps:');
    L.push(`    OLD  ≈ ${fmt(oldPerStep)} tok      NEW  ≈ ${fmt(newPerStep)} tok`);
    L.push(`         → ${(100 - (newPerStep / oldPerStep) * 100).toFixed(0)}% smaller per step`);
    L.push('');
    L.push(`  PER RESPONSE  (× inner-step loop; OLD ${OLD_STEPS} steps + sub-agents, NEW ${NEW_STEPS})`);
    L.push(`    OLD  ≈ ${fmt(oldPerResponse)} tok   (excl. sub-agent loops — real bills ran higher)`);
    L.push(`    NEW  ≈ ${fmt(newPerResponse)} tok`);
    L.push(`         → ${(100 - (newPerResponse / oldPerResponse) * 100).toFixed(0)}% smaller per response`);
    L.push('══════════════════════════════════════════════════════════════════════');
    L.push('');
    console.log(L.join('\n'));
    /* eslint-enable no-console */

    // Guards so this stays true as the catalog grows:
    expect(avgNewNative).toBeLessThan(oldNativeTokens); // native shrank
    expect(newIntegrationTokens).toBeLessThan(s5.oldTokens); // integration shrank
    expect(meta).toHaveLength(2); // integration footprint is flat at 2
    expect(newPerResponse).toBeLessThan(oldPerResponse * 0.2); // >80% overall
  });
});
