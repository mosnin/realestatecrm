import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import { unscoped } from '@/lib/supabase-guard';


function getJwtSecret(): Uint8Array {
  // Dedicated secret only — no CLERK_SECRET_KEY fallback (keep MCP token
  // signing and Clerk session signing in separate trust domains). Must match
  // the verifier in app/api/mcp/route.ts.
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret) throw new Error('MCP_JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

/**
 * POST /api/mcp/oauth/token
 * Handles:
 * 1. authorization_code (with PKCE) — Claude's MCP connector
 * 2. client_credentials — direct API usage
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`mcp:oauth:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  let params: Record<string,string> = {};
  try {
    const text=await req.text();
    if(text.length>16384)throw new Error('body too large');
    if((req.headers.get('content-type')??'').includes('application/json')){
      const value=JSON.parse(text);
      if(!value || typeof value!=='object' || Array.isArray(value) || Object.values(value).some(v=>typeof v!=='string'))throw new Error('invalid body');
      params=value;
    }else{
      const fields=new URLSearchParams(text);
      for(const key of fields.keys())if(fields.getAll(key).length!==1)throw new Error('duplicate parameter');
      params=Object.fromEntries(fields);
    }
  } catch {return NextResponse.json({error:'invalid_request'},{status:400});}

  // Extract from Basic auth header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        if (!params.client_id) params.client_id = decoded.slice(0, colonIdx);
        if (!params.client_secret) params.client_secret = decoded.slice(colonIdx + 1);
      }
    } catch { /* ignore */ }
  }

  const grantType = params.grant_type;


  // ── Authorization Code Grant (Claude PKCE flow) ──
  if (grantType === 'authorization_code') {
    const { code, code_verifier, redirect_uri, client_id } = params;
    const invalid = () => NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (!code || typeof code !== 'string' || !client_id || !redirect_uri || typeof code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier)) return invalid();
    let secret: Uint8Array;
    try { secret = getJwtSecret(); } catch { return NextResponse.json({error:'temporarily_unavailable'},{status:503}); }
    const storedCode=code.startsWith('chippi_ac_')?crypto.createHash('sha256').update(code).digest('hex'):code;
    const {data:authCode,error} = await unscoped(supabase.from('McpAuthCode'), 'oauth/capability: lookup by clientId or hashed key then verify').select('*').eq('code',storedCode).eq('clientId',client_id).maybeSingle();
    if(error) return NextResponse.json({error:'server_error'},{status:500});
    if(!authCode || authCode.redirectUri !== redirect_uri || authCode.codeChallengeMethod !== 'S256' || new Date(authCode.expiresAt).getTime() <= Date.now()) return invalid();
    const challenge=crypto.createHash('sha256').update(code_verifier).digest('base64url');
    const equal=(a:string,b:string)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
    if(!equal(challenge,authCode.codeChallenge)) return invalid();
    if(authCode.stateHash && (!params.state || !equal(crypto.createHash('sha256').update(`${authCode.stateNonce}:${params.state}`).digest('hex'),authCode.stateHash))) return invalid();
    const {data:key}=await unscoped(supabase.from('McpApiKey'),'oauth/capability: lookup by clientId or hashed key then verify').select('spaceId, expiresAt').eq('clientId',client_id).maybeSingle();
    if(!key || key.spaceId!==authCode.spaceId || (key.expiresAt && new Date(key.expiresAt).getTime()<=Date.now())) return invalid();
    // DELETE RETURNING is the single atomic claim. Concurrent redemptions can
    // both read above, but only one can consume and receive this row.
    const {data:consumed,error:consumeError}=await unscoped(supabase.from('McpAuthCode'),'oauth/capability: lookup by clientId or hashed key then verify').delete().eq('code',storedCode).eq('clientId',client_id).eq('redirectUri',redirect_uri).eq('codeChallenge',challenge).gt('expiresAt',new Date().toISOString()).select('spaceId, clientId').maybeSingle();
    if(consumeError || !consumed) return invalid();
    const token=await new SignJWT({spaceId:consumed.spaceId,sub:consumed.clientId,scope:'crm:read'}).setProtectedHeader({alg:'HS256'}).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('1h').sign(secret);
    return NextResponse.json({access_token:token,token_type:'Bearer',expires_in:3600,scope:'crm:read'},{headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});
  }

  // ── Client Credentials Grant ──
  if (grantType === 'client_credentials' || !grantType) {
    const { client_id, client_secret } = params;

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'client_id and client_secret required' }, { status: 400 });
    }

    const secretHash = crypto.createHash('sha256').update(client_secret).digest('hex');
    const { data: key } = await unscoped(supabase
      .from('McpApiKey'), 'oauth/capability: lookup by clientId or hashed key then verify')
      .select('spaceId, clientSecretHash, expiresAt')
      .eq('clientId', client_id)
      .maybeSingle();

    // Constant-time compare on the hash so a remote timing oracle can't
    // be used to discover early-matching prefix bytes. SHA-256 of a
    // 256-bit-entropy secret makes this academic, but it's the right
    // default for credential paths.
    const expectedHash = key?.clientSecretHash ?? '';
    const a = Buffer.from(expectedHash);
    const b = Buffer.from(secretHash);
    const hashOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!key || !hashOk) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
    }

    // Reject expired keys. NULL expiresAt = legacy key, treated as never
    // expires for backward compat. See 20260607000012 migration.
    if (key.expiresAt && new Date(key.expiresAt as string).getTime() < Date.now()) {
      return NextResponse.json({ error: 'invalid_client', error_description: 'key expired' }, { status: 401 });
    }

    unscoped(supabase.from('McpApiKey'), 'oauth/capability: lookup by clientId or hashed key then verify').update({ lastUsedAt: new Date().toISOString() }).eq('clientId', client_id).then(() => {});

    let jwtSecret: Uint8Array;
    try {
      jwtSecret = getJwtSecret();
    } catch {
      return NextResponse.json({ error: 'MCP not configured' }, { status: 500 });
    }

    const expiresIn = 3600; // 1 hour
    const token = await new SignJWT({ spaceId: key.spaceId, sub: client_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(jwtSecret);

    return NextResponse.json({ access_token: token, token_type: 'bearer', expires_in: expiresIn });
  }

  console.error('[mcp/token] unsupported grant_type:', grantType);
  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://claude.ai",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
