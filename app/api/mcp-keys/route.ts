import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import crypto from 'crypto';

// GET /api/mcp-keys?slug=xxx — list all MCP API keys for the user's space
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('McpApiKey')
    .select('id, name, keyPrefix, lastUsedAt, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false });

  if (error)
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/mcp-keys — generate a new MCP API key (returns the full key ONCE)
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  let name = 'Default';
  try {
    const body = await req.json();
    if (body.name && typeof body.name === 'string') {
      name = body.name.slice(0, 100);
    }
  } catch {
    // body may be empty — that's fine, use default name
  }

  const rawKey = `chippi_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';

  const { data, error } = await supabase
    .from('McpApiKey')
    .insert({
      spaceId: space.id,
      name,
      keyHash,
      keyPrefix,
    })
    .select('id, name, keyPrefix, createdAt')
    .single();

  if (error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });

  return NextResponse.json({ ...data, key: rawKey }, { status: 201 });
}
