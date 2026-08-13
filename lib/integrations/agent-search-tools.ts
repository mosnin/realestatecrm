/**
 * Integration META-TOOLS for the in-process chat agent — the scalable answer
 * to "the realtor has 44 integrations, don't load them all every turn."
 *
 * Instead of pre-loading every connected toolkit's actions (~30 schemas ×
 * N toolkits, re-shipped on every step), the chat agent carries just TWO
 * tools:
 *   - find_integration_tool(query)        — search connected apps for an action
 *   - call_integration_tool(slug, args)   — execute one action by slug
 *
 * This is the standard tool-retrieval / dispatcher pattern (the same one the
 * Modal/Python agent already runs via the internal HTTP routes). It's pure
 * function-calling, so it works on any OpenRouter model — no Anthropic
 * defer_loading, no beta headers. The per-turn integration footprint is two
 * tool schemas regardless of how many apps are connected; the actual action
 * schema is fetched only when the model searches for it.
 *
 * Authorization parity: Chat keeps the per-action approval policy. Work uses
 * the exact current message plus same-turn discovery to directly execute only
 * reviewed non-destructive actions. Every other write returns a visible,
 * fail-closed tool result before Composio so Work can never pause behind an
 * approval surface its UI intentionally does not render.
 */

import { createHash } from 'crypto';
import { tool, type Tool as SdkTool } from '@openai/agents';
import { searchIntegrationActions } from './search';
import { executeToolForEntity } from './composio';
import { actionNeedsApproval } from './agent-tools';
import { classifyIntegrationAction } from './action-policy';
import type { ToolContext } from '@/lib/ai-tools/types';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  checkSendAllowed,
  withOptOutFooter,
} from '@/lib/messaging/compliance';

/** Cap the execute result echoed into context — it re-sends on later steps. */
const MAX_RESULT_CHARS = 4_000;
const MAX_ARGUMENTS_JSON_CHARS = 64_000;

type DirectIntegrationIntent =
  | 'email_send'
  | 'sms_send'
  | 'team_message';

interface DirectActionPolicy {
  intent: DirectIntegrationIntent;
  toolkit: string;
  allowedArgumentKeys: ReadonlySet<string>;
  complianceChannel?: 'email' | 'sms';
}

const EMAIL_SEND_ARGUMENT_KEYS = new Set([
  'recipient_email',
  'to',
  'to_email',
  'recipient',
  'recipients',
  'email',
  'cc',
  'bcc',
  'cc_recipients',
  'bcc_recipients',
  'subject',
  'body',
  'content',
  'message',
  'text',
  'html',
  'html_body',
  'body_html',
  'is_html',
]);
const SMS_SEND_ARGUMENT_KEYS = new Set([
  'to',
  'to_phone',
  'recipient',
  'recipient_phone',
  'recipients',
  'phone',
  'body',
  'message',
  'text',
]);
const SLACK_SEND_ARGUMENT_KEYS = new Set([
  'channel',
  'channel_id',
  'channel_name',
  'conversation',
  'conversation_id',
  'body',
  'content',
  'message',
  'text',
]);

/**
 * Work may directly execute only reviewed provider actions for which we can
 * bind the external target to the exact current message. Unknown Composio
 * writes, user-targeted messages, calendar writes, and social posts stay
 * blocked until they have an equally concrete target/argument contract.
 */
const DIRECT_WORK_ACTIONS: Readonly<Record<string, DirectActionPolicy>> = {
  GMAIL_SEND_EMAIL: {
    intent: 'email_send',
    toolkit: 'gmail',
    allowedArgumentKeys: EMAIL_SEND_ARGUMENT_KEYS,
    complianceChannel: 'email',
  },
  OUTLOOK_SEND_EMAIL: {
    intent: 'email_send',
    toolkit: 'outlook',
    allowedArgumentKeys: EMAIL_SEND_ARGUMENT_KEYS,
    complianceChannel: 'email',
  },
  MICROSOFT_OUTLOOK_SEND_EMAIL: {
    intent: 'email_send',
    toolkit: 'outlook',
    allowedArgumentKeys: EMAIL_SEND_ARGUMENT_KEYS,
    complianceChannel: 'email',
  },
  TWILIO_SEND_SMS: {
    intent: 'sms_send',
    toolkit: 'twilio',
    allowedArgumentKeys: SMS_SEND_ARGUMENT_KEYS,
    complianceChannel: 'sms',
  },
  SLACK_SEND_MESSAGE: {
    intent: 'team_message',
    toolkit: 'slack',
    allowedArgumentKeys: SLACK_SEND_ARGUMENT_KEYS,
  },
  SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL: {
    intent: 'team_message',
    toolkit: 'slack',
    allowedArgumentKeys: SLACK_SEND_ARGUMENT_KEYS,
  },
};

/** Messaging effects need compliance regardless of Chat/Work authorization. */
const MESSAGING_ACTION_CHANNELS: Readonly<Record<string, 'email' | 'sms'>> = {
  GMAIL_SEND_EMAIL: 'email',
  GMAIL_REPLY_TO_THREAD: 'email',
  OUTLOOK_SEND_EMAIL: 'email',
  MICROSOFT_OUTLOOK_SEND_EMAIL: 'email',
  MICROSOFT_OUTLOOK_REPLY_TO_EMAIL: 'email',
  TWILIO_SEND_SMS: 'sms',
};

const EXPLICIT_DRAFT =
  /\b(draft|compose|write(?:\s+me)?|prepare)\b[\s\S]{0,80}\b(email|text|sms|message|reply|post)\b/i;

// Direct authorization requires the action request to begin the message. This
// deliberately rejects negated, quoted, hypothetical, explanatory, and
// summarize-this-text forms; a blocked user can restate the action explicitly,
// while a false positive would cause an external side effect.
const DIRECT_REQUEST_PREFIX =
  '^\\s*(?:(?:please|kindly)\\s+|(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?|i\\s+(?:want|need)\\s+you\\s+to\\s+|go\\s+ahead\\s+and\\s+)?';
const EMAIL_SEND = new RegExp(
  `${DIRECT_REQUEST_PREFIX}(?:send\\b[\\s\\S]{0,60}\\b(?:an?\\s+)?email\\b|email\\s+(?!address(?:es)?\\b|field(?:s)?\\b|data\\b|list\\b|records?\\b)|reply\\b[\\s\\S]{0,50}\\bemail\\b|forward\\b[\\s\\S]{0,50}\\bemail\\b)`,
  'i',
);
const SMS_SEND = new RegExp(
  `${DIRECT_REQUEST_PREFIX}(?:send\\b[\\s\\S]{0,60}\\b(?:an?\\s+)?(?:sms|text(?:\\s+message)?)\\b|text\\s+(?!messages?\\b|field(?:s)?\\b|data\\b|logs?\\b))`,
  'i',
);
const TEAM_MESSAGE = new RegExp(
  `${DIRECT_REQUEST_PREFIX}(?:send|post)\\b[\\s\\S]{0,100}\\bslack\\b`,
  'i',
);

function requestedDirectIntents(message: string): Set<DirectIntegrationIntent> {
  const intents = new Set<DirectIntegrationIntent>();
  const commandEnvelope = unquotedCommandEnvelope(message);
  if (!commandEnvelope || EXPLICIT_DRAFT.test(commandEnvelope)) return intents;
  // Negated/exclusion clauses make target or provider polarity ambiguous.
  // Direct external effects require a wholly positive command; the realtor
  // can restate it while this turn remains visible and side-effect free.
  if (
    /\b(?:no|not|never|without|unless|except|excluding|exclude|other\s+than|but\s+not|avoid|refrain|omit|skip|cancel|ignore|scratch\s+that|do\s+not|don['’]t|cannot|can['’]t|shouldn['’]t|mustn['’]t|won['’]t|if|whether)\b/i.test(
      commandEnvelope,
    ) || commandEnvelope.includes('?')
  ) {
    return intents;
  }
  // "Send me the latest email/history" is a retrieval request, not authority
  // to send or post externally. Direct mutation grammar fails closed on it.
  if (
    /^\s*(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need)\s+you\s+to\s+)?send\s+(?:me|us)\b[\s\S]{0,100}\b(?:email|inbox|history|messages?|thread|slack)\b/i.test(
      commandEnvelope,
    )
  ) {
    return intents;
  }
  if (EMAIL_SEND.test(commandEnvelope)) intents.add('email_send');
  if (SMS_SEND.test(commandEnvelope)) intents.add('sms_send');
  if (TEAM_MESSAGE.test(commandEnvelope)) intents.add('team_message');
  return intents;
}

function canonicalSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

function normalizedToolkit(toolkit: string): string {
  return toolkit.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseQuotedMessage(message: string): {
  envelope: string;
  contents: Set<string>;
  firstQuoteIndex: number | null;
  valid: boolean;
} {
  const chars = [...message];
  const envelope = [...message];
  const contents = new Set<string>();
  let closingQuote: string | null = null;
  let buffer = '';
  let firstQuoteIndex: number | null = null;
  let valid = true;

  const hasClosingQuote = (start: number, closing: string): boolean => {
    for (let index = start + 1; index < chars.length; index += 1) {
      if (chars[index] === '\\') {
        index += 1;
        continue;
      }
      if (chars[index] === closing) return true;
    }
    return false;
  };

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? '';
    if (!closingQuote) {
      const previous = chars[index - 1] ?? '';
      const candidate =
        char === '“'
          ? '”'
          : char === '‘'
            ? '’'
            : char === '"' || char === '`'
              ? char
              : char === "'" && !/[a-z0-9]/i.test(previous)
                ? "'"
                : null;
      if (!candidate) continue;
      // Straight single quotes double as apostrophes. Only treat one as an
      // outbound-content delimiter when a real closing quote exists.
      if (char === "'" && !hasClosingQuote(index, candidate)) {
        valid = false;
        continue;
      }
      closingQuote = candidate;
      firstQuoteIndex ??= index;
      buffer = '';
      envelope[index] = ' ';
      continue;
    }

    envelope[index] = ' ';
    if (char === '\\' && chars[index + 1] === closingQuote) {
      buffer += closingQuote;
      envelope[index + 1] = ' ';
      index += 1;
      continue;
    }
    if (char === closingQuote) {
      const content = buffer.trim();
      if (content) contents.add(content);
      closingQuote = null;
      buffer = '';
      continue;
    }
    buffer += char;
  }

  if (closingQuote) valid = false;
  return { envelope: envelope.join(''), contents, firstQuoteIndex, valid };
}

function unquotedCommandEnvelope(message: string): string {
  const parsed = parseQuotedMessage(message);
  if (!parsed.valid) return '';
  // Authority must appear before outbound copy starts. This is stricter than
  // merely deleting each quoted span and prevents malformed/nested quotes from
  // exposing a body-embedded address or channel as a command target.
  return parsed.envelope.slice(0, parsed.firstQuoteIndex ?? parsed.envelope.length);
}

function messageAllowsToolkit(
  message: string,
  policy: DirectActionPolicy,
): boolean {
  const commandEnvelope = unquotedCommandEnvelope(message);
  const providerMentions: Partial<Record<DirectIntegrationIntent, ReadonlyArray<readonly [string, RegExp]>>> = {
    email_send: [
      ['gmail', /\b(?:through|using|via|from|with)\s+gmail\b|\bgmail\s+(?:account|app|inbox)\b/i],
      [
        'outlook',
        /\b(?:through|using|via|from|with)\s+(?:microsoft\s+)?outlook\b|\boutlook\s+(?:account|app|inbox)\b/i,
      ],
    ],
    sms_send: [['twilio', /\b(?:through|using|via|from|with)\s+twilio\b|\btwilio\s+(?:account|app)\b/i]],
    team_message: [['slack', /\bslack\b/i]],
  };
  const mentions = providerMentions[policy.intent] ?? [];
  const named = mentions
    .filter(([, pattern]) => pattern.test(commandEnvelope))
    .map(([toolkit]) => toolkit);
  return (
    named.length === 1 &&
    normalizedToolkit(named[0] ?? '') === normalizedToolkit(policy.toolkit)
  );
}

function isDirectWorkActionAuthorized(args: {
  message: string;
  slug: string;
  toolkit: string;
  activeToolkits: ReadonlySet<string>;
  requestedIntents: ReadonlySet<DirectIntegrationIntent>;
}): boolean {
  const policy = DIRECT_WORK_ACTIONS[canonicalSlug(args.slug)];
  if (!policy || !args.requestedIntents.has(policy.intent)) return false;
  if (normalizedToolkit(policy.toolkit) !== normalizedToolkit(args.toolkit)) return false;
  if (!args.activeToolkits.has(normalizedToolkit(args.toolkit))) return false;
  return messageAllowsToolkit(args.message, policy);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function collectStrings(value: unknown): string[] {
  const strings: string[] = [];
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'string') {
      strings.push(current);
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === 'object') {
      pending.push(...Object.values(current as Record<string, unknown>));
    }
  }
  return strings;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function collectAddressesFromStrings(value: unknown, channel: 'email' | 'sms'): Set<string> {
  const addresses = new Set<string>();
  for (const text of collectStrings(value)) {
    if (channel === 'email') {
      const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      for (const match of matches) {
        addresses.add(match.toLowerCase());
      }
      continue;
    }
    const matches = text.match(/(?:\+?\d[\d().\s-]{8,}\d)/g) ?? [];
    for (const match of matches) {
      const normalized = normalizePhone(match);
      if (normalized) addresses.add(normalized);
    }
  }
  return addresses;
}

function collectRecipientAddresses(
  input: Record<string, unknown>,
  channel: 'email' | 'sms',
): Set<string> {
  const recipientKey =
    channel === 'email'
      ? /^(?:to|to_email|recipient|recipient_email|recipients|cc|bcc|cc_recipients|bcc_recipients|email)$/i
      : /^(?:to|to_phone|recipient|recipient_phone|recipients|phone)$/i;
  const values: unknown[] = [];
  const pending: Array<{ value: unknown; inRecipient: boolean }> = [
    { value: input, inRecipient: false },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === 'string') {
      if (current.inRecipient) values.push(current.value);
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, inRecipient: current.inRecipient });
      continue;
    }
    if (!current.value || typeof current.value !== 'object') continue;
    for (const [key, value] of Object.entries(current.value as Record<string, unknown>)) {
      pending.push({ value, inRecipient: current.inRecipient || recipientKey.test(key) });
    }
  }
  return collectAddressesFromStrings(values, channel);
}

function explicitMessageRecipients(message: string, channel: 'email' | 'sms'): Set<string> {
  const envelope = unquotedCommandEnvelope(message);
  const targets = new Set<string>();
  if (!envelope) return targets;

  if (channel === 'email') {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    for (const match of envelope.matchAll(emailPattern)) {
      const address = match[0].toLowerCase();
      const before = envelope.slice(0, match.index ?? 0);
      const relationMatches = [...before.matchAll(/\b(to|cc|bcc|from|about|regarding)\b/gi)];
      const relation = relationMatches.at(-1);
      const relationText = relation?.[1]?.toLowerCase();
      const relationTail = relation ? before.slice((relation.index ?? 0) + relation[0].length) : '';
      const explicitDestination =
        (relationText === 'to' || relationText === 'cc' || relationText === 'bcc') &&
        relationTail.length <= 100 &&
        !/[@\r\n,;:]|\b(?:from|about|regarding|using|via|through|subject|body|message)\b/i.test(
          relationTail,
        );
      const directEmailVerb = new RegExp(
        `${DIRECT_REQUEST_PREFIX}email\\b[^@\\r\\n,;:]{0,100}$`,
        'i',
      ).test(before);
      if (explicitDestination || directEmailVerb) targets.add(address);
    }
    return targets;
  }

  const phonePattern = /(?:\+?\d[\d().\s-]{8,}\d)/g;
  for (const match of envelope.matchAll(phonePattern)) {
    const before = envelope.slice(0, match.index ?? 0);
    const relationMatches = [...before.matchAll(/\b(text|sms|to|from|about|regarding)\b/gi)];
    const relation = relationMatches.at(-1);
    const relationText = relation?.[1]?.toLowerCase();
    const relationTail = relation ? before.slice((relation.index ?? 0) + relation[0].length) : '';
    if (
      !relation ||
      (relationText !== 'text' && relationText !== 'sms' && relationText !== 'to') ||
      relationTail.length > 80 ||
      /[\d+\r\n]|\b(?:from|about|regarding|using|via|through|message)\b/i.test(relationTail)
    ) {
      continue;
    }
    const normalized = normalizePhone(match[0]);
    if (normalized) targets.add(normalized);
  }
  return targets;
}

function explicitChannelTargets(message: string): Set<string> {
  const envelope = unquotedCommandEnvelope(message);
  const targets = new Set<string>();
  if (!envelope) return targets;
  for (const match of envelope.matchAll(/#[a-z0-9][a-z0-9_-]{0,79}/gi)) {
    const before = envelope.slice(0, match.index ?? 0);
    if (!/\b(?:in|to)\s+(?:slack\s+)?$/i.test(before)) continue;
    targets.add(match[0].slice(1).toLowerCase());
  }
  return targets;
}

function channelTargets(input: Record<string, unknown>): Set<string> {
  const targets = new Set<string>();
  const pending: Array<{ value: unknown; inTarget: boolean }> = [{ value: input, inTarget: false }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === 'string') {
      if (current.inTarget && current.value.trim()) {
        targets.add(current.value.trim().replace(/^#/, '').toLowerCase());
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, inTarget: current.inTarget });
      continue;
    }
    if (!current.value || typeof current.value !== 'object') continue;
    for (const [key, value] of Object.entries(current.value as Record<string, unknown>)) {
      pending.push({
        value,
        inTarget:
          current.inTarget ||
          /^(?:channel|channel_id|channel_name|conversation|conversation_id)$/i.test(key),
      });
    }
  }
  return targets;
}

function quotedContents(message: string): Set<string> {
  const parsed = parseQuotedMessage(message);
  return parsed.valid ? parsed.contents : new Set<string>();
}

function outboundContents(input: Record<string, unknown>): Set<string> {
  const contents = new Set<string>();
  const pending: Array<{ key: string; value: unknown }> = Object.entries(input).map(
    ([key, value]) => ({ key, value }),
  );
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === 'string') {
      if (
        /^(?:body|body_html|content|html|html_body|message|subject|text)$/i.test(current.key) &&
        current.value.trim()
      ) {
        contents.add(current.value.trim());
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ key: current.key, value });
      continue;
    }
    if (current.value && typeof current.value === 'object') {
      for (const [key, value] of Object.entries(current.value as Record<string, unknown>)) {
        pending.push({ key, value });
      }
    }
  }
  return contents;
}

function directArgumentsAuthorized(args: {
  message: string;
  policy: DirectActionPolicy;
  input: Record<string, unknown>;
}): boolean {
  for (const [rawKey, value] of Object.entries(args.input)) {
    const key = rawKey.toLowerCase();
    if (!args.policy.allowedArgumentKeys.has(key)) return false;
    if (key === 'is_html') {
      if (typeof value !== 'boolean') return false;
      continue;
    }
    const recipientKey = /^(?:to|to_email|to_phone|recipient|recipient_email|recipient_phone|recipients|email|phone|cc|bcc|cc_recipients|bcc_recipients)$/i.test(
      key,
    );
    if (recipientKey) {
      if (
        typeof value !== 'string' &&
        !(
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((entry) => typeof entry === 'string')
        )
      ) {
        return false;
      }
      continue;
    }
    // Direct Work actions deliberately do not accept provider-specific nested
    // objects or attachment structures until an adapter binds those fields.
    if (typeof value !== 'string') return false;
  }
  // Work direct effects are intentionally limited to content the realtor put
  // in quotes. The model may map fields to the provider schema, but it may not
  // invent externally-visible copy under an approval-free grant.
  const permittedContent = quotedContents(args.message);
  const attemptedContent = outboundContents(args.input);
  if (
    permittedContent.size === 0 ||
    attemptedContent.size === 0 ||
    ![...attemptedContent].every((content) => permittedContent.has(content))
  ) {
    return false;
  }
  if (args.policy.complianceChannel) {
    const permitted = explicitMessageRecipients(args.message, args.policy.complianceChannel);
    const attempted = collectRecipientAddresses(args.input, args.policy.complianceChannel);
    return (
      permitted.size > 0 &&
      attempted.size > 0 &&
      [...attempted].every((address) => permitted.has(address))
    );
  }
  if (args.policy.intent === 'team_message') {
    const permitted = explicitChannelTargets(args.message);
    const attempted = channelTargets(args.input);
    return (
      permitted.size > 0 &&
      attempted.size > 0 &&
      [...attempted].every((channel) => permitted.has(channel))
    );
  }
  return false;
}

async function applyMessagingCompliance(args: {
  spaceId: string;
  channel: 'email' | 'sms';
  input: Record<string, unknown>;
}): Promise<
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; response: string }
> {
  const addresses = collectRecipientAddresses(args.input, args.channel);
  if (addresses.size === 0) {
    return {
      ok: false,
      response: JSON.stringify({
        ok: false,
        code: 'COMPLIANCE_BLOCKED',
        error: 'No valid recipient address was present in the provider arguments.',
        reason: 'invalid_address',
      }),
    };
  }
  for (const address of addresses) {
    const decision = await checkSendAllowed({
      spaceId: args.spaceId,
      channel: args.channel,
      address,
      audience: 'consumer',
      category: 'marketing',
    });
    if (!decision.allowed) {
      return {
        ok: false,
        response: JSON.stringify({
          ok: false,
          code: 'COMPLIANCE_BLOCKED',
          error: decision.detail ?? 'Messaging compliance blocked this action.',
          reason: decision.reason,
        }),
      };
    }
  }
  if (args.channel !== 'sms') return { ok: true, input: args.input };

  const messageKey = ['body', 'message', 'text'].find(
    (key) => typeof args.input[key] === 'string' && (args.input[key] as string).trim(),
  );
  if (!messageKey) {
    return {
      ok: false,
      response: JSON.stringify({
        ok: false,
        code: 'COMPLIANCE_BLOCKED',
        error: 'SMS content is required so the opt-out disclosure can be applied.',
      }),
    };
  }
  return {
    ok: true,
    input: {
      ...args.input,
      [messageKey]: withOptOutFooter(args.input[messageKey] as string),
    },
  };
}

/** Normalise a slug for prefix comparison: lowercase, underscores removed.
 *  `MICROSOFT_TEAMS` and `microsoft_teams` both become `microsoftteams`. */
function normalizeSlug(s: string): string {
  return s.toLowerCase().replace(/_/g, '');
}

/** Last-resort toolkit guess from an action slug (GMAIL_SEND_EMAIL → gmail).
 *  Only used when the real connected-toolkit list isn't available. */
function toolkitFromSlug(slug: string): string {
  const i = slug.indexOf('_');
  return (i > 0 ? slug.slice(0, i) : slug).toLowerCase();
}

/**
 * Resolve the REAL toolkit for an action slug by matching it against the
 * realtor's connected toolkits. Splitting on the first underscore is wrong for
 * multi-word toolkits — `MICROSOFT_TEAMS_GET_CHANNEL` would yield `microsoft`,
 * which misses the catalog's `microsoft_teams` (a `messaging` toolkit that must
 * always gate, even reads). Matching the normalised connected slugs (longest
 * first) fixes that; we only fall back to the naive split when the list is
 * empty. Getting the toolkit right matters for the category-based approval gate
 * — the slug-segment check (send/post/...) is the other half of the safety net.
 */
function resolveToolkit(slug: string, activeToolkits: string[]): string {
  const n = normalizeSlug(slug);
  const match = [...activeToolkits]
    .sort((a, b) => normalizeSlug(b).length - normalizeSlug(a).length)
    .find((tk) => n.startsWith(normalizeSlug(tk)));
  return match ?? toolkitFromSlug(slug);
}

/**
 * Build the two integration meta-tools, bound to this turn's context. Cheap:
 * no Composio call at build time — the search hits Composio only when the
 * model actually calls find_integration_tool.
 *
 * `activeToolkits` is the realtor's connected toolkit list (from
 * `loadIntegrationMetaTools`); it lets `call_integration_tool` resolve the
 * exact toolkit for the approval gate instead of guessing from the slug.
 * `options.userMessage` must be the fresh turn's exact message; omitting it
 * creates no Work write authority, which makes resume/rehydration fail closed.
 */
export function buildIntegrationSearchTools(
  ctx: ToolContext,
  activeToolkits: string[] = [],
  options: { userMessage?: string } = {},
): SdkTool[] {
  const currentUserMessage = options.userMessage?.trim() ?? '';
  const requestedIntents = requestedDirectIntents(currentUserMessage);
  const activeToolkitSet = new Set(activeToolkits.map(normalizedToolkit));
  // Populated only by this turn's successful search result. A model cannot
  // skip discovery and present an arbitrary Composio slug as if it had been
  // authorized by the current request.
  const discoveredToolkits = new Map<string, string>();
  const directlyAuthorizedSlugs = new Set<string>();
  const consumedDirectSlugs = new Set<string>();

  const findTool = tool({
    name: 'find_integration_tool',
    description:
      "Search the realtor's connected apps (Gmail, Slack, HubSpot, calendar, etc.) for an action to do a task. Returns matching tool slugs + schemas. Call this first when the task needs an external app, then call_integration_tool with a slug.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural-language description of what you need to do (e.g. "send a slack message", "list my recent emails", "create a hubspot contact").',
        },
        limit: { type: 'number', description: 'Max results, 1-10. Default 8.' },
      },
      required: ['query'],
      additionalProperties: true,
    },
    strict: false,
    needsApproval: false,
    async execute(input: unknown) {
      const { query, limit } = (input ?? {}) as { query?: string; limit?: number };
      const q = (query ?? '').trim();
      if (!q) return JSON.stringify({ tools: [], error: 'query is required' });
      try {
        const tools = await searchIntegrationActions({
          spaceId: ctx.space.id,
          userId: ctx.userId,
          query: q,
          limit: Math.max(1, Math.min(10, Math.floor(limit ?? 8))),
        });
        for (const match of tools) {
          const slug = canonicalSlug(match.slug);
          const toolkit = match.toolkit ?? resolveToolkit(match.slug, activeToolkits);
          if (!activeToolkitSet.has(normalizedToolkit(toolkit))) continue;
          discoveredToolkits.set(slug, toolkit);
          if (
            ctx.workMode === true &&
            ctx.workExecutionMode !== 'review' &&
            isDirectWorkActionAuthorized({
              message: currentUserMessage,
              slug,
              toolkit,
              activeToolkits: activeToolkitSet,
              requestedIntents,
            })
          ) {
            directlyAuthorizedSlugs.add(slug);
          }
        }
        if (tools.length === 0) {
          return JSON.stringify({
            tools: [],
            note: 'No matching action in connected apps. Tell the realtor plainly; do not retry endlessly.',
          });
        }
        return JSON.stringify({ tools });
      } catch (err) {
        logger.warn('[integrations.find_integration_tool] search failed', { spaceId: ctx.space.id }, err);
        return JSON.stringify({ tools: [], error: 'search failed' });
      }
    },
  }) as SdkTool;

  const callTool = tool({
    name: 'call_integration_tool',
    description:
      'Execute ONE connected-app action by slug (use a slug from find_integration_tool). Provide arguments matching the action schema as a JSON string.',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Action slug from find_integration_tool (e.g. GMAIL_SEND_EMAIL).',
        },
        arguments_json: {
          type: 'string',
          description: 'JSON-encoded arguments for the action; "{}" if none.',
        },
      },
      required: ['slug', 'arguments_json'],
      additionalProperties: true,
    },
    strict: false,
    // Chat preserves the legacy per-action confirmation contract. Work never
    // emits a hidden interruption: unscoped writes execute this callback with
    // no pause, then fail closed inside `execute` before the provider boundary.
    needsApproval: async (_runCtx: unknown, input: unknown) => {
      const slug = ((input ?? {}) as { slug?: string }).slug ?? '';
      if (ctx.workMode === true && ctx.workExecutionMode !== 'review') return false;
      const toolkit = discoveredToolkits.get(canonicalSlug(slug)) ?? resolveToolkit(slug, activeToolkits);
      return actionNeedsApproval(slug, toolkit);
    },
    async execute(input: unknown, _runCtx: unknown, details: unknown) {
      const { slug, arguments_json } = (input ?? {}) as { slug?: string; arguments_json?: string };
      const cleanSlug = (slug ?? '').trim();
      if (!cleanSlug) return JSON.stringify({ ok: false, error: 'slug is required' });
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(cleanSlug)) {
        return JSON.stringify({ ok: false, error: 'slug is invalid' });
      }
      if ((arguments_json?.length ?? 0) > MAX_ARGUMENTS_JSON_CHARS) {
        return JSON.stringify({ ok: false, error: 'arguments JSON is too large' });
      }

      let args: Record<string, unknown> = {};
      if (arguments_json) {
        try {
          const parsed = JSON.parse(arguments_json);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch (e) {
          return JSON.stringify({ ok: false, error: `bad arguments JSON: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      const canonical = canonicalSlug(cleanSlug);
      const actionClass = classifyIntegrationAction(canonical);
      const directPolicy = DIRECT_WORK_ACTIONS[canonical];
      if (
        ctx.workMode === true &&
        ctx.workExecutionMode !== 'review' &&
        actionClass === 'write' &&
        (
          !directlyAuthorizedSlugs.has(canonical) ||
          !directPolicy ||
          !directArgumentsAuthorized({
            message: currentUserMessage,
            policy: directPolicy,
            input: args,
          })
        )
      ) {
        return JSON.stringify({
          ok: false,
          code: 'WORK_ACTION_NOT_AUTHORIZED',
          error:
            'That connected-app write is outside the exact action requested in this Work turn. No external action was taken.',
        });
      }

      const limits = [
        checkRateLimit(`integrations:chat:${ctx.space.id}:${ctx.userId}`, 300, 3600),
      ];
      if (actionClass === 'write') {
        limits.push(
          checkRateLimit(
            `integrations:chat:write:${ctx.space.id}:${ctx.userId}:${canonical}`,
            30,
            3600,
          ),
        );
      }
      const rateLimits = await Promise.all(limits);
      if (rateLimits.some((limit) => !limit.allowed)) {
        return JSON.stringify({
          ok: false,
          code: 'RATE_LIMITED',
          error: 'Connected-app execution limit reached. Try again later.',
        });
      }

      let providerArgs = args;
      const messagingChannel = MESSAGING_ACTION_CHANNELS[canonical];
      if (messagingChannel) {
        const compliance = await applyMessagingCompliance({
          spaceId: ctx.space.id,
          channel: messagingChannel,
          input: providerArgs,
        });
        if (!compliance.ok) return compliance.response;
        providerArgs = compliance.input;
      }

      // A direct Work grant is one-use. Re-check after all asynchronous gates
      // so concurrent calls cannot both cross the provider boundary. Retries
      // of the same logical HTTP request use the idempotency key below; a
      // second model-generated effect requires a new explicit user turn.
      if (ctx.workMode === true && ctx.workExecutionMode !== 'review' && actionClass === 'write') {
        if (consumedDirectSlugs.has(canonical)) {
          return JSON.stringify({
            ok: false,
            code: 'WORK_ACTION_ALREADY_USED',
            error: 'That connected-app action was already attempted for this Work turn.',
          });
        }
        consumedDirectSlugs.add(canonical);
      }

      try {
        const execute = () =>
          executeToolForEntity({
            entityId: ctx.userId,
            slug: cleanSlug,
            arguments: providerArgs,
          });
        const callId = (details as { toolCall?: { callId?: string } } | undefined)?.toolCall
          ?.callId;
        const logicalRequestSeed = currentUserMessage
          ? createHash('sha256').update(currentUserMessage).digest('hex')
          : callId ?? ctx.continuationIdempotencySeed ?? ctx.conversationId ?? 'unscoped';
        const result = (await (actionClass === 'write'
          ? withIdempotency(
              makeIdempotencyKey(
                'integration_action',
                ctx.space.id,
                ctx.userId,
                ctx.conversationId ?? 'no-conversation',
                logicalRequestSeed,
                canonical,
                createHash('sha256').update(stableJson(providerArgs)).digest('hex'),
              ),
              execute,
            )
          : execute())) as { successful?: boolean; error?: unknown; data?: unknown };
        const ok = result.successful !== false;
        const errMsg = result.error
          ? typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error)
          : undefined;
        const payload = JSON.stringify({
          ok,
          data: ok ? (result.data ?? {}) : undefined,
          error: ok ? undefined : `${cleanSlug} failed: ${errMsg ?? 'unknown error'}`,
        });
        return payload.length > MAX_RESULT_CHARS
          ? `${payload.slice(0, MAX_RESULT_CHARS)}…[truncated — ask for a narrower query if more detail is needed]`
          : payload;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('[integrations.call_integration_tool] execute failed', { spaceId: ctx.space.id, slug: cleanSlug }, err);
        return JSON.stringify({ ok: false, error: `${cleanSlug} failed: ${msg}` });
      }
    },
  }) as SdkTool;

  return [findTool, callTool];
}
