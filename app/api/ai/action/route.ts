import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncContact } from '@/lib/vectorize';
import { syncDeal } from '@/lib/vectorize';
import { audit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Contact, Deal, DealStage } from '@/lib/types';

// Whitelist of fields that can be modified via AI actions
const CONTACT_ALLOWED_FIELDS = new Set(['name', 'email', 'phone', 'budget', 'preferences', 'address', 'notes', 'type', 'tags', 'followUpAt']);
const DEAL_ALLOWED_FIELDS = new Set(['title', 'description', 'value', 'address', 'priority', 'closeDate', 'status', 'stageId']);

/**
 * POST /api/ai/action
 *
 * Executes a CRM action proposed by the AI assistant (Chip).
 * Resolves the target entity by ID first, then falls back to a name search
 * if the AI hallucinated or mangled the UUID.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug, action, conversationId } = await req.json();

    if (!slug || !action?.type || !action?.changes) {
      return NextResponse.json({ error: 'Invalid action payload' }, { status: 400 });
    }

    const auth = await requireSpaceOwner(slug);
    if (auth instanceof NextResponse) return auth;

    // Rate limit: 20 AI actions per hour per user
    const { allowed } = await checkRateLimit(`ai-action:${auth.userId}`, 20, 3600);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many AI actions. Please try again later.' }, { status: 429 });
    }

    // Whitelist changes to prevent AI from modifying sensitive fields
    const allowedFields = action.type === 'update_contact' ? CONTACT_ALLOWED_FIELDS : DEAL_ALLOWED_FIELDS;
    const sanitizedChanges: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(action.changes)) {
      if (allowedFields.has(key)) {
        sanitizedChanges[key] = value;
      }
    }
    action.changes = sanitizedChanges;
    const { userId, space } = auth;

    let result: NextResponse;
    if (action.type === 'update_contact') {
      result = await handleContactUpdate(action, space.id, userId, req);
    } else if (action.type === 'update_deal') {
      result = await handleDealUpdate(action, space.id, userId, req);
    } else {
      return NextResponse.json({ error: `Unknown action type: ${action.type}` }, { status: 400 });
    }

    // On success, mark the action as applied in the stored message
    if (result.status === 200 && conversationId && action.id) {
      markActionApplied(conversationId, action.id).catch((err) =>
        console.error('[ai/action] failed to mark applied:', err)
      );
    }

    return result;

  } catch (err) {
    console.error('[ai/action] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Replace <<ACTION>>json<</ACTION>> with <<APPLIED>>json<</APPLIED>> in the
 * stored message so the action card renders as "approved" on reload.
 */
async function markActionApplied(conversationId: string, actionId: string) {
  // Find recent assistant messages in this conversation
  const { data: msgs } = await supabase
    .from('Message')
    .select('id, content')
    .eq('conversationId', conversationId)
    .eq('role', 'assistant')
    .order('createdAt', { ascending: false })
    .limit(10);

  if (!msgs) return;

  const escapedId = actionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<<ACTION>>([\\s\\S]*?"id"\\s*:\\s*"${escapedId}"[\\s\\S]*?)(?:<<\\/ACTION>>|<\\/ACTION>>?)`,
    'g'
  );

  for (const msg of msgs) {
    const updated = msg.content.replace(pattern, '<<APPLIED>>$1<</APPLIED>>');
    if (updated !== msg.content) {
      await supabase
        .from('Message')
        .update({ content: updated })
        .eq('id', msg.id);
      return;
    }
  }
}

async function resolveContact(
  actionId: string | undefined,
  summary: string | undefined,
  spaceId: string,
): Promise<any | null> {
  // Try by ID first
  if (actionId) {
    const { data: rows, error } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', actionId)
      .eq('spaceId', spaceId);
    if (!error && rows && rows.length > 0) return rows[0];
  }

  // Fallback: extract a name from the summary and search by name
  if (summary) {
    // Common patterns: "Add note to Preston Wilms", "Update Preston Wilms's email"
    const nameHints = extractNameFromSummary(summary);
    for (const name of nameHints) {
      const { data: rows, error } = await supabase
        .from('Contact')
        .select('*')
        .eq('spaceId', spaceId)
        .ilike('name', name)
        .limit(1);
      if (!error && rows && rows.length > 0) return rows[0];
    }
  }

  return null;
}

async function resolveDeal(
  actionId: string | undefined,
  summary: string | undefined,
  spaceId: string,
): Promise<any | null> {
  if (actionId) {
    const { data: rows, error } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', actionId)
      .eq('spaceId', spaceId);
    if (!error && rows && rows.length > 0) return rows[0];
  }

  if (summary) {
    const nameHints = extractNameFromSummary(summary);
    for (const name of nameHints) {
      const { data: rows, error } = await supabase
        .from('Deal')
        .select('*')
        .eq('spaceId', spaceId)
        .ilike('title', name)
        .limit(1);
      if (!error && rows && rows.length > 0) return rows[0];
    }
  }

  return null;
}

/**
 * Extract plausible entity names from an action summary string.
 * E.g. "Add note to Preston Wilms" → ["Preston Wilms"]
 *      "Update John Smith's email" → ["John Smith"]
 */
function extractNameFromSummary(summary: string): string[] {
  const names: string[] = [];

  // Pattern: "... to <Name>" or "... for <Name>"
  const toMatch = summary.match(/(?:to|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
  if (toMatch) names.push(toMatch[1]);

  // Pattern: "<Name>'s ..."
  const possMatch = summary.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)(?:'s|'s)/);
  if (possMatch) names.push(possMatch[1]);

  // Pattern: "Update <Name>" (2+ capitalized words at start after verb)
  const updateMatch = summary.match(/^(?:Update|Change|Set|Edit|Modify)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i);
  if (updateMatch) names.push(updateMatch[1]);

  return [...new Set(names)];
}

async function handleContactUpdate(
  action: { id?: string; summary?: string; changes: Record<string, unknown> },
  spaceId: string,
  userId: string,
  req: NextRequest,
) {
  const contact = await resolveContact(action.id, action.summary, spaceId);
  if (!contact) {
    console.error('[ai/action] contact not found — id:', action.id, 'summary:', action.summary);
    return NextResponse.json(
      { error: 'Contact not found — the AI may have used an incorrect ID' },
      { status: 404 },
    );
  }
  console.log('[ai/action] resolved contact:', contact.id, contact.name, '(requested id:', action.id, ')');

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const body = action.changes;

  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email ?? null;
  if (body.phone !== undefined) updates.phone = body.phone ?? null;
  if (body.address !== undefined) updates.address = body.address ?? null;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  if (body.preferences !== undefined) updates.preferences = body.preferences ?? null;
  if (body.tags !== undefined) updates.tags = body.tags ?? [];
  if (body.sourceLabel !== undefined) updates.sourceLabel = body.sourceLabel;
  if (body.budget !== undefined) {
    const budgetVal = body.budget != null && body.budget !== '' ? parseFloat(String(body.budget)) : null;
    if (budgetVal !== null && isNaN(budgetVal)) {
      return NextResponse.json({ error: 'Invalid budget' }, { status: 400 });
    }
    updates.budget = budgetVal;
  }
  if (body.type !== undefined) {
    const VALID_CONTACT_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'];
    if (!VALID_CONTACT_TYPES.includes(String(body.type))) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    updates.type = body.type;
    if (body.type !== contact.type) {
      updates.stageChangedAt = new Date().toISOString();
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('Contact')
    .update(updates)
    .eq('id', contact.id)
    .select()
    .single();

  if (updateError) {
    console.error('[ai/action] contact update error:', updateError);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }

  syncContact(updated as Contact).catch(console.error);
  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Contact', resourceId: contact.id, spaceId, req });

  return NextResponse.json(updated);
}

async function handleDealUpdate(
  action: { id?: string; summary?: string; changes: Record<string, unknown> },
  spaceId: string,
  userId: string,
  req: NextRequest,
) {
  const deal = await resolveDeal(action.id, action.summary, spaceId);
  if (!deal) {
    return NextResponse.json(
      { error: 'Deal not found — the AI may have used an incorrect ID' },
      { status: 404 },
    );
  }

  const body = action.changes;

  const VALID_STATUSES = ['active', 'won', 'lost', 'on_hold'];
  if (body.status !== undefined && !VALID_STATUSES.includes(String(body.status))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const valueVal = body.value != null && body.value !== '' ? parseFloat(String(body.value)) : null;
  if (valueVal !== null && isNaN(valueVal)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }

  const updateObj: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updateObj.title = body.title;
  if (body.description !== undefined) updateObj.description = body.description ?? null;
  if (body.value !== undefined) updateObj.value = valueVal;
  if (body.address !== undefined) updateObj.address = body.address ?? null;
  if (body.priority !== undefined) updateObj.priority = body.priority;
  if (body.status !== undefined) updateObj.status = body.status;
  if (body.closeDate !== undefined) {
    if (!body.closeDate) {
      updateObj.closeDate = null;
    } else {
      const d = new Date(String(body.closeDate));
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
      updateObj.closeDate = d.toISOString();
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('Deal')
    .update(updateObj)
    .eq('id', deal.id)
    .select()
    .single();

  if (updateError) {
    console.error('[ai/action] deal update error:', updateError);
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 });
  }

  syncDeal(updated as Deal & { stage: DealStage | null }).catch(console.error);
  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Deal', resourceId: deal.id, spaceId, req });

  return NextResponse.json(updated);
}
