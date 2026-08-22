import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncContact } from '@/lib/vectorize';
import { notifyNewContact } from '@/lib/notify';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { fireFirstTouch } from '@/lib/leads/first-touch';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import { normalizeLeadSource } from '@/lib/lead-source';
import {
  applyLeadOrgFilters,
  mergeSavedViewFilters,
  parseLeadOrgFilters,
  LEAD_ORG_EMPTY_ID,
  type LeadOrgFilters,
} from '@/lib/leads/org-filters';
import type { Contact } from '@/lib/types';
import { tenantTable } from '@/lib/tenant-db';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  let search = req.nextUrl.searchParams.get('search') ?? '';
  // Snooze hygiene: by default hide currently-snoozed contacts from the main
  // People view. Callers that need them (e.g. a "Snoozed" tab, or the
  // command palette fuzzy search) can pass ?includeSnoozed=1. First-class
  // `status=` wins when present.
  const includeSnoozed = req.nextUrl.searchParams.get('includeSnoozed') === '1';
  const onlySnoozed = req.nextUrl.searchParams.get('onlySnoozed') === '1';

  const hydrated = await hydrateListFilters(parseLeadOrgFilters(req.nextUrl.searchParams), space.id);
  let org = hydrated.filters;
  if (!search && hydrated.search) search = hydrated.search;
  if (org.status == null) {
    if (onlySnoozed) org = { ...org, status: 'snoozed' };
    else if (includeSnoozed) org = { ...org, status: 'all' };
    else org = { ...org, status: 'active' };
  }

  let query = tenantTable(supabase, 'Contact', { spaceId: space.id })
    .select('*')
    .is('brokerageId', null); // Exclude brokerage leads — those show on /broker/leads

  query = applyLeadOrgFilters(query, org, { spaceId: space.id, ownerId: space.ownerId });

  if (search) {
    // Cap length to prevent expensive full-table-scan patterns
    const limitedSearch = search.slice(0, 100).trim().toLowerCase();
    // Forgiving multi-token search:
    //   - split on whitespace into tokens
    //   - each non-empty token must match (AND across tokens, via chained .or())
    //   - each token can match ANY of name/email/phone/preferences (OR within token)
    // Example: "jane hot" matches a contact named "Jane" tagged "hot".
    const tokens = limitedSearch
      .split(/\s+/)
      .filter((t) => t.length > 0)
      // Cap the number of tokens to avoid pathological queries
      .slice(0, 8);

    for (const token of tokens) {
      // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
      const escaped = token.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      // Strip PostgREST filter-breaking characters (commas, parens)
      const sanitized = escaped.replace(/[,()]/g, '');
      if (!sanitized) continue;
      const pattern = `%${sanitized}%`;
      // Chained .or() calls are AND-combined by PostgREST, giving us
      // "(field OR field OR ...) AND (field OR field OR ...)" across tokens.
      query = query.or(
        `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},preferences.ilike.${pattern}`
      );
    }
  }

  // Pagination: default 500, max 1000
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '500', 10);
  const offsetParam = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(1, limitParam || 500), 1000);
  const offset = Math.max(0, offsetParam || 0);

  const { data: contacts, error } = await query
    .order('createdAt', { ascending: false })
    // CSV imports intentionally share one timestamp across a batch. The
    // unique secondary key keeps offset pages deterministic at tie boundaries
    // so a 500-row fetch loop cannot duplicate or skip contacts.
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[contacts/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }

  return NextResponse.json(contacts as Contact[]);
}

/**
 * Load a space-scoped SavedView when `list=` is set and fold its filters in.
 * A list id from another workspace matches zero rows here — we force the
 * contact query empty rather than silently ignore the cut or leak the view.
 */
async function hydrateListFilters(
  filters: LeadOrgFilters,
  spaceId: string,
): Promise<{ filters: LeadOrgFilters; search: string | null }> {
  if (!filters.list) return { filters, search: null };

  const { data, error } = await tenantTable(supabase, 'SavedView', { spaceId })
    .select('filters')
    .eq('id', filters.list)
    .maybeSingle();
  if (error || !data) {
    return { filters: { ...filters, owner: LEAD_ORG_EMPTY_ID }, search: null };
  }
  const viewFilters = (data as { filters?: Record<string, unknown> }).filters;
  const merged = mergeSavedViewFilters(filters, viewFilters);
  const viewSearch =
    viewFilters && typeof viewFilters.search === 'string' ? viewFilters.search : null;
  return { filters: merged, search: viewSearch };
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { slug, name, email, phone, budget, preferences, properties, address, notes, type, tags, source, sourceDetail } = body;

  if (typeof slug !== 'string' || !slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const id = crypto.randomUUID();
  const budgetVal = budget != null && budget !== '' ? parseFloat(budget) : null;
  if (budgetVal !== null && (Number.isNaN(budgetVal) || budgetVal < 0)) {
    return NextResponse.json({ error: 'Invalid budget' }, { status: 400 });
  }

  // Match PATCH's structural bounds — name was the only field validated here,
  // so everything else could land in the DB at any size.
  const emailVal = email ? String(email).trim().slice(0, 254) : null;
  const phoneVal = phone ? String(phone).trim().slice(0, 20) : null;
  const addressVal = address ? String(address).trim().slice(0, 500) : null;
  const notesVal = notes ? String(notes).trim().slice(0, 5000) : null;
  const preferencesVal = preferences ? String(preferences).trim().slice(0, 5000) : null;

  // Dedupe by email (case-insensitive) within this space. The intake flow
  // and CSV imports occasionally re-create the same person — better to
  // hand back the existing record than make the realtor merge later.
  // No new DB constraint: case-mismatched emails would be rejected by a
  // unique index, which may not be desired across all data.
  if (emailVal) {
    const { data: existing, error: dupErr } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
      .select('id')
      .ilike('email', emailVal)
      .limit(1)
      .maybeSingle();
    if (!dupErr && existing) {
      return NextResponse.json(
        { id: existing.id, duplicate: true },
        { status: 200 },
      );
    }
  }

  const propsVal = Array.isArray(properties)
    ? properties
        .filter((p: unknown): p is string => typeof p === 'string')
        .slice(0, 50)
        .map((p) => p.slice(0, 500))
    : [];
  const tagsVal = Array.isArray(tags)
    ? tags
        .filter((t: unknown): t is string => typeof t === 'string')
        .slice(0, 50)
        .map((t) => t.slice(0, 100))
    : [];

  const VALID_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
  const contactType = VALID_TYPES.includes(type) ? type : 'QUALIFICATION';

  // Lead-source attribution. An explicit, valid `source` from the caller wins
  // (API integrations may pass one); otherwise this endpoint represents a
  // manual create. normalizeLeadSource never throws, so a bad value can't crash
  // the create — it simply falls back to 'manual'.
  const sourceVal = normalizeLeadSource(source) ?? 'manual';
  const sourceDetailVal = sourceDetail ? String(sourceDetail).trim().slice(0, 500) : null;

  const { data: contact, error } = await tenantTable(supabase, 'Contact', { spaceId: space.id }).insert({
    id,
    spaceId: space.id,
    name: name.trim().slice(0, 200),
    email: emailVal,
    phone: phoneVal,
    address: addressVal,
    notes: notesVal,
    type: contactType,
    budget: budgetVal,
    preferences: preferencesVal,
    properties: propsVal,
    tags: tagsVal,
    source: sourceVal,
    sourceDetail: sourceDetailVal,
  }).select().single();
  if (error) {
    console.error('[contacts/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }

  // Async vectorization — don't block the response
  syncContact(contact as Contact).catch(console.error);

  // SMS notification for new leads
  try {
    await notifyNewContact({
      spaceId: space.id,
      contactName: name,
      contactPhone: phoneVal,
      contactEmail: emailVal,
      tags: tagsVal,
    });
  } catch (e) { console.error('[contacts] notification failed:', e); }

  // Fire the agent trigger so Chippi can act on the new lead in real time
  // instead of waiting for the 4-hour cron sweep. Never lets a trigger
  // failure fail the response — the contact write is what was requested.
  try {
    await fireAgentTrigger({ spaceId: space.id, event: 'new_lead', contactId: contact.id });
  } catch (e) { console.error('[contacts] agent trigger failed:', e); }

  // Instant First Touch (fire-and-forget) — this endpoint is a genuinely-new
  // single lead (dupes returned early above; bulk CSV import is a separate
  // route that deliberately does NOT get this). fireFirstTouch never throws
  // and registers its own after() keep-alive, so it adds zero latency here.
  try {
    void fireFirstTouch({ spaceId: space.id, contactId: contact.id, origin: 'manual' });
  } catch (e) { console.error('[contacts] first-touch dispatch failed:', e); }

  // Also dispatch the lead_created WORKFLOW trigger for manually-created leads.
  // Previously lead_created was emitted ONLY from the public /apply form, so a
  // lead added by hand in the CRM never fired "when a new lead is created"
  // workflows. Runs post-response via after(). NOTE: bulk import
  // (app/api/contacts/import) intentionally does NOT fan out per-row workflow
  // runs — a several-hundred-row import would otherwise flood the executor; that
  // path is handled separately if/when per-import automation is wanted.
  const createdContact = contact as unknown as Record<string, unknown>;
  const createdSpaceId = space.id;
  after(async () => {
    try {
      await runWorkflowsForEvent({
        spaceId: createdSpaceId,
        triggerType: 'lead_created',
        context: { event: { type: 'lead_created' }, lead: createdContact, contact: createdContact },
        triggerEvent: { type: 'lead_created', contactId: contact.id },
      });
    } catch (e) {
      console.error('[contacts/POST] lead_created workflow dispatch failed', e);
    }
  });

  return NextResponse.json(contact, { status: 201 });
}
