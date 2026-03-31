import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.MCP_JWT_SECRET || process.env.CLERK_SECRET_KEY || 'chippi-mcp-secret-change-me'
);

/**
 * POST /api/mcp/oauth/token
 * Handles two grant types:
 * 1. authorization_code (with PKCE) — Claude's MCP connector flow
 * 2. client_credentials — direct API usage
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = await checkRateLimit(`mcp:oauth:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  // Parse request body (supports form-urlencoded and JSON)
  let params: Record<string, string> = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const urlParams = new URLSearchParams(text);
    urlParams.forEach((v, k) => { params[k] = v; });
  } else {
    try {
      params = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
  }

  // Also extract credentials from Basic auth header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        params.client_id = params.client_id || decoded.slice(0, colonIdx);
        params.client_secret = params.client_secret || decoded.slice(colonIdx + 1);
      }
    } catch { /* ignore */ }
  }

  const grantType = params.grant_type;

  // ── Authorization Code Grant (Claude's MCP connector flow) ──
  if (grantType === 'authorization_code') {
    const { code, code_verifier, client_id, client_secret, redirect_uri } = params;

    console.log('[mcp/token] authorization_code grant', { code: code?.slice(0, 8), hasVerifier: !!code_verifier, client_id, redirect_uri });

    if (!code || !code_verifier) {
      console.error('[mcp/token] missing code or code_verifier');
      return NextResponse.json({ error: 'invalid_request', error_description: 'code and code_verifier required' }, { status: 400 });
    }

    // Look up the authorization code
    const { data: authCode, error: codeError } = await supabase
      .from('McpAuthCode')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (codeError) {
      console.error('[mcp/token] code lookup error:', codeError);
    }
    if (!authCode) {
      console.error('[mcp/token] code not found in DB');
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Invalid or expired code' }, { status: 400 });
    }
    console.log('[mcp/token] code found, spaceId:', authCode.spaceId, 'expires:', authCode.expiresAt);

    // Check expiration
    if (new Date(authCode.expiresAt) < new Date()) {
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'Code expired' }, { status: 400 });
    }

    // Verify PKCE code_challenge
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    console.log('[mcp/token] PKCE check:', { expected: expectedChallenge.slice(0, 10), stored: authCode.codeChallenge?.slice(0, 10), match: expectedChallenge === authCode.codeChallenge });
    if (expectedChallenge !== authCode.codeChallenge) {
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400 });
    }

    // Verify redirect_uri matches
    if (redirect_uri && redirect_uri !== authCode.redirectUri) {
      await supabase.from('McpAuthCode').delete().eq('code', code);
      return NextResponse.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400 });
    }

    // Delete the code (single-use)
    await supabase.from('McpAuthCode').delete().eq('code', code);

    // Update last used on the MCP key
    if (authCode.clientId) {
      supabase.from('McpApiKey').update({ lastUsedAt: new Date().toISOString() }).eq('clientId', authCode.clientId).then(() => {});
    }

    // Issue JWT
    const expiresIn = 3600;
    const token = await new SignJWT({ spaceId: authCode.spaceId, sub: authCode.clientId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(JWT_SECRET);

    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: expiresIn,
    });
  }

  // ── Client Credentials Grant (direct API) ──
  if (grantType === 'client_credentials' || !grantType) {
    const { client_id, client_secret } = params;

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'client_id and client_secret required' }, { status: 400 });
    }

    const secretHash = crypto.createHash('sha256').update(client_secret).digest('hex');
    const { data: key } = await supabase
      .from('McpApiKey')
      .select('spaceId, clientSecretHash')
      .eq('clientId', client_id)
      .maybeSingle();

    if (!key || key.clientSecretHash !== secretHash) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
    }

    supabase.from('McpApiKey').update({ lastUsedAt: new Date().toISOString() }).eq('clientId', client_id).then(() => {});

    const expiresIn = 3600;
    const token = await new SignJWT({ spaceId: key.spaceId, sub: client_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(JWT_SECRET);

    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: expiresIn,
    });
  }

  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}
