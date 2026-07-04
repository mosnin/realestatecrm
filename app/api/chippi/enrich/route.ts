/**
 * POST /api/chippi/enrich — Chippi folds new free-text context into an existing
 * contact's structured fields.
 *
 * Backs the "Tell Chippi" enrich box on a person's page: the realtor types more
 * about the person ("just found out they're relocating for a job in March and
 * need to close before then, also has two dogs") and Chippi decides where it
 * belongs — appends to notes, sharpens the intent/preferences, fills blank
 * fields it just learned, and adds tags — without discarding what's already
 * there. It writes the merged record (scoped to the caller's space) and logs a
 * timeline note so the enrichment is auditable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { getLLMClient, resolveChatModel } from '@/lib/llm';
import { logger } from '@/lib/logger';
import { syncContact } from '@/lib/vectorize';
import type { Contact } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_INPUT = 4000;

const SYSTEM_PROMPT = `You are Chippi, an AI teammate inside a real-estate CRM. You maintain a contact record. The realtor just told you something new about this person. Fold it into the record intelligently.

You are given the CURRENT record and the NEW information. Return the UPDATED record.

Rules:
- NEVER delete or overwrite existing information unless the new info directly corrects it (e.g. a corrected phone number). Preserve everything still true.
- notes: keep the existing notes and ADD the new context to them (merge into a clean, de-duplicated summary in your own concise voice — don't just concatenate, but don't drop anything meaningful).
- preferences: sharpen the person's intent/criteria with any new detail (property type, area, beds/baths, timeline, must-haves).
- email / phone / budget / address: fill only if the new info provides one and the field is empty, OR corrects an existing one. budget is a number in dollars.
- tags: keep existing tags and add any new relevant short lowercase labels. Never remove existing tags.
- Only change what the new information justifies. If a field has no new signal, return it unchanged.

Return ONLY a JSON object with exactly these keys: email (string|null), phone (string|null), budget (number|null), preferences (string|null), address (string|null), notes (string|null), tags (string[]).`;

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const id = typeof body.id === 'string' ? body.id : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  if (!id) return NextResponse.json({ error: 'Missing contact id.' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Tell Chippi what’s new first.' }, { status: 400 });
  if (text.length > MAX_INPUT) {
    return NextResponse.json({ error: `Keep it under ${MAX_INPUT} characters.` }, { status: 400 });
  }

  // Load the current record — scoped to the caller's space (never trust the id alone).
  const { data: current, error: loadErr } = await supabase
    .from('Contact')
    .select('id, name, email, phone, budget, preferences, address, notes, tags')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (loadErr) {
    logger.error('[chippi/enrich] load failed', { spaceId: space.id, id }, loadErr);
    return NextResponse.json({ error: 'Could not load that contact.' }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const currentRecord = {
    email: current.email ?? null,
    phone: current.phone ?? null,
    budget: current.budget ?? null,
    preferences: current.preferences ?? null,
    address: current.address ?? null,
    notes: current.notes ?? null,
    tags: Array.isArray(current.tags) ? current.tags : [],
  };

  let merged: Record<string, unknown>;
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: resolveChatModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `CURRENT record:\n${JSON.stringify(currentRecord)}\n\nNEW information from the realtor:\n${text}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    merged = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.error('[chippi/enrich] llm error', { spaceId: space.id, id }, err);
    return NextResponse.json({ error: 'Chippi couldn’t process that — try again.' }, { status: 502 });
  }

  // Build the update conservatively. Existing values win when the model returns
  // nothing new; tags are unioned so nothing is ever dropped.
  const existingTags: string[] = currentRecord.tags.filter((t): t is string => typeof t === 'string');
  const newTags = Array.isArray(merged.tags)
    ? merged.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim().toLowerCase().slice(0, 40))
    : [];
  const unionTags = Array.from(new Set([...existingTags, ...newTags])).slice(0, 50);

  const budgetRaw = merged.budget;
  const budgetVal =
    typeof budgetRaw === 'number' && Number.isFinite(budgetRaw) && budgetRaw >= 0
      ? Math.round(budgetRaw)
      : currentRecord.budget;

  const updates: Record<string, unknown> = {
    email: clampStr(merged.email, 254) ?? currentRecord.email,
    phone: clampStr(merged.phone, 20) ?? currentRecord.phone,
    address: clampStr(merged.address, 500) ?? currentRecord.address,
    preferences: clampStr(merged.preferences, 5000) ?? currentRecord.preferences,
    notes: clampStr(merged.notes, 5000) ?? currentRecord.notes,
    budget: budgetVal,
    tags: unionTags,
    updatedAt: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from('Contact')
    .update(updates)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();
  if (updateErr || !updated) {
    logger.error('[chippi/enrich] update failed', { spaceId: space.id, id }, updateErr);
    return NextResponse.json({ error: 'Could not save the enrichment.' }, { status: 500 });
  }

  // Log the enrichment to the contact's timeline so it's auditable — best-effort.
  await supabase
    .from('ContactActivity')
    .insert({
      id: crypto.randomUUID(),
      contactId: id,
      spaceId: space.id,
      type: 'note',
      content: `Told Chippi: ${text.slice(0, 1000)}`,
      metadata: { via: 'chippi-enrich' },
    })
    .then(({ error }) => {
      if (error) logger.warn('[chippi/enrich] activity log failed', { id }, error);
    });

  // Keep the vector index in sync so the enriched context is searchable/usable
  // by the agent — best-effort, never blocks the response.
  syncContact(updated as Contact).catch((e) => logger.warn('[chippi/enrich] syncContact failed', { id }, e));

  return NextResponse.json({ contact: updated });
}
