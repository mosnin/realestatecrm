import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/ai/realtime-session
 * Mints an ephemeral OpenAI Realtime token and returns it with CRM context
 * for the session instructions. The browser uses this token to connect
 * directly to OpenAI's Realtime API via WebRTC.
 */
export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`realtime:session:${userId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Build CRM context for the voice session
  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, type, email, phone, budget, leadScore, scoreLabel, notes, tags')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(50),
    supabase
      .from('Deal')
      .select('id, title, value, priority, status, address, DealStage(name)')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(30),
  ]);

  const contactCtx = (contacts ?? []).map((c: any) =>
    `- ${c.name} (${c.type}) | Score: ${c.scoreLabel ?? 'unscored'} | ${c.phone ?? ''} | ${c.email ?? ''} | Budget: ${c.budget != null ? `$${c.budget}` : 'N/A'}`
  ).join('\n');

  const dealCtx = (deals ?? []).map((d: any) =>
    `- ${d.title} | Stage: ${d.DealStage?.name ?? 'N/A'} | Value: ${d.value != null ? `$${d.value}` : 'N/A'} | ${d.address ?? ''}`
  ).join('\n');

  const instructions = [
    `You are Chip, an intelligent voice assistant for the real estate CRM workspace "${space.name}".`,
    `You help the agent manage their rental leads, deals, tours, and follow-ups through natural conversation.`,
    `Be concise and conversational — you're speaking, not writing. Keep responses under 3 sentences unless asked for detail.`,
    `Only reference data from the CRM context below. Never fabricate names, numbers, or details.`,
    ``,
    contactCtx ? `Contacts:\n${contactCtx}` : 'No contacts yet.',
    ``,
    dealCtx ? `Deals:\n${dealCtx}` : 'No deals yet.',
  ].join('\n');

  // Mint ephemeral token from OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

  try {
    const tokenRes = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'coral',
        instructions,
        modalities: ['audio', 'text'],
        turn_detection: { type: 'server_vad' },
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[realtime-session] OpenAI token error:', err);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    const data = await tokenRes.json();
    return NextResponse.json({
      token: data.client_secret?.value,
      expiresAt: data.client_secret?.expires_at,
    });
  } catch (err) {
    console.error('[realtime-session] error:', err);
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }
}
