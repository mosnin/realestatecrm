import type {NextRequest} from 'next/server';
import {jwtVerify} from 'jose';
import crypto from 'node:crypto';
import {supabase} from '@/lib/supabase';
import {getClientIp} from '@/lib/rate-limit';
import {tenantTable} from '@/lib/tenant-db';
import {unscoped} from '@/lib/supabase-guard';

export async function authenticateKey(req: NextRequest): Promise<{ spaceId: string; ip: string } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (token.length < 10 || token.length > 500) return null;

  const ip = getClientIp(req);

  // Try JWT first (OAuth flow)
  if (token.includes('.')) {
    // Dedicated secret only — never fall back to CLERK_SECRET_KEY. Signing MCP
    // access tokens (which carry spaceId + grant CRM read) with the Clerk
    // secret couples two trust domains: a flaw in either implicates both.
    const secret = process.env.MCP_JWT_SECRET;
    if (!secret) return null; // No dedicated MCP secret configured — cannot verify JWTs
    const JWT_SECRET = new TextEncoder().encode(secret);
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, {algorithms:['HS256']});
      if (payload.spaceId && typeof payload.spaceId === 'string' && typeof payload.sub === 'string') {
        const {data:key,error:keyError}=await unscoped(supabase.from('McpApiKey'),'oauth/capability: lookup by clientId or hashed key then verify').select('spaceId, expiresAt').eq('clientId',payload.sub).maybeSingle();
        if(keyError || !key || key.spaceId!==payload.spaceId || (key.expiresAt && new Date(key.expiresAt).getTime()<=Date.now()))return null;
        const {data:revoked,error:revocationError}=await tenantTable(supabase,'McpOAuthRevocation',{spaceId:payload.spaceId}).select('tokenHash').eq('tokenHash',crypto.createHash('sha256').update(token).digest('hex')).maybeSingle();
        if(revocationError || revoked)return null;
        return { spaceId: payload.spaceId, ip };
      }
    } catch {
      // Not a valid JWT — fall through to API key check
    }
  }

  // Fall back to raw API key hash lookup. `expiresAt` is read so the
  // verification path can reject keys whose TTL has passed — see the
  // 20260607000012_mcp_key_expiry migration. NULL expiresAt = legacy key,
  // never expires (preserves backward compat for existing integrations).
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await unscoped(supabase
    .from('McpApiKey'), 'oauth/capability: lookup by clientId or hashed key then verify')
    .select('spaceId, expiresAt')
    .eq('keyHash', keyHash)
    .maybeSingle();

  if (!data) return null;
  if (data.expiresAt && new Date(data.expiresAt as string).getTime() < Date.now()) {
    return null;
  }

  unscoped(supabase
    .from('McpApiKey'), 'oauth/capability: lookup by clientId or hashed key then verify')
    .update({ lastUsedAt: new Date().toISOString() })
    .eq('keyHash', keyHash)
    .then(({ error }) => { if (error) console.error('[mcp] lastUsedAt update failed:', error.message); });

  return { spaceId: data.spaceId, ip };
}

