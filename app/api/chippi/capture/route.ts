/**
 * POST /api/chippi/capture — Chippi reads a free-text description of a person
 * and turns it into structured Contact fields.
 *
 * This backs the "Tell Chippi" quick-capture on the People page: the realtor
 * types what they know in plain language ("Met Sarah at the Oak St open house,
 * pre-approved for 600k, wants a 3BR with a yard, texting is best"), and Chippi
 * extracts name / email / phone / budget / intent / notes / tags so the record
 * is created already-populated instead of a blank form.
 *
 * SCOPE: extraction ONLY. The client takes the returned `fields` and POSTs them
 * to the existing /api/contacts create route, so the record goes through the one
 * tested creation path (dedupe, scoring, vectorize, new-lead trigger). This route
 * never writes to the database — it reads a sentence and returns structure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { getLLMClient, resolveChatModel } from '@/lib/llm';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_INPUT = 4000;

/** The exact fields the /api/contacts create route accepts. */
export interface CapturedContact {
  name: string;
  email: string | null;
  phone: string | null;
  budget: number | null;
  /** What they're looking for — their intent / criteria. Maps to Contact.preferences. */
  preferences: string | null;
  address: string | null;
  /** Everything else worth remembering, in Chippi's own words. Maps to Contact.notes. */
  notes: string | null;
  /** Short lowercase labels (e.g. "buyer", "pre-approved", "hot"). */
  tags: string[];
}

const SYSTEM_PROMPT = `You are Chippi, an AI teammate inside a real-estate CRM. A realtor is telling you about a person they just met or spoke with, in plain language. Turn what they said into clean, structured contact fields.

Rules:
- Extract ONLY what is stated or clearly implied. Never invent an email, phone, or budget that wasn't given.
- name: the person's full name. If no name is given, use the best available label (e.g. "Buyer from Oak St open house"). Required, non-empty.
- email / phone: only if present. Normalize phone lightly (keep digits, +, spaces, dashes). Otherwise null.
- budget: a single number in dollars if a price/budget is mentioned (e.g. "pre-approved for 600k" -> 600000). Otherwise null.
- preferences: what they want — property type, beds/baths, area, timeline, must-haves. One tight sentence. This is their INTENT. Otherwise null.
- address: a home/mailing address for the person if given (not a property they're interested in — that goes in preferences). Otherwise null.
- notes: everything else worth remembering — how you met, personality, constraints, next steps — written in your own concise voice as if briefing the realtor later. Otherwise null.
- tags: 1-5 short lowercase labels that will help filter later (e.g. "buyer", "seller", "renter", "pre-approved", "hot", "first-time", "investor", "referral"). [] if unclear.

Return ONLY a JSON object with exactly these keys: name (string), email (string|null), phone (string|null), budget (number|null), preferences (string|null), address (string|null), notes (string|null), tags (string[]).`;

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  if (!text) {
    return NextResponse.json({ error: 'Tell Chippi a bit about this person first.' }, { status: 400 });
  }
  if (text.length > MAX_INPUT) {
    return NextResponse.json({ error: `Keep it under ${MAX_INPUT} characters.` }, { status: 400 });
  }

  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: resolveChatModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.error('[chippi/capture] non-JSON from model', { raw: raw.slice(0, 500) });
      return NextResponse.json({ error: 'Chippi couldn’t read that — try rephrasing.' }, { status: 502 });
    }

    const name = clampStr(parsed.name, 200) ?? 'New contact';
    const budgetRaw = parsed.budget;
    const budget =
      typeof budgetRaw === 'number' && Number.isFinite(budgetRaw) && budgetRaw >= 0
        ? Math.round(budgetRaw)
        : null;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .slice(0, 5)
          .map((t) => t.trim().toLowerCase().slice(0, 40))
      : [];

    const fields: CapturedContact = {
      name,
      email: clampStr(parsed.email, 254),
      phone: clampStr(parsed.phone, 20),
      budget,
      preferences: clampStr(parsed.preferences, 2000),
      address: clampStr(parsed.address, 500),
      notes: clampStr(parsed.notes, 5000),
      tags,
    };

    return NextResponse.json({ fields });
  } catch (err) {
    logger.error('[chippi/capture] llm error', { spaceId: auth.space.id }, err);
    return NextResponse.json({ error: 'Chippi is unavailable for a moment — try again.' }, { status: 502 });
  }
}
