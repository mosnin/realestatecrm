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
 * OAuth 2.0 Client Credentials Grant
 *
 * Claude sends: grant_type=client_credentials, client_id=xxx, client_secret=xxx
 * We return: { access_token, token_type: "bearer", expires_in }
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = await checkRateLimit(`mcp:oauth:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  let clientId: string | null = null;
  let clientSecret: string | null = null;

  // Support both form-urlencoded (OAuth standard) and JSON
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    clientId = params.get('client_id');
    clientSecret = params.get('client_secret');
  } else {
    try {
      const body = await req.json();
      clientId = body.client_id;
      clientSecret = body.client_secret;
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
  }

  // Also check Basic auth header (some OAuth clients send credentials there)
  if (!clientId || !clientSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Basic ')) {
      try {
        const decoded = atob(authHeader.slice(6));
        const [id, secret] = decoded.split(':');
        clientId = id;
        clientSecret = secret;
      } catch { /* ignore */ }
    }
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'invalid_request',
      error_description: 'client_id and client_secret are required',
    }, { status: 400 });
  }

  // Validate credentials
  const secretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');

  const { data: key } = await supabase
    .from('McpApiKey')
    .select('spaceId, clientSecretHash')
    .eq('clientId', clientId)
    .maybeSingle();

  if (!key || key.clientSecretHash !== secretHash) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
  }

  // Update last used
  supabase
    .from('McpApiKey')
    .update({ lastUsedAt: new Date().toISOString() })
    .eq('clientId', clientId)
    .then(() => {});

  // Issue a short-lived JWT
  const expiresIn = 3600; // 1 hour
  const token = await new SignJWT({ spaceId: key.spaceId, sub: clientId })
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
