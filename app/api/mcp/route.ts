import { NextRequest } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Auth – validate Bearer token against hashed MCP API keys
// ---------------------------------------------------------------------------
async function authenticateKey(req: NextRequest): Promise<{ spaceId: string; ip: string } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const key = auth.slice(7);
  if (key.length < 10 || key.length > 200) return null; // basic length check
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const { data } = await supabase
    .from('McpApiKey')
    .select('spaceId')
    .eq('keyHash', keyHash)
    .maybeSingle();

  if (!data) return null;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Update last-used timestamp (non-blocking, with error logging)
  supabase
    .from('McpApiKey')
    .update({ lastUsedAt: new Date().toISOString() })
    .eq('keyHash', keyHash)
    .then(({ error }) => { if (error) console.error('[mcp] lastUsedAt update failed:', error.message); });

  return { spaceId: data.spaceId, ip };
}

// ---------------------------------------------------------------------------
// Build an McpServer scoped to a given spaceId (READ-ONLY tools)
// ---------------------------------------------------------------------------
function buildServer(spaceId: string): McpServer {
  const server = new McpServer({
    name: 'Chippi CRM',
    version: '1.0.0',
  });

  // ── list_contacts ──
  server.tool(
    'list_contacts',
    'List contacts in your CRM. Optionally filter by type or search query.',
    {
      query: z.string().optional().describe('Search by name, email, or phone'),
      type: z
        .enum(['QUALIFICATION', 'TOUR', 'APPLICATION'])
        .optional()
        .describe('Filter by contact type'),
      limit: z.number().int().positive().max(200).optional().default(50).describe('Max results (default 50)'),
    },
    async ({ query, type, limit }) => {
      let q = supabase
        .from('Contact')
        .select(
          'id, name, email, phone, type, leadScore, scoreLabel, budget, followUpAt, tags, createdAt',
        )
        .eq('spaceId', spaceId)
        .order('createdAt', { ascending: false })
        .limit(limit ?? 50);
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error)
        return { content: [{ type: 'text' as const, text: 'Query failed' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? [], null, 2) }] };
    },
  );

  // ── get_contact ──
  server.tool(
    'get_contact',
    'Get full details for a specific contact by ID.',
    { id: z.string().describe('Contact ID') },
    async ({ id }) => {
      const { data, error } = await supabase
        .from('Contact')
        .select('*')
        .eq('id', id)
        .eq('spaceId', spaceId)
        .maybeSingle();
      if (error || !data)
        return { content: [{ type: 'text' as const, text: 'Contact not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── list_deals ──
  server.tool(
    'list_deals',
    'List deals in the pipeline. Optionally filter by status.',
    {
      status: z
        .enum(['active', 'won', 'lost', 'on_hold'])
        .optional()
        .describe('Filter by deal status'),
      limit: z.number().int().positive().max(200).optional().default(30).describe('Max results'),
    },
    async ({ status, limit }) => {
      let q = supabase
        .from('Deal')
        .select(
          'id, title, value, address, priority, status, stageId, followUpAt, createdAt',
        )
        .eq('spaceId', spaceId)
        .order('createdAt', { ascending: false })
        .limit(limit ?? 30);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error)
        return { content: [{ type: 'text' as const, text: 'Query failed' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? [], null, 2) }] };
    },
  );

  // ── get_deal ──
  server.tool(
    'get_deal',
    'Get full details for a specific deal by ID.',
    { id: z.string().describe('Deal ID') },
    async ({ id }) => {
      const { data, error } = await supabase
        .from('Deal')
        .select('*, DealStage(name, color)')
        .eq('id', id)
        .eq('spaceId', spaceId)
        .maybeSingle();
      if (error || !data)
        return { content: [{ type: 'text' as const, text: 'Deal not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── list_tours ──
  server.tool(
    'list_tours',
    'List upcoming and recent tours.',
    {
      status: z
        .enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'])
        .optional(),
      limit: z.number().int().positive().max(200).optional().default(20),
    },
    async ({ status, limit }) => {
      let q = supabase
        .from('Tour')
        .select(
          'id, guestName, guestEmail, guestPhone, propertyAddress, startsAt, endsAt, status, createdAt',
        )
        .eq('spaceId', spaceId)
        .order('startsAt', { ascending: false })
        .limit(limit ?? 20);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error)
        return { content: [{ type: 'text' as const, text: 'Query failed' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? [], null, 2) }] };
    },
  );

  // ── list_notes ──
  server.tool(
    'list_notes',
    'List notes in the workspace.',
    { limit: z.number().int().positive().max(200).optional().default(20) },
    async ({ limit }) => {
      const { data, error } = await supabase
        .from('Note')
        .select('id, title, content, updatedAt')
        .eq('spaceId', spaceId)
        .order('updatedAt', { ascending: false })
        .limit(limit ?? 20);
      if (error)
        return { content: [{ type: 'text' as const, text: 'Query failed' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? [], null, 2) }] };
    },
  );

  // ── get_note ──
  server.tool(
    'get_note',
    'Get a specific note by ID.',
    { id: z.string().describe('Note ID') },
    async ({ id }) => {
      const { data, error } = await supabase
        .from('Note')
        .select('*')
        .eq('id', id)
        .eq('spaceId', spaceId)
        .maybeSingle();
      if (error || !data)
        return { content: [{ type: 'text' as const, text: 'Note not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── follow_ups_due ──
  server.tool(
    'follow_ups_due',
    'Get contacts and deals with follow-ups due today or overdue.',
    {},
    async () => {
      const now = new Date().toISOString();
      const [{ data: contacts }, { data: deals }] = await Promise.all([
        supabase
          .from('Contact')
          .select('id, name, phone, email, followUpAt')
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now)
          .order('followUpAt')
          .limit(30),
        supabase
          .from('Deal')
          .select('id, title, followUpAt')
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now)
          .order('followUpAt')
          .limit(20),
      ]);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { contacts: contacts ?? [], deals: deals ?? [] },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── dashboard_summary ──
  server.tool(
    'dashboard_summary',
    'Get a high-level summary: lead count, deal pipeline value, upcoming tours, overdue follow-ups.',
    {},
    async () => {
      const now = new Date().toISOString();
      const [contactCount, dealAgg, tourCount, followUpCount] = await Promise.all([
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .then((r) => r.count ?? 0),
        supabase
          .from('Deal')
          .select('value')
          .eq('spaceId', spaceId)
          .eq('status', 'active')
          .then((r) => ({
            count: (r.data ?? []).length,
            totalValue: (r.data ?? []).reduce(
              (s: number, d: any) => s + (d.value ?? 0),
              0,
            ),
          })),
        supabase
          .from('Tour')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .in('status', ['scheduled', 'confirmed'])
          .gte('startsAt', now)
          .then((r) => r.count ?? 0),
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now)
          .then((r) => r.count ?? 0),
      ]);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                totalContacts: contactCount,
                activeDeals: dealAgg.count,
                pipelineValue: dealAgg.totalValue,
                upcomingTours: tourCount,
                overdueFollowUps: followUpCount,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── list_calendar_events ──
  server.tool(
    'list_calendar_events',
    'List custom calendar events.',
    { limit: z.number().int().positive().max(200).optional().default(20) },
    async ({ limit }) => {
      const { data } = await supabase
        .from('CalendarEvent')
        .select('id, title, description, date, time, color')
        .eq('spaceId', spaceId)
        .gte('date', new Date().toISOString().slice(0, 10))
        .order('date')
        .limit(limit ?? 20);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// POST /api/mcp — Streamable HTTP MCP endpoint
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Rate limit by IP before auth to prevent brute-force
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed: ipAllowed } = await checkRateLimit(`mcp:ip:${ip}`, 60, 60);
  if (!ipAllowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authResult = await authenticateKey(req);
  if (!authResult) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { spaceId } = authResult;

  // Rate limit by space after auth
  const { allowed: spaceAllowed } = await checkRateLimit(`mcp:space:${spaceId}`, 120, 60);
  if (!spaceAllowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const server = buildServer(spaceId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(req as unknown as Request);
    return response;
  } catch (err: any) {
    console.error('[mcp] error:', err);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/mcp — required by MCP spec for SSE stream (return 405 in stateless)
// DELETE /api/mcp — session termination (no-op in stateless)
// ---------------------------------------------------------------------------
export async function GET() {
  return new Response(JSON.stringify({ error: 'SSE not supported in stateless mode' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ error: 'Sessions not supported in stateless mode' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
